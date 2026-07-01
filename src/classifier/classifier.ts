/**
 * Discovery & Classification Engine (Phase 2).
 *
 * Pure transform: raw-capture.json -> discovery-model.json across all 10
 * categories, with semantic enrichment, discovery-confidence, manual-review
 * tags, dedup, and cross-references. Deterministic: same input -> same output.
 *
 * DISCIPLINE: discovers/classifies/organizes only. No test cases, no pass/fail,
 * no risk scoring. APIs are map-only. Vision would type canvas/chart/custom.
 */

import { LOW_CONFIDENCE_THRESHOLD, SCHEMA_VERSION } from "../core/constants.js";
import { apiId, hash, id, pageArchetypeSlug, slug, titleCase } from "../core/ids.js";
import { makeEnvelope } from "../core/envelope.js";
import type {
  RawCapture,
  CaptureState,
  CapturedComponent,
} from "../core/raw-capture.js";
import type {
  ApiItem,
  BusinessFunctionGroup,
  ComponentItem,
  Confidence,
  DiscoveryModel,
  FeatureItem,
  FlowItem,
  FormItem,
  HiddenItem,
  NavigationItem,
  PageItem,
  RoleItem,
  Semantics,
  StateItem,
} from "../core/types.js";
import { FEATURE_AREAS, inferComponentSemantics } from "./heuristics.js";

const PAYMENT_RE = /pay|checkout|card|upi|wallet/i;
const OTP_RE = /otp|one[- ]?time|2fa/i;
const CAPTCHA_RE = /captcha|recaptcha/i;

function confidenceFromState(state: CaptureState): Confidence {
  let c = 100;
  const s = state.confidenceSignals;
  if (s.reachedBy === "inferred") c -= 25;
  else if (s.reachedBy && s.reachedBy.includes("hidden")) c -= 15;
  if (s.captureCompleteness === "partial") c -= 20;
  if (s.captureCompleteness === "blocked") c -= 40;
  if (s.authTruncated) c -= 30;
  if (s.detectionStrength === "weak") c -= 25;
  else if (s.detectionStrength === "medium") c -= 8;
  c = Math.max(20, Math.min(100, c));
  const out: Confidence = { confidence: c };
  if (c < LOW_CONFIDENCE_THRESHOLD) {
    out.confidenceReason =
      s.authTruncated || s.captureCompleteness !== "full"
        ? "Discovered through partial exploration; authentication or a blocker truncated the crawl."
        : "Discovered through inferred or hidden navigation.";
  }
  return out;
}

function semanticsFor(label: string, type: string, page: string, flowId?: string): Semantics {
  const g = inferComponentSemantics(label, type, page);
  const sem: Semantics = {
    businessFunction: g.businessFunction,
    inferredPurpose: g.inferredPurpose,
    behavior: g.behavior,
    leadsTo: [],
    partOfFlow: flowId ?? null,
    semanticConfidence: g.semanticConfidence,
    semanticConfidenceReason:
      g.semanticConfidence < LOW_CONFIDENCE_THRESHOLD
        ? "Purpose inferred from label/type only; not confirmed by observed navigation."
        : null,
  };
  return sem;
}

export function classify(raw: RawCapture, generatedAt: string): DiscoveryModel {
  const states = Object.values(raw.statesById);
  const rolesCrawled = raw.roles;

  // ---- PAGES (collapse role/data variants by archetype slug) ----
  const pageBySlug = new Map<string, PageItem>();
  for (const st of states) {
    const pslug = pageArchetypeSlug(st.url);
    const pid = id("PAGE", pslug);
    const conf = confidenceFromState(st);
    let p = pageBySlug.get(pslug);
    if (!p) {
      const cleanLabel = cleanPageLabel(st.title, pslug);
      p = {
        id: pid,
        category: "page",
        label: cleanLabel,
        title: st.title || pslug,
        archetype: pslug,
        urlPattern: st.route.replace(/\/\d+/g, "/:id").replace(raw.appUrl, "") || "/",
        sampleUrls: [],
        httpStatusObserved: st.httpStatus,
        authRequired: st.authRequired,
        containsForms: [],
        containsComponents: [],
        knownStates: [],
        entryPoints: [],
        discoverySource: st.discoverySource,
        roleVisibility: [],
        detectionMethod: "dom",
        sourceEvidence: { rawArtifact: raw.artifactId, stateId: st.id, locator: st.url },
        businessFunction: "Page",
        inferredPurpose: `the ${st.title || pslug} page`,
        leadsTo: [],
        partOfFlow: null,
        semanticConfidence: 85,
        semanticConfidenceReason: null,
        manualReview: false,
        ...conf,
      };
      pageBySlug.set(pslug, p);
    }
    if (!p.sampleUrls.includes(st.url) && p.sampleUrls.length < 5) p.sampleUrls.push(st.url);
    if (!p.roleVisibility.includes(st.role)) p.roleVisibility.push(st.role);
    if (st.authRequired) p.authRequired = true;
    p.confidence = Math.max(p.confidence, conf.confidence);
  }

  // ---- COMPONENTS ----
  // Group by a page-INDEPENDENT cross key (selector+label) so the same header /
  // footer / search seen on many pages collapses to one GLOBAL component instead
  // of N page-scoped duplicates.
  interface Gathered { pslug: string; role: string; c: CapturedComponent; st: CaptureState }
  const byCross = new Map<string, Gathered[]>();
  for (const st of states) {
    const pslug = pageArchetypeSlug(st.url);
    for (const c of st.components) {
      const crossKey = hash(c.selector, c.label);
      if (!byCross.has(crossKey)) byCross.set(crossKey, []);
      byCross.get(crossKey)!.push({ pslug, role: st.role, c, st });
    }
  }

  const compById = new Map<string, ComponentItem>();
  const globalComponentIds: string[] = [];
  for (const [crossKey, group] of byCross) {
    const pslugs = Array.from(new Set(group.map((g) => g.pslug))).sort();
    const roles = Array.from(new Set(group.map((g) => g.role))).sort();
    const isGlobal = pslugs.length >= 2;
    const first = group[0];
    const c = first.c;
    const cid = isGlobal ? id("CMP", "global", crossKey) : id("CMP", first.pslug, crossKey);
    const conf = confidenceFromState(first.st);
    const sem = semanticsFor(c.label || c.type, c.type, first.pslug);
    const manual = PAYMENT_RE.test(c.label) || OTP_RE.test(c.label) || CAPTCHA_RE.test(c.label);
    const item: ComponentItem = {
      id: cid,
      category: "component",
      type: c.type || "custom",
      label: c.label || c.type || "element",
      selector: c.selector,
      page: id("PAGE", first.pslug),
      parent: c.parentNodeId ?? null,
      ariaRole: c.role || undefined,
      interactive: c.interactive,
      eventListeners: c.eventListeners,
      stateVariants: deriveStateVariants(c),
      triggersApi: [],
      opensModalOrDrawer: null,
      visionClassified: c.visualHint === "canvas",
      scope: isGlobal ? "global" : "page-local",
      appearsOn: isGlobal ? pslugs.map((p) => id("PAGE", p)) : undefined,
      roleVisibility: roles,
      detectionMethod: c.visualHint === "canvas" ? "vision" : c.role ? "accessibility_tree" : "dom",
      sourceEvidence: { rawArtifact: raw.artifactId, stateId: first.st.id, locator: c.selector },
      ...sem,
      ...conf,
      manualReview: manual,
      manualReviewReason: manual
        ? PAYMENT_RE.test(c.label)
          ? "Payment surface — a human must walk it in a safe environment."
          : OTP_RE.test(c.label)
            ? "OTP surface — out-of-band code cannot be received by the crawler."
            : "CAPTCHA surface — anti-bot challenge blocks automated agents."
        : null,
      blockerType: manual
        ? PAYMENT_RE.test(c.label)
          ? "payment_gateway"
          : OTP_RE.test(c.label)
            ? "otp"
            : "captcha"
        : undefined,
    };
    compById.set(cid, item);
    if (isGlobal) globalComponentIds.push(cid);
  }

  // attach page-local components to their owning page
  for (const comp of compById.values()) {
    if (comp.scope === "global") continue;
    const p = pageBySlug.get(comp.page.replace("PAGE:", ""));
    if (p && !p.containsComponents.includes(comp.id)) p.containsComponents.push(comp.id);
  }

  // ---- NAVIGATION ----
  const navById = new Map<string, NavigationItem>();
  for (const st of states) {
    const pslug = pageArchetypeSlug(st.url);
    const conf = confidenceFromState(st);
    for (const n of st.navs) {
      if (navById.has(n.nodeId)) continue;
      navById.set(n.nodeId, {
        id: n.nodeId,
        category: "navigation",
        type: n.type,
        label: n.label,
        scope: n.scope,
        page: n.scope === "page-local" ? id("PAGE", pslug) : undefined,
        items: n.items,
        revealTrigger: n.revealTrigger,
        selector: n.selector,
        roleVisibility: [st.role],
        detectionMethod: "dom",
        sourceEvidence: { rawArtifact: raw.artifactId, stateId: st.id, locator: n.selector },
        businessFunction: "Navigation",
        inferredPurpose: `${n.type} navigation`,
        behavior: "moves between pages",
        leadsTo: n.items.map((i) => i.target).filter((t) => t.startsWith("/")).slice(0, 10),
        partOfFlow: null,
        semanticConfidence: 85,
        semanticConfidenceReason: null,
        manualReview: false,
        ...conf,
      });
    }
  }

  // ---- FORMS ----
  const formById = new Map<string, FormItem>();
  for (const st of states) {
    const pslug = pageArchetypeSlug(st.url);
    const conf = confidenceFromState(st);
    for (const f of st.forms) {
      if (formById.has(f.nodeId)) continue;
      const required = f.fields.filter((fl) => fl.required).map((fl) => fl.name || fl.label);
      const va = Array.from(new Set(f.fields.flatMap((fl) => fl.validationAttributesObserved)));
      const isPayment = PAYMENT_RE.test(f.name);
      formById.set(f.nodeId, {
        id: f.nodeId,
        category: "form",
        name: f.name,
        label: f.name,
        page: id("PAGE", pslug),
        fields: f.fields.map((fl) => ({
          label: fl.label,
          name: fl.name,
          type: fl.type,
          required: fl.required,
          placeholder: fl.placeholder,
          options: fl.options,
          validationAttributesObserved: fl.validationAttributesObserved,
          cmpId: fl.nodeId,
        })),
        fieldCount: f.fields.length,
        requiredFields: required,
        validationAttributesObserved: va,
        submitControl: f.submitControlNodeId,
        multiStep: f.multiStep,
        fileUploadFields: f.fields.filter((fl) => fl.type === "file").map((fl) => fl.name || fl.label),
        roleVisibility: [st.role],
        detectionMethod: "dom",
        sourceEvidence: { rawArtifact: raw.artifactId, stateId: st.id, locator: f.selector },
        businessFunction: inferComponentSemantics(f.name, "input", pslug).businessFunction,
        inferredPurpose: `collects ${f.name.toLowerCase()} details`,
        leadsTo: [],
        partOfFlow: null,
        semanticConfidence: 82,
        semanticConfidenceReason: null,
        manualReview: isPayment,
        manualReviewReason: isPayment ? "Payment form — walk manually in a safe environment." : null,
        blockerType: isPayment ? "payment_gateway" : undefined,
        ...conf,
      });
      const p = pageBySlug.get(pslug);
      if (p && !p.containsForms.includes(f.nodeId)) p.containsForms.push(f.nodeId);
    }
  }

  // ---- APIs (map only) ----
  const apiByKey = new Map<string, ApiItem>();
  for (const st of states) {
    const pslug = pageArchetypeSlug(st.url);
    for (const r of st.network) {
      const aid = apiId(r.method, r.urlTemplate);
      if (apiByKey.has(aid)) continue;
      const trigger = r.uiActionNodeId;
      apiByKey.set(aid, {
        id: aid,
        category: "api",
        label: `${r.method} ${r.urlTemplate}`,
        triggeringComponent: trigger ?? undefined,
        triggeringAction: trigger ? "click" : "load",
        page: id("PAGE", pslug),
        method: r.method,
        endpointPattern: `${r.method} ${r.urlTemplate}`,
        transport: r.resourceType === "websocket" ? "WebSocket" : "REST",
        sampleStatus: r.status,
        requestShape: r.requestShape,
        authSignalObserved: r.authSignalObserved,
        correlationConfidence: trigger ? "high" : "med",
        roleVisibility: [st.role],
        detectionMethod: "network",
        sourceEvidence: { rawArtifact: raw.artifactId, stateId: st.id, locator: r.urlTemplate },
        businessFunction: "API Correlation",
        inferredPurpose: `${r.method} request correlated to a UI action`,
        leadsTo: [],
        partOfFlow: null,
        semanticConfidence: trigger ? 85 : 70,
        semanticConfidenceReason: trigger ? null : "Correlated to page-load, not a specific control.",
        confidence: trigger ? 90 : 75,
        confidenceReason: trigger ? undefined : "Correlated by timing to page-load rather than a direct listener.",
        manualReview: false,
      });
    }
  }

  // ---- HIDDEN ----
  const hidById = new Map<string, HiddenItem>();
  for (const st of states) {
    const pslug = pageArchetypeSlug(st.url);
    const conf = confidenceFromState(st);
    for (const h of st.hidden) {
      if (hidById.has(h.nodeId)) continue;
      hidById.set(h.nodeId, {
        id: h.nodeId,
        category: "hidden",
        type: h.type,
        label: `${h.type} (${h.revealTrigger})`,
        revealTrigger: h.revealTrigger,
        page: id("PAGE", pslug),
        detectionMethodDetail: h.detectionMethod,
        reproducible: h.reproducible,
        roleVisibility: [st.role],
        detectionMethod: "event_listener",
        sourceEvidence: { rawArtifact: raw.artifactId, stateId: st.id },
        businessFunction: "Hidden Surface",
        inferredPurpose: `revealed by ${h.revealTrigger}`,
        leadsTo: [],
        partOfFlow: null,
        semanticConfidence: 70,
        semanticConfidenceReason: "Reveal target inferred from trigger only.",
        manualReview: false,
        ...conf,
      });
    }
  }

  // ---- STATES ----
  const stateItems = new Map<string, StateItem>();
  for (const st of states) {
    const pslug = pageArchetypeSlug(st.url);
    for (const os of st.observedStates) {
      const sid = id("STATE", pslug, slug(os.type));
      if (stateItems.has(sid)) continue;
      stateItems.set(sid, {
        id: sid,
        category: "state",
        type: os.type,
        label: `${os.type} (${pslug})`,
        appliesTo: id("PAGE", pslug),
        observationCondition: os.observationMethod,
        observationMethod: os.observationMethod,
        detectionSignal: os.detectionSignal,
        observed: true,
        roleContext: st.role,
        roleVisibility: [st.role],
        detectionMethod: "computed_style",
        sourceEvidence: { rawArtifact: raw.artifactId, stateId: st.id },
        businessFunction: "UI State",
        inferredPurpose: `the ${os.type} state`,
        leadsTo: [],
        partOfFlow: null,
        semanticConfidence: 80,
        semanticConfidenceReason: null,
        confidence: 90,
        manualReview: false,
      });
      const p = pageBySlug.get(pslug);
      if (p && !p.knownStates.includes(sid)) p.knownStates.push(sid);
    }
  }
  // declared-not-observed states from telemetry
  for (const notObs of raw.telemetry.statesNotObserved) {
    const sid = id("STATE", "app", slug(notObs));
    if (stateItems.has(sid)) continue;
    stateItems.set(sid, {
      id: sid,
      category: "state",
      type: notObs,
      label: `${notObs} (declared, not observed)`,
      appliesTo: id("PAGE", "home"),
      observationCondition: `would surface under ${notObs} conditions`,
      observationMethod: "declared",
      detectionSignal: "n/a",
      observed: false,
      roleVisibility: rolesCrawled,
      detectionMethod: "dom",
      sourceEvidence: { rawArtifact: raw.artifactId },
      businessFunction: "UI State",
      inferredPurpose: `the ${notObs} state (declared, not observed)`,
      leadsTo: [],
      partOfFlow: null,
      semanticConfidence: 60,
      semanticConfidenceReason: "State was declared but not reached during this crawl.",
      confidence: 60,
      confidenceReason: "Declared but not observed during this crawl.",
      manualReview: false,
    });
  }

  // ---- FEATURES (business capability grouping) ----
  const features = buildFeatures(
    raw,
    Array.from(pageBySlug.values()),
    Array.from(compById.values()),
    Array.from(formById.values()),
    Array.from(apiByKey.values()),
    generatedAt,
  );

  // ---- FLOWS ----
  const flows = buildFlows(raw, Array.from(pageBySlug.values()), features);
  // link component partOfFlow / feature flows already carry flow ids
  for (const f of flows) {
    for (const step of f.steps) {
      if (step.componentId && compById.has(step.componentId)) {
        compById.get(step.componentId)!.partOfFlow = f.id;
      }
    }
  }

  // ---- ROLES ----
  const roles = buildRoles(raw, compById, pageBySlug, formById);

  // ---- BUSINESS FUNCTION GROUPS ----
  const businessFunctions = buildBusinessFunctions(Array.from(compById.values()));

  const envelope = makeEnvelope({
    artifact: "discovery_model",
    artifactId: id("RUN", hash(raw.runId, "model")),
    runId: raw.runId,
    appUrl: raw.appUrl,
    roles: rolesCrawled,
    sourceArtifacts: [`${raw.artifactId}`, "raw-capture.json"],
    generatedAt,
  });

  const model: DiscoveryModel = {
    ...envelope,
    artifact: "discovery_model",
    generatedFrom: raw.artifactId,
    pages: sortById(Array.from(pageBySlug.values())),
    navigation: sortById(Array.from(navById.values())),
    components: sortById(Array.from(compById.values())),
    features: sortById(features),
    flows: sortById(flows),
    hidden: sortById(Array.from(hidById.values())),
    apis: sortById(Array.from(apiByKey.values())),
    forms: sortById(Array.from(formById.values())),
    roles: sortById(roles),
    states: sortById(Array.from(stateItems.values())),
    globalComponents: globalComponentIds.sort(),
    businessFunctions,
  };
  return model;
}

// ---------- helpers ----------

function sortById<T extends { id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id));
}

/** Clean a page label: strip a common site-name prefix ("ShowBook — X" -> "X"). */
function cleanPageLabel(title: string | undefined, pslug: string): string {
  const t = (title || "").trim();
  if (!t) return titleCase(pslug.replace(/-/g, " "));
  if (t.includes(" — ")) {
    const last = t.split(" — ").pop()!.trim();
    return /^[a-z]/.test(last) ? titleCase(last) : last;
  }
  if (t.includes(" - ")) return t.split(" - ").pop()!.trim();
  return t;
}

function addPageRole(
  pageMap: Map<string, Set<string>>,
  roleMap: Map<string, Set<string>>,
  nodeId: string,
  pslug: string,
  role: string,
): void {
  if (!pageMap.has(nodeId)) pageMap.set(nodeId, new Set());
  pageMap.get(nodeId)!.add(pslug);
  if (!roleMap.has(nodeId)) roleMap.set(nodeId, new Set());
  roleMap.get(nodeId)!.add(role);
}

function deriveStateVariants(c: CapturedComponent): string[] {
  const v = ["default"];
  if (c.interactive) v.push("hover", "focus");
  if (c.attributes["disabled"] !== undefined) v.push("disabled");
  if (c.attributes["aria-selected"] || c.attributes["aria-checked"]) v.push("selected");
  return v;
}

function buildFeatures(
  raw: RawCapture,
  pages: PageItem[],
  comps: ComponentItem[],
  forms: FormItem[],
  apis: ApiItem[],
  _generatedAt: string,
): FeatureItem[] {
  const out: FeatureItem[] = [];
  for (const area of FEATURE_AREAS) {
    const mp = pages.filter((p) => area.match.test(p.label + " " + p.archetype));
    const mc = comps.filter((c) => area.match.test(c.label + " " + (c.businessFunction ?? "")));
    const mf = forms.filter((f) => area.match.test(f.name));
    const ma = apis.filter((a) => area.match.test(a.endpointPattern));
    if (mp.length + mc.length + mf.length === 0) continue;
    const evidence = [
      ...mp.slice(0, 3).map((p) => p.label),
      ...mc.slice(0, 3).map((c) => c.label),
    ];
    const roleAvail = Array.from(
      new Set([...mp.flatMap((p) => p.roleVisibility), ...mc.flatMap((c) => c.roleVisibility)]),
    ).sort();
    const conf = mp.length + mc.length >= 3 ? 95 : mp.length + mc.length >= 1 ? 85 : 70;
    out.push({
      id: id("FEAT", area.key),
      category: "business_feature",
      name: area.name,
      label: area.name,
      featureCategory: area.category,
      pages: mp.map((p) => p.id),
      components: mc.slice(0, 20).map((c) => c.id),
      forms: mf.map((f) => f.id),
      flows: [],
      apis: ma.map((a) => a.id),
      entryPoints: mp.slice(0, 2).map((p) => p.id),
      evidence,
      roleVisibility: roleAvail,
      detectionMethod: "dom",
      sourceEvidence: { rawArtifact: raw.artifactId },
      businessFunction: area.name,
      inferredPurpose: `the ${area.name} capability`,
      leadsTo: [],
      partOfFlow: null,
      semanticConfidence: conf,
      semanticConfidenceReason: conf < LOW_CONFIDENCE_THRESHOLD ? "Feature named from limited evidence." : null,
      confidence: conf,
      confidenceReason: conf < LOW_CONFIDENCE_THRESHOLD ? "Feature grouped from limited evidence." : undefined,
      manualReview: false,
    });
  }
  return out;
}

function buildFlows(raw: RawCapture, pages: PageItem[], features: FeatureItem[]): FlowItem[] {
  const flows: FlowItem[] = [];
  const has = (slugPart: string) => pages.find((p) => p.archetype.includes(slugPart));
  // Booking flow
  if (has("movies") || has("movie")) {
    const steps = [
      has("home") && { order: 1, pageId: has("home")!.id, action: "browse" },
      has("movies") && { order: 2, pageId: has("movies")!.id, action: "select movie" },
      has("movies-id") && { order: 3, pageId: has("movies-id")!.id, action: "open details" },
    ].filter(Boolean) as FlowItem["steps"];
    if (steps.length >= 2) {
      flows.push(mkFlow(raw, "booking", "Booking Flow", features.find((f) => f.id === "FEAT:booking")?.id, steps, ["confirmation"]));
    }
  }
  // Auth flow
  if (has("login")) {
    const steps = [
      { order: 1, pageId: has("login")!.id, action: "enter credentials" },
      has("profile") && { order: 2, pageId: has("profile")!.id, action: "reach account" },
    ].filter(Boolean) as FlowItem["steps"];
    flows.push(mkFlow(raw, "login", "Login Flow", "FEAT:authentication", steps, ["dashboard"]));
  }
  // link features -> flows
  for (const fl of flows) {
    if (fl.feature) {
      const feat = features.find((f) => f.id === fl.feature);
      if (feat && !feat.flows.includes(fl.id)) feat.flows.push(fl.id);
    }
  }
  return flows;
}

function mkFlow(
  raw: RawCapture,
  key: string,
  name: string,
  feature: string | undefined,
  steps: FlowItem["steps"],
  terminal: string[],
): FlowItem {
  return {
    id: id("FLOW", key),
    category: "user_flow",
    name,
    label: name,
    feature,
    steps,
    startPoint: steps[0]?.pageId,
    branches: [],
    terminalOutcomes: terminal,
    apiSequence: [],
    crossesRoles: false,
    stepCount: steps.length,
    roleVisibility: raw.roles,
    detectionMethod: "dom",
    sourceEvidence: { rawArtifact: raw.artifactId },
    businessFunction: name,
    inferredPurpose: `the ${name.toLowerCase()}`,
    leadsTo: steps.map((s) => s.pageId).filter(Boolean) as string[],
    partOfFlow: null,
    semanticConfidence: 82,
    semanticConfidenceReason: null,
    confidence: 88,
    manualReview: false,
  };
}

function buildRoles(
  raw: RawCapture,
  compById: Map<string, ComponentItem>,
  pageBySlug: Map<string, PageItem>,
  formById: Map<string, FormItem>,
): RoleItem[] {
  const out: RoleItem[] = [];
  const reachByRole = new Map<string, { pages: Set<string>; comps: Set<string>; forms: Set<string> }>();
  for (const role of raw.roles) reachByRole.set(role, { pages: new Set(), comps: new Set(), forms: new Set() });
  for (const st of Object.values(raw.statesById)) {
    const r = reachByRole.get(st.role);
    if (!r) continue;
    r.pages.add(id("PAGE", pageArchetypeSlug(st.url)));
    for (const c of st.components) r.comps.add(c.nodeId);
    for (const f of st.forms) r.forms.add(f.nodeId);
  }
  const allRoles = raw.roles;
  for (const role of allRoles) {
    const r = reachByRole.get(role)!;
    const others = allRoles.filter((x) => x !== role);
    const exclusive = Array.from(r.pages).filter(
      (pid) => !others.some((o) => reachByRole.get(o)!.pages.has(pid)),
    );
    // denied: pages reachable by some other role but not this one
    const union = new Set<string>();
    for (const o of others) for (const p of reachByRole.get(o)!.pages) union.add(p);
    const denied = Array.from(union).filter((p) => !r.pages.has(p));
    out.push({
      id: id("ROLE", role),
      category: "role",
      name: role,
      label: role,
      authMethod: role === "guest" ? "none" : "form-login",
      reachablePages: Array.from(r.pages).sort(),
      reachableNav: [],
      reachableComponents: Array.from(r.comps).sort(),
      reachableFeatures: [],
      reachableForms: Array.from(r.forms).sort(),
      reachableHidden: [],
      exclusiveItems: exclusive.sort(),
      deniedObserved: denied.sort(),
      roleVisibility: [role],
      detectionMethod: "dom",
      sourceEvidence: { rawArtifact: raw.artifactId },
      businessFunction: "Access Role",
      inferredPurpose: `the ${role} reachable surface`,
      leadsTo: [],
      partOfFlow: null,
      semanticConfidence: 90,
      semanticConfidenceReason: null,
      confidence: 95,
      manualReview: false,
    });
  }
  return out;
}

function buildBusinessFunctions(comps: ComponentItem[]): BusinessFunctionGroup[] {
  const byFn = new Map<string, string[]>();
  for (const c of comps) {
    const fn = c.businessFunction ?? "unknown";
    if (fn === "unknown" || fn === "Interaction" || fn === "Navigation") continue;
    if (!byFn.has(fn)) byFn.set(fn, []);
    byFn.get(fn)!.push(c.id);
  }
  const out: BusinessFunctionGroup[] = [];
  for (const [fn, ids] of byFn) {
    if (ids.length < 2) continue;
    out.push({
      id: id("FEAT", slug(fn) + "-group"),
      name: fn,
      componentIds: ids.sort(),
      confidence: 85,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
