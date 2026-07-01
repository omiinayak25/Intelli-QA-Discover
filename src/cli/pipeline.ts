/**
 * `pipeline` CLI — runs Phases 2-8 as pure transforms over a raw-capture.json.
 *
 *   pipeline --run <RUN:id> [--out runs]
 *
 * Consumes raw-capture.json and emits every downstream deliverable. Uses the
 * raw capture's generatedAt so re-running is byte-identical (deterministic).
 */

import path from "node:path";
import { FilesystemRepository } from "../storage/filesystem.js";
import { FILENAMES } from "../core/constants.js";
import { assertClean } from "../core/discipline.js";
import type { RawCapture } from "../core/raw-capture.js";
import type { DiscoveryModel } from "../core/types.js";
import { classify } from "../classifier/classifier.js";
import { renderDiscoveryModelMd } from "../classifier/render-md.js";
import {
  buildFeatureTree, buildFeatureRelationships, renderFeatureTreeMd, renderFeatureRelationshipsMd,
} from "../builders/feature-tree.js";
import {
  buildInventory, buildOverview, renderInventoryMd, renderOverviewMd,
} from "../builders/inventory.js";
import { buildQaMap, renderQaMapMd, renderQaMapHtml } from "../builders/qa-map.js";
import { buildChecklist, renderChecklistMd } from "../builders/checklist.js";
import {
  buildDiscoverySummary, buildManualReview, buildDiscoveryValidation,
  renderSummaryMd, renderManualReviewMd, renderValidationMd,
} from "../builders/summary.js";
import { buildBundle, renderReportMd, renderReportHtml } from "../builders/report.js";

interface Args { run?: string; out: string }

export function parseArgs(argv: string[]): Args {
  const args: Args = { out: "runs" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--run") args.run = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

export async function runPipeline(repo: FilesystemRepository, runId: string): Promise<DiscoveryModel> {
  const raw = await repo.loadJson<RawCapture>(runId, FILENAMES.rawCapture);
  const at = raw.generatedAt; // deterministic timestamp for all downstream artifacts

  // Phase 2 — Classification
  const model = classify(raw, at);
  assertClean(model, "discovery-model.json");
  await repo.saveJson(runId, FILENAMES.discoveryModelJson, model);
  const modelMd = renderDiscoveryModelMd(model);
  assertClean(modelMd, "discovery-model.md");
  await repo.saveFile(runId, FILENAMES.discoveryModelMd, modelMd);

  // Phase 3 — Feature Tree + Relationships
  const tree = buildFeatureTree(model, at);
  const rel = buildFeatureRelationships(model, at);
  assertClean(tree, "feature-tree.json");
  assertClean(rel, "feature-relationships.json");
  await repo.saveJson(runId, FILENAMES.featureTreeJson, tree);
  await repo.saveJson(runId, FILENAMES.featureRelationshipsJson, rel);
  await repo.saveFile(runId, FILENAMES.featureTreeMd, renderFeatureTreeMd(tree));
  await repo.saveFile(runId, FILENAMES.featureRelationshipsMd, renderFeatureRelationshipsMd(rel));

  // Phase 4 — Inventory + Overview
  const inventory = buildInventory(model, at);
  const overview = buildOverview(model, at);
  assertClean(inventory, "qa-inventory.json");
  assertClean(overview, "application-overview.json");
  await repo.saveJson(runId, FILENAMES.qaInventoryJson, inventory);
  await repo.saveJson(runId, FILENAMES.applicationOverviewJson, overview);
  const invMd = renderInventoryMd(inventory);
  const ovMd = renderOverviewMd(overview);
  assertClean(invMd, "qa-inventory.md");
  assertClean(ovMd, "application-overview.md");
  await repo.saveFile(runId, "qa-inventory.md", invMd);
  await repo.saveFile(runId, FILENAMES.applicationOverviewMd, ovMd);

  // Phase 5 — QA Map
  const qaMap = buildQaMap(model, at);
  assertClean(qaMap, "qa-map.json");
  await repo.saveJson(runId, FILENAMES.qaMapJson, qaMap);
  await repo.saveFile(runId, FILENAMES.qaMapMd, renderQaMapMd(qaMap));
  await repo.saveFile(runId, FILENAMES.qaMapHtml, renderQaMapHtml(qaMap));

  // Phase 6 — Checklist
  const checklist = buildChecklist(model, qaMap, at);
  assertClean(checklist, "qa-checklist.json");
  await repo.saveJson(runId, FILENAMES.qaChecklistJson, checklist);
  const chkMd = renderChecklistMd(checklist);
  assertClean(chkMd, "qa-checklist.md");
  await repo.saveFile(runId, FILENAMES.qaChecklistMd, chkMd);

  // Phase 7 — Discovery Summary, Validation, Manual Review
  const summary = buildDiscoverySummary(raw, at);
  const manualReview = buildManualReview(raw, model, at);
  const validation = buildDiscoveryValidation(raw, at);
  assertClean(summary, "discovery-summary.json");
  assertClean(manualReview, "manual-review.json");
  assertClean(validation, "discovery-validation.json");
  await repo.saveJson(runId, FILENAMES.discoverySummaryJson, summary);
  await repo.saveJson(runId, FILENAMES.manualReviewJson, manualReview);
  await repo.saveJson(runId, FILENAMES.discoveryValidationJson, validation);
  await repo.saveFile(runId, FILENAMES.discoverySummaryMd, renderSummaryMd(summary));
  await repo.saveFile(runId, FILENAMES.manualReviewMd, renderManualReviewMd(manualReview));
  await repo.saveFile(runId, FILENAMES.discoveryValidationMd, renderValidationMd(validation));

  // Phase 8 — Report bundle
  const inputs = { model, overview, inventory, featureTree: tree, featureRel: rel, qaMap, checklist, summary, manualReview, validation };
  const bundle = buildBundle(inputs, at);
  assertClean(bundle, "bundle.json");
  await repo.saveJson(runId, FILENAMES.bundleJson, bundle);
  const reportMd = renderReportMd(inputs);
  assertClean(reportMd, "report.md");
  await repo.saveFile(runId, FILENAMES.reportMd, reportMd);
  await repo.saveFile(runId, FILENAMES.reportHtml, renderReportHtml(inputs));

  return model;
}

const isMain = process.argv[1] && process.argv[1].endsWith("pipeline.ts");
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const repo = new FilesystemRepository(path.resolve(args.out));
  (async () => {
    let runId = args.run;
    if (!runId) {
      const runs = await repo.listRuns();
      if (!runs.length) throw new Error("no runs found; run `discover` first");
      runId = runs[runs.length - 1].replace(/_/g, ":").replace("RUN:", "RUN:");
      // listRuns returns dir names; restore RUN: prefix
      runId = "RUN:" + runs[runs.length - 1].replace(/^RUN_/, "");
    }
    console.log(`[pipeline] building deliverables for ${runId} …`);
    const model = await runPipeline(repo, runId);
    console.log(
      `[pipeline] done. pages=${model.pages.length} components=${model.components.length} ` +
        `features=${model.features.length} flows=${model.flows.length} apis=${model.apis.length}`,
    );
    console.log(`[pipeline] artifacts in: ${repo.runDir(runId)}`);
  })().catch((err) => {
    console.error("[pipeline] error:", err.message);
    process.exit(1);
  });
}
