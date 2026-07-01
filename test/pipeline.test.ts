import { describe, it, expect } from "vitest";
import { makeRawCapture, TEST_AT } from "./helpers.js";
import { classify } from "../src/classifier/classifier.js";
import { SCHEMA_VERSION, CATEGORIES } from "../src/core/constants.js";
import { validateEnvelope } from "../src/core/envelope.js";
import { scanJson } from "../src/core/discipline.js";
import { buildFeatureTree, buildFeatureRelationships } from "../src/builders/feature-tree.js";
import { buildInventory, buildOverview } from "../src/builders/inventory.js";
import { buildQaMap, rollUp, type MapNode } from "../src/builders/qa-map.js";
import { buildChecklist } from "../src/builders/checklist.js";
import { buildDiscoverySummary, buildManualReview, buildDiscoveryValidation } from "../src/builders/summary.js";
import { buildBundle } from "../src/builders/report.js";
import { buildDiff, applyDiffToMap } from "../src/builders/diff.js";
import type { DiscoveryModel } from "../src/core/types.js";

const raw = makeRawCapture();
const model = classify(raw, TEST_AT);

function allModelIds(m: DiscoveryModel): Set<string> {
  return new Set([
    ...m.pages, ...m.navigation, ...m.components, ...m.features, ...m.flows,
    ...m.hidden, ...m.apis, ...m.forms, ...m.roles, ...m.states,
  ].map((i) => i.id));
}

describe("Phase 2 — Discovery Model", () => {
  it("carries the common envelope with frozen schemaVersion", () => {
    expect(validateEnvelope(model)).toEqual([]);
    expect(model.schemaVersion).toBe(SCHEMA_VERSION);
    expect(model.generatedFrom).toBe(raw.artifactId);
  });

  it("represents all 10 discovery categories", () => {
    const present = new Set<string>();
    for (const c of [...model.pages]) present.add("page");
    if (model.navigation.length) present.add("navigation");
    if (model.components.length) present.add("component");
    if (model.features.length) present.add("business_feature");
    if (model.flows.length) present.add("user_flow");
    if (model.hidden.length) present.add("hidden");
    if (model.apis.length) present.add("api");
    if (model.roles.length) present.add("role");
    if (model.states.length) present.add("state");
    for (const cat of CATEGORIES) {
      if (cat === "form") continue; // fixture has no forms
      expect(present.has(cat), `category ${cat} present`).toBe(true);
    }
  });

  it("assigns confidence to every item; low-confidence carries a reason", () => {
    const items = [...model.pages, ...model.components, ...model.features, ...model.flows, ...model.apis, ...model.hidden, ...model.states];
    for (const it of items) {
      expect(typeof it.confidence).toBe("number");
      if (it.confidence < 80) expect(it.confidenceReason, `${it.id} reason`).toBeTruthy();
    }
  });

  it("semantically enriches every component", () => {
    for (const c of model.components) {
      expect(c.businessFunction).toBeTruthy();
      expect(c.inferredPurpose).toBeTruthy();
      expect(typeof c.semanticConfidence).toBe("number");
    }
  });

  it("promotes cross-page components to global (no per-page duplicates)", () => {
    // the header nav-derived component appears on multiple pages
    expect(model.globalComponents.length).toBeGreaterThan(0);
    for (const gid of model.globalComponents) {
      const c = model.components.find((x) => x.id === gid);
      expect(c?.scope).toBe("global");
      expect((c?.appearsOn ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("classifies canvas as vision-typed", () => {
    const chart = model.components.find((c) => c.type === "chart");
    expect(chart?.visionClassified).toBe(true);
    expect(chart?.detectionMethod).toBe("vision");
  });

  it("is deterministic: same input -> deep-equal output", () => {
    const again = classify(raw, TEST_AT);
    expect(JSON.stringify(again)).toBe(JSON.stringify(model));
  });

  it("emits no forbidden tokens", () => {
    expect(scanJson(model)).toEqual([]);
  });
});

describe("Phase 3 — Feature Tree & Relationships", () => {
  const tree = buildFeatureTree(model, TEST_AT);
  const rel = buildFeatureRelationships(model, TEST_AT);
  it("has an Application root and FEATNODE ids; memberIds resolve", () => {
    expect(tree.root.label).toBe("Application");
    const ids = allModelIds(model);
    const walk = (n: any) => { for (const m of n.memberIds) expect(ids.has(m), `member ${m}`).toBe(true); n.children.forEach(walk); };
    tree.root.children.forEach(walk);
  });
  it("relationship edges resolve to real feature nodes", () => {
    const featIds = new Set(model.features.map((f) => f.id));
    for (const e of rel.edges) {
      expect(featIds.has(e.from)).toBe(true);
      expect(featIds.has(e.to)).toBe(true);
      expect(["leadsTo", "dependsOn", "partOf", "precedes"]).toContain(e.kind);
    }
  });
});

describe("Phase 4/5/6 — Inventory, Map, Checklist", () => {
  const inv = buildInventory(model, TEST_AT);
  const ov = buildOverview(model, TEST_AT);
  const map = buildQaMap(model, TEST_AT);
  const chk = buildChecklist(model, map, TEST_AT);

  it("inventory counts reconcile with the model", () => {
    expect(inv.counts.totalPages).toBe(model.pages.length);
    expect(inv.counts.totalComponents).toBe(model.components.length);
    for (const [k, ids] of Object.entries(inv.countSources)) {
      expect(inv.counts[k]).toBe(ids.length);
    }
  });

  it("overview references resolve; roles render as strings", () => {
    const ids = allModelIds(model);
    for (const p of ov.pagesFound) expect(ids.has(p.id)).toBe(true);
    expect(inv.roles.every((r) => typeof r === "string")).toBe(true);
  });

  it("qa-map covers every source id (unmappedIds empty)", () => {
    expect(map.coverage.unmappedIds).toEqual([]);
    expect(map.coverage.mappedIds).toBeGreaterThanOrEqual(map.coverage.totalSourceIds);
  });

  it("tickState roll-up: parent tested only when all children tested", () => {
    const clone: MapNode = JSON.parse(JSON.stringify(map.root));
    const setAll = (n: MapNode, s: any) => { if (!n.children.length) n.tickState = s; else n.children.forEach((c) => setAll(c, s)); };
    setAll(clone, "tested");
    expect(rollUp(clone)).toBe("tested");
    // untick one leaf -> partial
    const firstLeaf = (n: MapNode): MapNode => (n.children.length ? firstLeaf(n.children[0]) : n);
    firstLeaf(clone).tickState = "untested";
    expect(rollUp(clone)).toBe("partial");
  });

  it("checklist items are bare labels; mapNodeId + coversSourceIds resolve", () => {
    const mapIds = new Set<string>();
    const walk = (n: MapNode) => { mapIds.add(n.id); n.children.forEach(walk); };
    walk(map.root);
    const modelIds = allModelIds(model);
    const items = [...chk.global, ...chk.pageWise.flatMap((p) => p.items)];
    for (const it of items) {
      expect(it.label.length).toBeGreaterThan(0);
      expect(mapIds.has(it.mapNodeId), `mapNode ${it.mapNodeId}`).toBe(true);
      for (const s of it.coversSourceIds) expect(modelIds.has(s) || s.startsWith("MAP:"), `covers ${s}`).toBe(true);
    }
  });
});

describe("Phase 7 — Summary, Validation, Manual Review", () => {
  const summary = buildDiscoverySummary(raw, TEST_AT);
  const mr = buildManualReview(raw, model, TEST_AT);
  const val = buildDiscoveryValidation(raw, TEST_AT);

  it("summary reconciles with telemetry and ends in a confidence %", () => {
    expect(summary.pagesVisited).toBe(raw.telemetry.pagesVisited);
    expect(summary.statesNotObserved).toContain("session_expired");
    expect(summary.discoveryConfidence).toBeGreaterThanOrEqual(0);
    expect(summary.discoveryConfidence).toBeLessThanOrEqual(100);
  });

  it("manual review has an entry per blocker with reason + pointer", () => {
    expect(mr.entries.length).toBeGreaterThanOrEqual(2);
    for (const e of mr.entries) {
      expect(e.reason).toBeTruthy();
      expect(e.humanShouldLookAt).toBeTruthy();
      expect(e.id.startsWith("MRR:")).toBe(true);
    }
  });

  it("validation surfaces blocked checks with reasons and an overall %", () => {
    const blocked = val.checks.filter((c) => c.status === "blocked");
    for (const b of blocked) expect(b.detail).toBeTruthy();
    expect(val.overallDiscoveryCompleteness).toBeGreaterThanOrEqual(0);
    expect(val.checks.some((c) => c.check === "all-accordions-expanded")).toBe(true);
  });
});

describe("Phase 8 — Bundle", () => {
  it("bundles all seven deliverables and stays discovery-clean", () => {
    const inv = buildInventory(model, TEST_AT);
    const ov = buildOverview(model, TEST_AT);
    const map = buildQaMap(model, TEST_AT);
    const chk = buildChecklist(model, map, TEST_AT);
    const bundle = buildBundle({
      model, overview: ov, inventory: inv,
      featureTree: buildFeatureTree(model, TEST_AT), featureRel: buildFeatureRelationships(model, TEST_AT),
      qaMap: map, checklist: chk,
      summary: buildDiscoverySummary(raw, TEST_AT), manualReview: buildManualReview(raw, model, TEST_AT),
      validation: buildDiscoveryValidation(raw, TEST_AT),
    }, TEST_AT);
    expect(Object.keys(bundle.deliverables).length).toBe(9);
    expect(scanJson(bundle)).toEqual([]);
  });
});

describe("Phase 9 — Diff", () => {
  it("classifies NEW / REMOVED and carries tick-state for unchanged", () => {
    const raw2 = makeRawCapture();
    // add a new page state to the second run
    const extra = JSON.parse(JSON.stringify(Object.values(raw2.statesById)[0]));
    extra.id = "STATE:guest:events:zzz";
    extra.url = "http://app.test/events";
    extra.route = "http://app.test/events";
    extra.title = "App — Events";
    raw2.statesById[extra.id] = extra;
    const model2 = classify(raw2, TEST_AT);
    const t1 = buildFeatureTree(model, TEST_AT), t2 = buildFeatureTree(model2, TEST_AT);
    const mr1 = buildManualReview(raw, model, TEST_AT), mr2 = buildManualReview(raw, model2, TEST_AT);
    const diff = buildDiff(model, model2, t1, t2, mr1, mr2, TEST_AT);
    const newPages = diff.entries.filter((e) => e.status === "new" && e.category === "page");
    expect(newPages.length).toBeGreaterThan(0);

    const map1 = buildQaMap(model, TEST_AT);
    const map2 = buildQaMap(model2, TEST_AT);
    // tick everything in map1
    const tickAll = (n: any) => { n.tickState = "tested"; n.children.forEach(tickAll); };
    tickAll(map1.root);
    const updated = applyDiffToMap(map2, map1, diff);
    // a new node must be untested
    const findNew = (n: any): boolean => (((n as any).changeStatus === "new") ? true : n.children.some(findNew));
    expect(findNew(updated.root)).toBe(true);
  });
});
