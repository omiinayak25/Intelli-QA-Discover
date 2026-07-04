/**
 * Portal client model — a denormalized, indexed view of the Discovery Model
 * assembled once at generation time and inlined into portal.html. The client
 * SPA reads ONLY this object (no network, no re-derivation), so every view,
 * search, graph, and the AI assistant answer strictly from discovered evidence.
 *
 * DISCIPLINE: this is discovery data. No test cases, no pass/fail, no
 * verification — only what EXISTS and where it was found.
 */

import { titleCase } from "../core/ids.js";
import type { DiscoveryModel } from "../core/types.js";
import type { ReportInputs } from "../builders/report.js";
import type { RawCapture } from "../core/raw-capture.js";

export interface ScreenshotSet {
  desktop?: string;
  tablet?: string;
  mobile?: string;
  width?: number;
  height?: number;
  boxes?: ComponentBox[];
}
export interface ComponentBox {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PortalModel {
  meta: {
    appUrl: string;
    appName: string;
    runId: string;
    generatedAt: string;
    roles: string[];
    schemaVersion: string;
  };
  kpis: Record<string, number>;
  summary: any;
  validation: any;
  overview: any;
  featureTree: any;
  featureRel: any;
  modules: PortalModule[];
  pages: PortalPage[];
  components: PortalComponent[];
  navigation: any[];
  forms: any[];
  flows: any[];
  states: any[];
  hidden: any[];
  apis: any[];
  rolesDetail: any[];
  manualReview: any[];
  checklist: any;
  timeline: TimelineEvent[];
  coverageMap: HeatCell[];
  screenshots: Record<string, ScreenshotSet>;
  searchIndex: SearchEntry[];
}

export interface PortalModule {
  id: string;
  name: string;
  category: string;
  confidence: number;
  confidenceReason?: string | null;
  featureNodeId: string;
  features: { id: string; label: string; children: string[] }[];
  pageIds: string[];
  componentIds: string[];
  formIds: string[];
  flowIds: string[];
  hiddenIds: string[];
  apiIds: string[];
  manualReview: boolean;
}

export interface PortalPage {
  id: string;
  label: string;
  url: string;
  archetype: string;
  roles: string[];
  confidence: number;
  confidenceReason?: string | null;
  authRequired: boolean;
  httpStatus: number | null;
  purpose: string;
  componentIds: string[];
  formIds: string[];
  stateIds: string[];
  moduleIds: string[];
  screenshotKey: string;
}

export interface PortalComponent {
  id: string;
  type: string;
  label: string;
  page: string;
  scope: string;
  appearsOn?: string[];
  confidence: number;
  confidenceReason?: string | null;
  businessFunction?: string;
  inferredPurpose?: string;
  behavior?: string;
  leadsTo?: string[];
  partOfFlow?: string | null;
  selector: string;
  ariaRole?: string;
  triggersApi: string[];
  manualReview: boolean;
  manualReviewReason?: string | null;
}

export interface TimelineEvent {
  seq: number;
  kind: string; // start | page | milestone | blocked | finish
  label: string;
  detail: string;
  refId?: string;
  role?: string;
}

export interface HeatCell {
  id: string;
  label: string;
  kind: string; // module | page
  status: "discovered" | "partial" | "blocked" | "not_reachable";
  confidence: number;
}

export interface SearchEntry {
  id: string;
  label: string;
  kind: string; // page|component|feature|module|form|flow|state|hidden|api
  view: string; // route to navigate to
  hint: string;
  keywords: string;
}

function appNameFrom(url: string, overviewLabel?: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    const base = h.split(".")[0];
    return titleCase(base);
  } catch {
    return overviewLabel || "Application";
  }
}

export function buildPortalModel(
  inp: ReportInputs,
  raw?: RawCapture,
  screenshots: Record<string, ScreenshotSet> = {},
): PortalModel {
  const m: DiscoveryModel = inp.model;
  const compById = new Map(m.components.map((c) => [c.id, c]));
  const pageById = new Map(m.pages.map((p) => [p.id, p]));

  // ---- MODULES = business feature-tree level-1 areas, enriched ----
  const modules: PortalModule[] = inp.featureTree.root.children.map((node: any) => {
    const feat = m.features.find((f) => f.id === node.memberIds.find((x: string) => x.startsWith("FEAT:")));
    const featMembers = feat ?? {
      pages: [] as string[], components: [] as string[], forms: [] as string[], flows: [] as string[], apis: [] as string[],
    };
    const pageIds: string[] = [...(featMembers.pages ?? [])];
    const componentIds: string[] = [...(featMembers.components ?? [])];
    const formIds: string[] = [...(featMembers.forms ?? [])];
    const flowIds: string[] = [...(featMembers.flows ?? [])];
    const apiIds: string[] = [...(featMembers.apis ?? [])];
    // pull member ids referenced directly by the feature node too
    for (const mid of node.memberIds as string[]) {
      if (mid.startsWith("PAGE:") && !pageIds.includes(mid)) pageIds.push(mid);
      else if (mid.startsWith("CMP:") && !componentIds.includes(mid)) componentIds.push(mid);
      else if (mid.startsWith("FORM:") && !formIds.includes(mid)) formIds.push(mid);
      else if (mid.startsWith("FLOW:") && !flowIds.includes(mid)) flowIds.push(mid);
    }
    const hiddenIds = m.hidden.filter((h) => pageIds.includes(h.page)).map((h) => h.id);
    const manualReview =
      componentIds.some((id) => compById.get(id)?.manualReview) ||
      (feat as any)?.manualReview === true;
    return {
      id: node.id,
      name: node.label,
      category: feat?.featureCategory ?? "capability",
      confidence: node.confidence,
      confidenceReason: node.confidenceReason ?? null,
      featureNodeId: node.id,
      features: (node.children ?? []).map((c: any) => ({ id: c.id, label: c.label, children: (c.children ?? []).map((g: any) => g.label) })),
      pageIds,
      componentIds,
      formIds,
      flowIds,
      hiddenIds,
      apiIds,
      manualReview,
    };
  });

  // page -> module map
  const pageModules = new Map<string, string[]>();
  for (const mod of modules) for (const pid of mod.pageIds) {
    if (!pageModules.has(pid)) pageModules.set(pid, []);
    pageModules.get(pid)!.push(mod.id);
  }

  // ---- PAGES ----
  const pages: PortalPage[] = m.pages.map((p) => ({
    id: p.id,
    label: p.label,
    url: p.urlPattern,
    archetype: p.archetype,
    roles: p.roleVisibility,
    confidence: p.confidence,
    confidenceReason: p.confidenceReason ?? null,
    authRequired: p.authRequired,
    httpStatus: p.httpStatusObserved,
    purpose: p.inferredPurpose ?? `the ${p.label} page`,
    componentIds: p.containsComponents,
    formIds: p.containsForms,
    stateIds: p.knownStates,
    moduleIds: pageModules.get(p.id) ?? [],
    screenshotKey: p.archetype,
  }));

  // ---- COMPONENTS ----
  const components: PortalComponent[] = m.components.map((c) => ({
    id: c.id,
    type: c.type,
    label: c.label,
    page: c.page,
    scope: c.scope,
    appearsOn: c.appearsOn,
    confidence: c.confidence,
    confidenceReason: c.confidenceReason ?? null,
    businessFunction: c.businessFunction,
    inferredPurpose: c.inferredPurpose,
    behavior: c.behavior,
    leadsTo: c.leadsTo,
    partOfFlow: c.partOfFlow,
    selector: c.selector,
    ariaRole: c.ariaRole,
    triggersApi: c.triggersApi,
    manualReview: c.manualReview,
    manualReviewReason: c.manualReviewReason ?? null,
  }));

  // ---- TIMELINE (from crawl order) ----
  const timeline: TimelineEvent[] = [];
  let seq = 0;
  timeline.push({ seq: seq++, kind: "start", label: "Crawler started", detail: m.appUrl });
  if (raw) {
    for (const st of Object.values(raw.statesById)) {
      const pageLabel = pageById.get(`PAGE:${st.route.replace(/https?:\/\/[^/]+/, "").replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home"}`)?.label;
      timeline.push({
        seq: seq++,
        kind: "page",
        label: st.title || st.url,
        detail: `${st.components.length} components · ${st.role}`,
        role: st.role,
      });
    }
    const t = raw.telemetry;
    timeline.push({ seq: seq++, kind: "milestone", label: "Hidden elements revealed", detail: String(t.hiddenRevealed) });
    timeline.push({ seq: seq++, kind: "milestone", label: "Forms discovered", detail: String(t.formsFound) });
    for (const b of raw.blockedItems.filter((x) => x.blockerType !== "external_redirect").slice(0, 8)) {
      timeline.push({ seq: seq++, kind: "blocked", label: `Blocked: ${titleCase(b.blockerType.replace(/_/g, " "))}`, detail: b.reason });
    }
  } else {
    for (const p of m.pages) timeline.push({ seq: seq++, kind: "page", label: p.label, detail: `${p.containsComponents.length} components` });
  }
  timeline.push({ seq: seq++, kind: "finish", label: "Discovery finished", detail: `${m.pages.length} pages · ${m.components.length} components` });

  // ---- HEATMAP ----
  const heatStatus = (conf: number, manualReview: boolean): HeatCell["status"] =>
    manualReview ? "blocked" : conf >= 80 ? "discovered" : conf >= 50 ? "partial" : "not_reachable";
  const heatmap: HeatCell[] = [
    ...modules.map((mod) => ({ id: mod.id, label: mod.name, kind: "module", status: heatStatus(mod.confidence, mod.manualReview), confidence: mod.confidence })),
    ...pages.map((p) => ({ id: p.id, label: p.label, kind: "page", status: heatStatus(p.confidence, false), confidence: p.confidence })),
  ];

  // ---- SEARCH INDEX ----
  const searchIndex: SearchEntry[] = [];
  const add = (id: string, label: string, kind: string, view: string, hint: string, extra = "") =>
    searchIndex.push({ id, label, kind, view, hint, keywords: `${label} ${hint} ${extra} ${kind}`.toLowerCase() });
  for (const mod of modules) add(mod.id, mod.name, "module", "modules", mod.category);
  for (const p of pages) add(p.id, p.label, "page", "pages", p.archetype, p.url);
  for (const c of components) add(c.id, c.label || c.type, "component", "components", c.type, `${c.businessFunction ?? ""} ${c.inferredPurpose ?? ""}`);
  for (const f of m.forms) add(f.id, f.name, "form", "forms", `${f.fieldCount} fields`);
  for (const fl of m.flows) add(fl.id, fl.name, "flow", "flows", fl.steps.map((s) => s.action).join(" "));
  for (const s of m.states) add(s.id, s.label, "state", "states", s.type);
  for (const h of m.hidden) add(h.id, h.label, "hidden", "hidden", h.revealTrigger);
  for (const a of m.apis) add(a.id, a.endpointPattern, "api", "apis", a.triggeringAction);
  for (const n of m.navigation) add(n.id, n.label, "navigation", "navigation", n.type);

  const kpis: Record<string, number> = { ...inp.inventory.counts };

  return {
    meta: {
      appUrl: m.appUrl,
      appName: appNameFrom(m.appUrl, inp.overview.pagesFound?.[0]?.label),
      runId: m.runId,
      generatedAt: m.generatedAt,
      roles: m.roles.map((r) => r.name),
      schemaVersion: m.schemaVersion,
    },
    kpis,
    summary: inp.summary,
    validation: inp.validation,
    overview: inp.overview,
    featureTree: inp.featureTree,
    featureRel: inp.featureRel,
    modules,
    pages,
    components,
    navigation: m.navigation,
    forms: m.forms,
    flows: m.flows,
    states: m.states,
    hidden: m.hidden,
    apis: m.apis,
    rolesDetail: m.roles,
    manualReview: inp.manualReview.entries,
    checklist: inp.checklist,
    timeline,
    coverageMap: heatmap,
    screenshots,
    searchIndex,
  };
}
