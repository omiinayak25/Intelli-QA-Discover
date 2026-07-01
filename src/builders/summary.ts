/**
 * Discovery Summary, Discovery Validation & Manual Review (Phase 7).
 *
 * (A) discovery-summary — crawl-completeness ("Did I explore everything?").
 * (B) discovery-validation — self-audit of how thoroughly the technique ran.
 * (C) manual-review — where a human must go LOOK because auto-discovery blocked.
 *
 * All three are process reporting / hand-off. NOT testing, no test cases.
 */

import { hash, id, slug, titleCase } from "../core/ids.js";
import { makeEnvelope, type Envelope } from "../core/envelope.js";
import type { RawCapture, TechniqueCounts } from "../core/raw-capture.js";
import type { DiscoveryModel } from "../core/types.js";

export interface DiscoverySummary extends Envelope {
  artifact: "discovery_summary";
  urlCrawled: string;
  pagesVisited: number;
  pagesSkipped: { id: string; reason: string }[];
  rolesCrawled: string[];
  statesObserved: string[];
  statesNotObserved: string[];
  hiddenRevealed: number;
  lazySections: number;
  formsFound: number;
  loopsPrevented: number;
  maxDepth: number;
  discoveryConfidence: number;
  pagesNotReachable: number;
  authenticationProtected: number;
  responsiveLayouts: string[];
}

export interface ManualReview extends Envelope {
  artifact: "manual_review_required";
  entries: { id: string; target: string; blockerType: string; reason: string; humanShouldLookAt: string; relatedIds: string[] }[];
}

export interface DiscoveryValidation extends Envelope {
  artifact: "discovery_validation";
  checks: { id: string; check: string; scope: string; status: "pass" | "warn" | "blocked" | "fail"; detail: string; affected: string[] }[];
  overallDiscoveryCompleteness: number;
}

function sumTech(byPage: Record<string, TechniqueCounts>): TechniqueCounts {
  const acc: TechniqueCounts = {
    accordionsFound: 0, accordionsExpanded: 0, menusFound: 0, menusOpened: 0,
    hoverElementsFound: 0, hoverElementsFired: 0, lazySectionsFound: 0, lazySectionsScrolled: 0,
    iframesSeen: 0, iframesInspected: 0, shadowRootsSeen: 0, shadowRootsTraversed: 0,
    pagesRevisitedAfterLogin: 0, routesDiscovered: 0, routesVisited: 0, unreachableRoutes: [],
  };
  for (const t of Object.values(byPage)) {
    for (const k of Object.keys(acc) as (keyof TechniqueCounts)[]) {
      if (k === "unreachableRoutes") acc.unreachableRoutes.push(...t.unreachableRoutes);
      else (acc[k] as number) += t[k] as number;
    }
  }
  return acc;
}

export function buildDiscoverySummary(raw: RawCapture, generatedAt: string): DiscoverySummary {
  const t = raw.telemetry;
  // discovery confidence = roll-up over completeness signals
  const visited = t.pagesVisited;
  const skipped = t.pagesSkipped.length + t.pagesNotReachable;
  const reachRatio = visited + skipped > 0 ? visited / (visited + skipped) : 1;
  const stateRatio =
    t.statesObserved.length / Math.max(1, t.statesObserved.length + t.statesNotObserved.length);
  const roleRatio = t.rolesCrawled.length / Math.max(1, raw.roles.length);
  const discoveryConfidence = Math.round(
    Math.min(100, 100 * (0.5 * reachRatio + 0.3 * stateRatio + 0.2 * roleRatio)),
  );

  const envelope = makeEnvelope({
    artifact: "discovery_summary",
    artifactId: id("SUM", hash(raw.runId, "sum")),
    runId: raw.runId,
    appUrl: raw.appUrl,
    roles: raw.roles,
    sourceArtifacts: ["raw-capture.json", "discovery-model.json"],
    generatedAt,
  });

  return {
    ...envelope,
    artifact: "discovery_summary",
    urlCrawled: raw.appUrl,
    pagesVisited: visited,
    pagesSkipped: t.pagesSkipped,
    rolesCrawled: t.rolesCrawled,
    statesObserved: t.statesObserved,
    statesNotObserved: t.statesNotObserved,
    hiddenRevealed: t.hiddenRevealed,
    lazySections: t.lazySections,
    formsFound: t.formsFound,
    loopsPrevented: t.loopsPrevented,
    maxDepth: t.maxDepth,
    discoveryConfidence,
    pagesNotReachable: t.pagesNotReachable,
    authenticationProtected: t.authenticationProtected,
    responsiveLayouts: t.responsiveLayouts,
  };
}

export function buildManualReview(
  raw: RawCapture,
  model: DiscoveryModel,
  generatedAt: string,
): ManualReview {
  const entries: ManualReview["entries"] = [];
  const seen = new Set<string>();
  const add = (target: string, blockerType: string, reason: string, look: string, related: string[]) => {
    const key = slug(blockerType + "-" + target);
    const entryId = id("MRR", slug(blockerType));
    if (seen.has(entryId + target)) return;
    seen.add(entryId + target);
    entries.push({ id: entryId, target, blockerType, reason, humanShouldLookAt: look, relatedIds: related });
  };

  for (const b of raw.blockedItems) {
    const related = model.pages.filter((p) => p.sampleUrls.some((u) => u === b.target)).map((p) => p.id);
    add(b.target, b.blockerType, b.reason, b.humanPointer, related);
  }
  // model-tagged manual-review items
  const tagged = [...model.components, ...model.forms].filter((i) => i.manualReview);
  for (const it of tagged) {
    add(it.id, it.blockerType ?? "third_party_widget", it.manualReviewReason ?? "Requires human exploration.", `Explore ${it.label} manually.`, [it.id]);
  }

  const envelope = makeEnvelope({
    artifact: "manual_review_required",
    artifactId: id("MRR", hash(raw.runId, "mrr")),
    runId: raw.runId,
    appUrl: raw.appUrl,
    roles: raw.roles,
    sourceArtifacts: ["raw-capture.json", "discovery-model.json"],
    generatedAt,
  });
  return { ...envelope, artifact: "manual_review_required", entries };
}

export function buildDiscoveryValidation(raw: RawCapture, generatedAt: string): DiscoveryValidation {
  const tech = sumTech(raw.explorationTechniqueTelemetry.byPage);
  const checks: DiscoveryValidation["checks"] = [];
  const ratioCheck = (
    key: string,
    label: string,
    found: number,
    actioned: number,
    scope: string,
  ) => {
    let status: DiscoveryValidation["checks"][number]["status"] = "pass";
    if (found === 0) status = "pass";
    else if (actioned >= found) status = "pass";
    else if (actioned >= found * 0.6) status = "warn";
    else status = "warn";
    checks.push({
      id: id("VAL", key),
      check: key,
      scope,
      status,
      detail:
        found === 0
          ? `No ${label} found to explore.`
          : `${actioned}/${found} ${label} ${actioned >= found ? "explored" : "explored (some not reached)"}.`,
      affected: [],
    });
  };

  // route coverage
  checks.push({
    id: id("VAL", "all-reachable-routes-visited"),
    check: "all-reachable-routes-visited",
    scope: "global",
    status: tech.routesVisited >= tech.routesDiscovered ? "pass" : "warn",
    detail: `${tech.routesVisited}/${tech.routesDiscovered} discovered routes visited.`,
    affected: tech.unreachableRoutes.map((r) => r.route),
  });
  ratioCheck("all-accordions-expanded", "accordions", tech.accordionsFound, tech.accordionsExpanded, "global");
  ratioCheck("all-menus-opened", "menus", tech.menusFound, tech.menusOpened, "global");
  ratioCheck("all-hover-elements-fired", "hover-triggered elements", tech.hoverElementsFound, tech.hoverElementsFired, "global");
  ratioCheck("all-lazy-sections-scrolled", "lazy-loaded sections", tech.lazySectionsFound, tech.lazySectionsScrolled, "global");

  // iframes
  const iframeBlocked = tech.iframesSeen - tech.iframesInspected;
  checks.push({
    id: id("VAL", "all-iframes-inspected"),
    check: "all-iframes-inspected",
    scope: "global",
    status: iframeBlocked > 0 ? "blocked" : "pass",
    detail: iframeBlocked > 0 ? `${iframeBlocked} iframe(s) could not be inspected (cross-origin).` : "All iframes inspected.",
    affected: [],
  });
  // shadow dom
  checks.push({
    id: id("VAL", "shadow-dom-traversed"),
    check: "shadow-dom-traversed",
    scope: "global",
    status: "pass",
    detail: `${tech.shadowRootsTraversed}/${tech.shadowRootsSeen} shadow roots traversed.`,
    affected: [],
  });
  // pages revisited after login
  checks.push({
    id: id("VAL", "pages-revisited-after-login"),
    check: "pages-revisited-after-login",
    scope: "role",
    status: tech.pagesRevisitedAfterLogin > 0 ? "pass" : raw.roles.length > 1 ? "warn" : "pass",
    detail: `${tech.pagesRevisitedAfterLogin} pages revisited after login.`,
    affected: [],
  });
  // every role crawled
  checks.push({
    id: id("VAL", "all-roles-crawled"),
    check: "all-roles-crawled",
    scope: "role",
    status: raw.telemetry.rolesCrawled.length >= raw.roles.length ? "pass" : "warn",
    detail: `${raw.telemetry.rolesCrawled.length}/${raw.roles.length} supplied roles crawled.`,
    affected: [],
  });
  // unreachable pages explained
  checks.push({
    id: id("VAL", "unreachable-pages-explained"),
    check: "unreachable-pages-explained",
    scope: "global",
    status: "pass",
    detail: `${raw.telemetry.pagesSkipped.length} skipped page(s) recorded with reasons; ${raw.blockedItems.length} blocked item(s) captured.`,
    affected: raw.telemetry.pagesSkipped.map((p) => p.id),
  });
  // blocked-by CAPTCHA/etc cross-links
  for (const b of raw.blockedItems.filter((x) => ["captcha", "payment_gateway", "otp"].includes(x.blockerType))) {
    checks.push({
      id: id("VAL", "blocked-" + slug(b.blockerType)),
      check: "exploration-blocked-" + b.blockerType,
      scope: "global",
      status: "blocked",
      detail: `${b.reason} (see Manual Review Required).`,
      affected: [b.target],
    });
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const overallDiscoveryCompleteness = Math.round((passCount / checks.length) * 100);

  const envelope = makeEnvelope({
    artifact: "discovery_validation",
    artifactId: id("VAL", hash(raw.runId, "val")),
    runId: raw.runId,
    appUrl: raw.appUrl,
    roles: raw.roles,
    sourceArtifacts: ["raw-capture.json"],
    generatedAt,
  });
  return { ...envelope, artifact: "discovery_validation", checks, overallDiscoveryCompleteness };
}

// ---------- renderers ----------

export function renderSummaryMd(s: DiscoverySummary): string {
  const L: string[] = [];
  L.push(`# Discovery Summary`);
  L.push("");
  L.push(`URL Crawled: ${s.urlCrawled}`);
  const reasons = Array.from(new Set(s.pagesSkipped.map((p) => p.reason))).join(", ");
  L.push(`Pages Visited: ${s.pagesVisited} | Pages Skipped: ${s.pagesSkipped.length}${reasons ? ` (Reason: ${reasons})` : ""}`);
  L.push(`Roles Crawled: ${s.rolesCrawled.map((r) => `[x] ${titleCase(r)}`).join("  ")}`);
  L.push(`States Observed: ${s.statesObserved.map((st) => `[x] ${titleCase(st)}`).join("  ")}`);
  L.push(`States Not Observed: ${s.statesNotObserved.map((st) => titleCase(st.replace(/_/g, " "))).join(", ")}`);
  L.push(`Hidden Components Revealed: ${s.hiddenRevealed} | Lazy Loaded Sections: ${s.lazySections} | Forms Found: ${s.formsFound}`);
  L.push(`Navigation Loops Prevented: ${s.loopsPrevented} | Maximum Crawl Depth: ${s.maxDepth}`);
  L.push(`Pages Not Reachable: ${s.pagesNotReachable} | Authentication Protected: ${s.authenticationProtected} | Responsive Layouts: ${s.responsiveLayouts.map(titleCase).join(", ")}`);
  L.push(`Discovery Confidence: ${s.discoveryConfidence}%`);
  L.push("");
  return L.join("\n") + "\n";
}

export function renderManualReviewMd(m: ManualReview): string {
  const L: string[] = [];
  L.push(`# Manual Review Required`);
  L.push("");
  const labels = Array.from(new Set(m.entries.map((e) => blockerLabel(e.blockerType))));
  L.push(`Manual Review Required: ${labels.join("; ")}`);
  L.push("");
  L.push(`| Item | Why Discovery Was Blocked | Where A Human Looks Next |`);
  L.push(`|------|---------------------------|--------------------------|`);
  for (const e of m.entries) L.push(`| ${blockerLabel(e.blockerType)} | ${e.reason} | ${e.humanShouldLookAt} |`);
  L.push("");
  return L.join("\n") + "\n";
}

export function renderValidationMd(v: DiscoveryValidation): string {
  const L: string[] = [];
  L.push(`# Discovery Validation`);
  L.push("");
  for (const c of v.checks) {
    const mark = c.status === "pass" ? "✔" : "⚠";
    const reason = c.status === "pass" ? c.detail : `${c.detail}`;
    L.push(`${mark} ${humanizeCheck(c.check)} — ${reason}`);
  }
  L.push("");
  L.push(`Overall Discovery Completeness: ${v.overallDiscoveryCompleteness}%`);
  L.push("");
  return L.join("\n") + "\n";
}

function blockerLabel(t: string): string {
  const map: Record<string, string> = {
    auth_gated: "Authentication-protected pages",
    payment_gateway: "Payment Gateway",
    otp: "OTP Screen",
    captcha: "CAPTCHA",
    external_redirect: "External Redirect",
    native_dialog: "Native Browser Dialog",
    third_party_widget: "Third-party Widget",
  };
  return map[t] ?? titleCase(t.replace(/_/g, " "));
}

function humanizeCheck(check: string): string {
  return titleCase(check.replace(/-/g, " "));
}
