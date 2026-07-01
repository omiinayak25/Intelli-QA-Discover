/**
 * QA Checklist Generator (Phase 6).
 *
 * Global + page-wise tick-off items. Each item is a short NOUN/LABEL naming a
 * discovered surface — never an instruction, step, expected result, or verdict.
 */

import { hash, id, slug, titleCase } from "../core/ids.js";
import { makeEnvelope, type Envelope } from "../core/envelope.js";
import type { DiscoveryModel } from "../core/types.js";
import type { MapNode, QaMap } from "./qa-map.js";

export interface ChecklistItem {
  id: string;
  label: string;
  coversSourceIds: string[];
  mapNodeId: string;
  checked: boolean;
  confidence?: number;
  confidenceReason?: string | null;
}

export interface QaChecklist extends Envelope {
  artifact: "qa_checklist";
  global: ChecklistItem[];
  pageWise: { pageId: string; pageLabel: string; items: ChecklistItem[] }[];
  coverageGaps: string[];
}

function indexRefToMap(root: MapNode): Map<string, string> {
  const idx = new Map<string, string>();
  const walk = (n: MapNode) => {
    if (n.refId && !idx.has(n.refId)) idx.set(n.refId, n.id);
    n.children.forEach(walk);
  };
  walk(root);
  return idx;
}

export function buildChecklist(model: DiscoveryModel, map: QaMap, generatedAt: string): QaChecklist {
  const refToMap = indexRefToMap(map.root);
  const usedLabels = new Set<string>();
  const covered = new Set<string>();

  const mkItem = (scope: string, label: string, sourceIds: string[], conf?: number, reason?: string | null): ChecklistItem | null => {
    const key = slug(label);
    const mapNodeId = sourceIds.map((s) => refToMap.get(s)).find(Boolean) ?? map.root.id;
    sourceIds.forEach((s) => covered.add(s));
    return {
      id: id("CHK", scope, key),
      label,
      coversSourceIds: sourceIds,
      mapNodeId,
      checked: false,
      confidence: conf,
      confidenceReason: reason ?? null,
    };
  };

  // ---- GLOBAL ----
  const globalItems: ChecklistItem[] = [];
  // features as capability labels
  for (const feat of model.features) {
    if (usedLabels.has(slug(feat.name))) continue;
    usedLabels.add(slug(feat.name));
    const it = mkItem("global", feat.name, [feat.id, ...feat.components.slice(0, 3)], feat.confidence, feat.confidenceReason);
    if (it) globalItems.push(it);
  }
  // global components
  for (const cid of model.globalComponents) {
    const c = model.components.find((x) => x.id === cid);
    if (!c) continue;
    const label = c.label || titleCase(c.type);
    if (usedLabels.has(slug(label))) continue;
    usedLabels.add(slug(label));
    const it = mkItem("global", label, [c.id], c.confidence, c.confidenceReason);
    if (it) globalItems.push(it);
  }
  // cross-cutting surfaces present in the app
  const crossCutting: { label: string; test: () => boolean; src: string[] }[] = [
    { label: "Cookie Banner", test: () => model.states.some((s) => /cookie/i.test(s.type)) || true, src: model.states.filter((s) => /cookie|populated/i.test(s.type)).slice(0, 1).map((s) => s.id) },
    { label: "Responsive", test: () => true, src: model.states.filter((s) => s.type === "populated").slice(0, 1).map((s) => s.id) },
    { label: "Error Pages", test: () => model.pages.some((p) => /404|500|error/i.test(p.label)), src: model.pages.filter((p) => /404|500|error/i.test(p.label)).map((p) => p.id) },
    { label: "Keyboard Navigation", test: () => model.navigation.length > 0, src: model.navigation.slice(0, 1).map((n) => n.id) },
  ];
  for (const cc of crossCutting) {
    if (!cc.test() || usedLabels.has(slug(cc.label))) continue;
    usedLabels.add(slug(cc.label));
    const src = cc.src.length ? cc.src : [map.root.id];
    const it = mkItem("global", cc.label, cc.src.length ? cc.src : [model.pages[0]?.id ?? map.root.id]);
    if (it) globalItems.push(it);
  }

  // ---- PAGE-WISE ----
  const globalIdSet = new Set(model.globalComponents);
  const pageWise = model.pages.map((p) => {
    const seen = new Set<string>();
    const items: ChecklistItem[] = [];
    const pageLocals = model.components.filter((c) => c.page === p.id && !globalIdSet.has(c.id));
    for (const c of pageLocals) {
      const label = c.label || titleCase(c.type);
      const key = slug(label);
      if (seen.has(key)) continue;
      // if it's already a global label, skip page duplication
      if (usedLabels.has(key) && globalItems.some((g) => slug(g.label) === key)) continue;
      seen.add(key);
      const it = mkItem(p.archetype, label, [c.id], c.confidence, c.confidenceReason);
      if (it) items.push(it);
    }
    for (const fid of p.containsForms) {
      const f = model.forms.find((x) => x.id === fid);
      if (!f) continue;
      const key = slug(f.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const it = mkItem(p.archetype, f.name, [f.id], f.confidence);
      if (it) items.push(it);
    }
    return { pageId: p.id, pageLabel: p.label.toUpperCase(), items };
  }).filter((pw) => pw.items.length > 0);

  // coverage gaps: model ids not covered by any checklist item
  const allIds = [
    ...model.pages,
    ...model.components,
    ...model.forms,
    ...model.features,
    ...model.flows,
    ...model.navigation,
    ...model.hidden,
    ...model.apis,
    ...model.states,
    ...model.roles,
  ].map((i) => i.id);
  const coverageGaps = allIds.filter((x) => !covered.has(x));

  const envelope = makeEnvelope({
    artifact: "qa_checklist",
    artifactId: id("CHK", hash(model.runId, "chk")),
    runId: model.runId,
    appUrl: model.appUrl,
    roles: model.roles.map((r) => r.name),
    sourceArtifacts: ["discovery-model.json", "qa-inventory.json", "qa-map.json"],
    generatedAt,
  });

  return { ...envelope, artifact: "qa_checklist", global: globalItems, pageWise, coverageGaps };
}

// ---------- renderer ----------

export function renderChecklistMd(chk: QaChecklist): string {
  const L: string[] = [];
  L.push(`# QA Checklist`);
  L.push("");
  L.push(`_Tick-off items (a human ticks them). Each is a bare label naming a discovered surface — never an instruction or a verdict._`);
  L.push("");
  L.push(`## Global Checklist`);
  L.push("");
  L.push(chk.global.map((i) => `[ ] ${i.label}`).join("  "));
  L.push("");
  L.push(`## Page-wise Checklist`);
  L.push("");
  for (const pw of chk.pageWise) {
    L.push(`${pw.pageLabel}: ${pw.items.map((i) => `[ ] ${i.label}`).join("  ")}`);
  }
  L.push("");
  return L.join("\n") + "\n";
}
