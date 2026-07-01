/**
 * QA Inventory + Application Overview (Phase 4).
 *
 * (A) qa-inventory.json — deterministic counts per category, with countSources.
 * (B) application-overview.(md|json) — BookMyShow-style "here is your app".
 *
 * Counts and descriptions only. No scoring, no prioritization, no test cases.
 */

import { hash, id, titleCase } from "../core/ids.js";
import { makeEnvelope, type Envelope } from "../core/envelope.js";
import type { DiscoveryModel } from "../core/types.js";

export interface QaInventory extends Envelope {
  artifact: "qa_inventory";
  counts: Record<string, number>;
  countSources: Record<string, string[]>;
  componentTypeBreakdown: { componentType: string; count: number }[];
  perRoleCounts: { role: string; pagesReachable: number; componentsReachable: number }[];
  responsiveViewsList: string[];
}

export interface CrawlScope {
  pagesVisited: number;
  pagesNotReachable: number;
  roles: string[];
  maxDepth: number;
}

export interface ApplicationOverview extends Envelope {
  artifact: "application_overview";
  crawlScope?: CrawlScope;
  pagesFound: { id: string; label: string; url: string; rolesVisible: string[]; confidence: number }[];
  globalComponents: { id: string; label: string; componentType: string; detectedBy: string[]; confidence: number }[];
  pageComponents: { pageId: string; pageLabel: string; components: { id: string; label: string; componentType: string; detectedBy: string[]; confidence: number }[] }[];
  businessFlows: { id: string; label: string; steps: { seq: number; label: string; pageId?: string }[]; confidence: number }[];
}

export function buildInventory(model: DiscoveryModel, generatedAt: string): QaInventory {
  const comps = model.components;
  const byType = (t: string) => comps.filter((c) => c.type === t);
  const dialogs = comps.filter((c) => c.type === "modal");
  const buttons = byType("button");
  const dropdowns = byType("dropdown");
  const searchBars = comps.filter((c) => c.type === "search");
  const uploads = byType("upload");
  const tables = byType("table");
  const charts = byType("chart");
  const hiddenMenus = model.hidden.filter((h) => /menu|drawer/i.test(h.type + h.label));

  const counts: Record<string, number> = {
    totalPages: model.pages.length,
    totalComponents: comps.length,
    businessFlows: model.flows.length,
    forms: model.forms.length,
    buttons: buttons.length,
    dropdowns: dropdowns.length,
    searchBars: searchBars.length,
    uploadControls: uploads.length,
    tables: tables.length,
    charts: charts.length,
    apiCalls: model.apis.length,
    dialogs: dialogs.length,
    hiddenMenus: hiddenMenus.length,
    responsiveViews: (model as any).responsiveViews ?? 3,
    states: model.states.length,
    navMenus: model.navigation.length,
    roles: model.roles.length,
  };

  const countSources: Record<string, string[]> = {
    totalPages: model.pages.map((p) => p.id),
    totalComponents: comps.map((c) => c.id),
    businessFlows: model.flows.map((f) => f.id),
    forms: model.forms.map((f) => f.id),
    buttons: buttons.map((c) => c.id),
    dropdowns: dropdowns.map((c) => c.id),
    searchBars: searchBars.map((c) => c.id),
    uploadControls: uploads.map((c) => c.id),
    tables: tables.map((c) => c.id),
    charts: charts.map((c) => c.id),
    apiCalls: model.apis.map((a) => a.id),
    dialogs: dialogs.map((c) => c.id),
    hiddenMenus: hiddenMenus.map((h) => h.id),
    states: model.states.map((s) => s.id),
    navMenus: model.navigation.map((n) => n.id),
    roles: model.roles.map((r) => r.id),
  };

  const typeSet = Array.from(new Set(comps.map((c) => c.type))).sort();
  const componentTypeBreakdown = typeSet.map((t) => ({ componentType: t, count: byType(t).length }));

  const perRoleCounts = model.roles.map((r) => ({
    role: r.name,
    pagesReachable: r.reachablePages.length,
    componentsReachable: r.reachableComponents.length,
  }));

  const envelope = makeEnvelope({
    artifact: "qa_inventory",
    artifactId: id("INV", hash(model.runId, "inv")),
    runId: model.runId,
    appUrl: model.appUrl,
    roles: model.roles.map((r) => r.name),
    sourceArtifacts: ["discovery-model.json"],
    generatedAt,
  });

  return {
    ...envelope,
    artifact: "qa_inventory",
    counts,
    countSources,
    componentTypeBreakdown,
    perRoleCounts,
    responsiveViewsList: ["mobile", "tablet", "desktop"],
  };
}

export function buildOverview(
  model: DiscoveryModel,
  generatedAt: string,
  crawlScope?: CrawlScope,
): ApplicationOverview {
  const globalIds = new Set(model.globalComponents);
  const detectedBy = (dm: string) => [dm];

  const pagesFound = model.pages.map((p) => ({
    id: p.id,
    label: p.label,
    url: p.urlPattern,
    rolesVisible: p.roleVisibility,
    confidence: p.confidence,
  }));

  const globalComponents = model.components
    .filter((c) => globalIds.has(c.id))
    .map((c) => ({ id: c.id, label: c.label, componentType: c.type, detectedBy: detectedBy(c.detectionMethod), confidence: c.confidence }));

  const pageComponents = model.pages.map((p) => ({
    pageId: p.id,
    pageLabel: p.label,
    components: model.components
      .filter((c) => c.page === p.id && !globalIds.has(c.id))
      .slice(0, 40)
      .map((c) => ({ id: c.id, label: c.label, componentType: c.type, detectedBy: detectedBy(c.detectionMethod), confidence: c.confidence })),
  }));

  const businessFlows = model.flows.map((f) => ({
    id: f.id,
    label: f.name,
    steps: f.steps.map((s, i) => ({ seq: i + 1, label: labelForStep(model, s), pageId: s.pageId })),
    confidence: f.confidence,
  }));

  const envelope = makeEnvelope({
    artifact: "application_overview",
    artifactId: id("OVW", hash(model.runId, "ovw")),
    runId: model.runId,
    appUrl: model.appUrl,
    roles: model.roles.map((r) => r.name),
    sourceArtifacts: ["discovery-model.json"],
    generatedAt,
  });

  return { ...envelope, artifact: "application_overview", crawlScope, pagesFound, globalComponents, pageComponents, businessFlows };
}

function labelForStep(model: DiscoveryModel, s: { pageId?: string; action: string }): string {
  if (s.pageId) {
    const p = model.pages.find((x) => x.id === s.pageId);
    if (p) return p.label;
  }
  return titleCase(s.action);
}

// ---------- renderers ----------

const INVENTORY_ORDER: [string, string][] = [
  ["totalPages", "Total Pages"],
  ["totalComponents", "Total Components"],
  ["businessFlows", "Business Flows"],
  ["forms", "Forms"],
  ["buttons", "Buttons"],
  ["dropdowns", "Dropdowns"],
  ["searchBars", "Search Bars"],
  ["uploadControls", "Upload Controls"],
  ["tables", "Tables"],
  ["charts", "Charts"],
  ["apiCalls", "API Calls"],
  ["dialogs", "Dialogs"],
  ["hiddenMenus", "Hidden Menus"],
  ["responsiveViews", "Responsive Views"],
];

export function renderInventoryMd(inv: QaInventory): string {
  const parts = INVENTORY_ORDER.map(([k, label]) => `${label} ${inv.counts[k] ?? 0}`);
  const line = parts.join("; ") + `; Roles: ${inv.roles.map(titleCase).join(", ")}`;
  const L: string[] = [];
  L.push(`# QA Inventory`);
  L.push("");
  L.push(line);
  L.push("");
  L.push(`| Metric | Count |`);
  L.push(`|--------|-------|`);
  for (const [k, label] of INVENTORY_ORDER) L.push(`| ${label} | ${inv.counts[k] ?? 0} |`);
  L.push(`| States | ${inv.counts.states ?? 0} |`);
  L.push(`| Nav Menus | ${inv.counts.navMenus ?? 0} |`);
  L.push(`| Roles | ${inv.roles.map(titleCase).join(", ")} |`);
  L.push("");
  return L.join("\n") + "\n";
}

export function renderOverviewMd(ov: ApplicationOverview): string {
  const L: string[] = [];
  L.push(`# Application Overview`);
  L.push("");
  if (ov.crawlScope) {
    const s = ov.crawlScope;
    L.push(
      `_Scope: partial discovery — visited ${s.pagesVisited} page archetype(s) as ${s.roles.map(titleCase).join(", ")}, ` +
        `max depth ${s.maxDepth}; ${s.pagesNotReachable} link(s) were off-scope or unreachable. ` +
        `This lists what was reached — see the Discovery Summary for crawl completeness._`,
    );
    L.push("");
  }
  L.push(`Pages Found: ${ov.pagesFound.map((p) => p.label).join(", ")}`);
  L.push("");
  L.push(`Global Components: ${ov.globalComponents.map((c) => c.label).join(", ")}`);
  L.push("");
  for (const pc of ov.pageComponents) {
    if (pc.components.length === 0) continue;
    L.push(`${pc.pageLabel} — Components Found: ${pc.components.map((c) => c.label).join(", ")}`);
    L.push("");
  }
  for (const f of ov.businessFlows) {
    L.push(`${f.label} — Steps: ${f.steps.map((s) => s.label).join(" -> ")}`);
    L.push("");
  }
  return L.join("\n") + "\n";
}
