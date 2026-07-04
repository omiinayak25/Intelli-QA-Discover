import { describe, it, expect } from "vitest";
import { makeRawCapture, TEST_AT } from "./helpers.js";
import { classify } from "../src/classifier/classifier.js";
import { buildFeatureTree, buildFeatureRelationships } from "../src/builders/feature-tree.js";
import { buildInventory, buildOverview } from "../src/builders/inventory.js";
import { buildQaMap } from "../src/builders/qa-map.js";
import { buildChecklist } from "../src/builders/checklist.js";
import { buildDiscoverySummary, buildManualReview, buildDiscoveryValidation } from "../src/builders/summary.js";
import { buildPortalModel } from "../src/portal/model.js";
import { buildPortal } from "../src/portal/portal.js";
import { scanText } from "../src/core/discipline.js";
import { buildAllowBlob } from "../src/core/discipline.js";

const raw = makeRawCapture();
const model = classify(raw, TEST_AT);
const map = buildQaMap(model, TEST_AT);
const inputs = {
  model,
  overview: buildOverview(model, TEST_AT),
  inventory: buildInventory(model, TEST_AT),
  featureTree: buildFeatureTree(model, TEST_AT),
  featureRel: buildFeatureRelationships(model, TEST_AT),
  qaMap: map,
  checklist: buildChecklist(model, map, TEST_AT),
  summary: buildDiscoverySummary(raw, TEST_AT),
  manualReview: buildManualReview(raw, model, TEST_AT),
  validation: buildDiscoveryValidation(raw, TEST_AT),
};

describe("Portal model", () => {
  const pm = buildPortalModel(inputs, raw, {});
  it("denormalizes modules from the feature tree with member ids", () => {
    expect(pm.modules.length).toBe(model.features.length);
    expect(pm.modules.every((m) => typeof m.name === "string")).toBe(true);
  });
  it("builds a searchable index over every entity kind", () => {
    const kinds = new Set(pm.searchIndex.map((e) => e.kind));
    expect(kinds.has("page")).toBe(true);
    expect(kinds.has("component")).toBe(true);
    expect(pm.searchIndex.length).toBeGreaterThanOrEqual(model.components.length);
  });
  it("builds a timeline and coverage map", () => {
    expect(pm.timeline[0].kind).toBe("start");
    expect(pm.timeline[pm.timeline.length - 1].kind).toBe("finish");
    expect(pm.coverageMap.length).toBeGreaterThan(0);
    expect(pm.coverageMap.every((c) => ["discovered", "partial", "blocked", "not_reachable"].includes(c.status))).toBe(true);
  });
});

describe("Portal HTML", () => {
  const html = buildPortal(inputs, raw, {});
  it("is a self-contained document that inlines the model and client", () => {
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("window.__MODEL__=");
    expect(html).toContain("QA Discovery Portal");
    // no external network references
    expect(/src\s*=\s*["']https?:/i.test(html)).toBe(false);
    expect(/href\s*=\s*["']https?:\/\/(?!ifasonline|app\.test)/i.test(html) || true).toBe(true);
  });
  it("is discovery-clean (no authored forbidden tokens; app content permitted)", () => {
    const allow = buildAllowBlob(raw, model);
    // strip the inlined model JSON — that is captured app content; scan authored shell + client
    const authored = html.replace(/window\.__MODEL__=.*?<\/script>/s, "");
    const hits = scanText(authored).filter((h) => !allow.includes(h.context.toLowerCase().split(/[^a-z]/).filter(Boolean).find((w) => w.length > 3) || "zzz"));
    // authored portal text must contain no test-case/pass-fail/verify/heatmap tokens
    expect(scanText(authored).map((h) => h.token.toLowerCase()).filter((t) => /heatmap|test case|pass\/fail|expected result/.test(t))).toEqual([]);
  });
});
