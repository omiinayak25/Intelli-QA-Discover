/**
 * Multi-run Diff (Phase 9, optional).
 *
 * Compares two discovery runs (OLD vs NEW) and reports NEW / REMOVED / CHANGED /
 * UNCHANGED across all 10 categories, plus the feature tree, confidence changes,
 * and the manual-review list. Still discovery only — no regression verdicts.
 */

import { hash, id } from "../core/ids.js";
import { makeEnvelope, type Envelope } from "../core/envelope.js";
import type { AnyItem, DiscoveryModel } from "../core/types.js";
import type { FeatureTree, FeatureNode } from "./feature-tree.js";
import type { ManualReview } from "./summary.js";
import type { QaMap, MapNode } from "./qa-map.js";
import type { QaChecklist } from "./checklist.js";

type Status = "new" | "removed" | "changed" | "unchanged";

export interface DiffEntry {
  id: string;
  category: string;
  status: Status;
  label: string;
  changedAttributes?: string[];
  confidenceChange?: { from: number; to: number };
}

export interface DiffReport extends Envelope {
  artifact: "diff_report";
  fromRunId: string;
  toRunId: string;
  byCategory: Record<string, { new: number; removed: number; changed: number; unchanged: number }>;
  entries: DiffEntry[];
  featureTreeDiff: { id: string; status: Status; label: string }[];
  confidenceChanges: { id: string; from: number; to: number }[];
  manualReviewDiff: { id: string; status: Status; item: string }[];
}

function signature(it: AnyItem): string {
  const base = [it.label, (it as any).type ?? "", (it as any).urlPattern ?? "", (it as any).fieldCount ?? "", (it as any).endpointPattern ?? ""].join("|");
  return hash(base);
}

function allItems(m: DiscoveryModel): { category: string; items: AnyItem[] }[] {
  return [
    { category: "page", items: m.pages },
    { category: "navigation", items: m.navigation },
    { category: "component", items: m.components },
    { category: "business_feature", items: m.features },
    { category: "user_flow", items: m.flows },
    { category: "hidden", items: m.hidden },
    { category: "api", items: m.apis },
    { category: "form", items: m.forms },
    { category: "role", items: m.roles },
    { category: "state", items: m.states },
  ];
}

export function buildDiff(
  oldModel: DiscoveryModel,
  newModel: DiscoveryModel,
  oldTree: FeatureTree,
  newTree: FeatureTree,
  oldMr: ManualReview,
  newMr: ManualReview,
  generatedAt: string,
): DiffReport {
  const entries: DiffEntry[] = [];
  const byCategory: DiffReport["byCategory"] = {};
  const confidenceChanges: DiffReport["confidenceChanges"] = [];

  const oldByCat = new Map(allItems(oldModel).map((x) => [x.category, x.items]));
  for (const { category, items: newItems } of allItems(newModel)) {
    const oldItems = oldByCat.get(category) ?? [];
    const oldById = new Map(oldItems.map((i) => [i.id, i]));
    const newById = new Map(newItems.map((i) => [i.id, i]));
    const counts = { new: 0, removed: 0, changed: 0, unchanged: 0 };
    for (const ni of newItems) {
      const oi = oldById.get(ni.id);
      if (!oi) {
        entries.push({ id: ni.id, category, status: "new", label: ni.label });
        counts.new++;
      } else {
        const changedAttrs: string[] = [];
        if (signature(oi) !== signature(ni)) changedAttrs.push("attributes");
        if (oi.confidence !== ni.confidence) {
          confidenceChanges.push({ id: ni.id, from: oi.confidence, to: ni.confidence });
        }
        if (changedAttrs.length) {
          entries.push({ id: ni.id, category, status: "changed", label: ni.label, changedAttributes: changedAttrs, confidenceChange: oi.confidence !== ni.confidence ? { from: oi.confidence, to: ni.confidence } : undefined });
          counts.changed++;
        } else {
          counts.unchanged++;
        }
      }
    }
    for (const oi of oldItems) {
      if (!newById.has(oi.id)) {
        entries.push({ id: oi.id, category, status: "removed", label: oi.label });
        counts.removed++;
      }
    }
    byCategory[category] = counts;
  }

  // feature tree diff
  const flatTree = (t: FeatureTree): FeatureNode[] => {
    const out: FeatureNode[] = [];
    const walk = (n: FeatureNode) => { out.push(n); n.children.forEach(walk); };
    walk(t.root);
    return out;
  };
  const oldNodes = new Map(flatTree(oldTree).map((n) => [n.id, n]));
  const newNodes = new Map(flatTree(newTree).map((n) => [n.id, n]));
  const featureTreeDiff: DiffReport["featureTreeDiff"] = [];
  for (const [nid, n] of newNodes) if (!oldNodes.has(nid)) featureTreeDiff.push({ id: nid, status: "new", label: n.label });
  for (const [nid, n] of oldNodes) if (!newNodes.has(nid)) featureTreeDiff.push({ id: nid, status: "removed", label: n.label });

  // manual review diff
  const oldMrIds = new Map(oldMr.entries.map((e) => [e.id + e.target, e]));
  const newMrIds = new Map(newMr.entries.map((e) => [e.id + e.target, e]));
  const manualReviewDiff: DiffReport["manualReviewDiff"] = [];
  for (const [k, e] of newMrIds) if (!oldMrIds.has(k)) manualReviewDiff.push({ id: e.id, status: "new", item: e.blockerType });
  for (const [k, e] of oldMrIds) if (!newMrIds.has(k)) manualReviewDiff.push({ id: e.id, status: "removed", item: e.blockerType });

  const envelope = makeEnvelope({
    artifact: "diff_report",
    artifactId: id("RUN", hash(oldModel.runId, newModel.runId)),
    runId: newModel.runId,
    appUrl: newModel.appUrl,
    roles: newModel.roles.map((r) => r.name),
    sourceArtifacts: [oldModel.runId, newModel.runId],
    generatedAt,
  });

  return {
    ...envelope,
    artifact: "diff_report",
    fromRunId: oldModel.runId,
    toRunId: newModel.runId,
    byCategory,
    entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
    featureTreeDiff,
    confidenceChanges,
    manualReviewDiff,
  };
}

/** Auto-update the QA map for the NEW run: carry tickState for UNCHANGED, reset CHANGED, flag. */
export function applyDiffToMap(newMap: QaMap, oldMap: QaMap, diff: DiffReport): QaMap {
  const oldTicks = new Map<string, string>();
  const collect = (n: MapNode) => { if (n.refId) oldTicks.set(n.refId, n.tickState); n.children.forEach(collect); };
  collect(oldMap.root);
  const statusById = new Map(diff.entries.map((e) => [e.id, e.status]));

  const apply = (n: MapNode) => {
    if (n.refId) {
      const status = statusById.get(n.refId);
      (n as any).changeStatus = status ?? "unchanged";
      if (status === "changed" || status === "new") {
        n.tickState = "untested";
      } else if (oldTicks.has(n.refId)) {
        n.tickState = oldTicks.get(n.refId) as any;
      }
    }
    n.children.forEach(apply);
  };
  apply(newMap.root);
  return newMap;
}

export function renderDiffMd(d: DiffReport): string {
  const L: string[] = [];
  L.push(`# Multi-run Diff`);
  L.push("");
  L.push(`From: ${d.fromRunId} → To: ${d.toRunId}`);
  L.push("");
  L.push(`> Discovery only — describes what exists now vs before. No regression verdicts.`);
  L.push("");
  L.push(`| Category | New | Removed | Changed | Unchanged |`);
  L.push(`|----------|----:|--------:|--------:|----------:|`);
  for (const [cat, c] of Object.entries(d.byCategory)) L.push(`| ${cat} | ${c.new} | ${c.removed} | ${c.changed} | ${c.unchanged} |`);
  L.push("");
  const grp = (s: Status) => d.entries.filter((e) => e.status === s);
  for (const s of ["new", "removed", "changed"] as Status[]) {
    const items = grp(s);
    if (!items.length) continue;
    L.push(`## ${s.toUpperCase()} (${items.length})`);
    for (const e of items) L.push(`- \`${e.id}\` **${e.label}** (${e.category})${e.confidenceChange ? ` · confidence ${e.confidenceChange.from}%→${e.confidenceChange.to}%` : ""}`);
    L.push("");
  }
  if (d.confidenceChanges.length) {
    L.push(`## Confidence Changes (${d.confidenceChanges.length})`);
    for (const c of d.confidenceChanges) L.push(`- \`${c.id}\` ${c.from}% → ${c.to}%`);
    L.push("");
  }
  if (d.featureTreeDiff.length) {
    L.push(`## Feature Tree Diff`);
    for (const f of d.featureTreeDiff) L.push(`- ${f.status.toUpperCase()}: ${f.label} (\`${f.id}\`)`);
    L.push("");
  }
  if (d.manualReviewDiff.length) {
    L.push(`## Manual Review Diff`);
    for (const m of d.manualReviewDiff) L.push(`- ${m.status.toUpperCase()}: ${m.item} (\`${m.id}\`)`);
    L.push("");
  }
  return L.join("\n") + "\n";
}
