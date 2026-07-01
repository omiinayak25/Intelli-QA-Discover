/**
 * `diff` CLI — Phase 9 (optional). Compares two discovery runs.
 *
 *   diff --from <RUN:old> --to <RUN:new> [--out runs]
 *
 * Emits diff-report.json + diff-report.md and writes flagged, tick-state-carried
 * qa-map.json / qa-checklist.json for the NEW run.
 */

import path from "node:path";
import { FilesystemRepository } from "../storage/filesystem.js";
import { FILENAMES } from "../core/constants.js";
import type { DiscoveryModel } from "../core/types.js";
import type { FeatureTree } from "../builders/feature-tree.js";
import type { ManualReview } from "../builders/summary.js";
import type { QaMap } from "../builders/qa-map.js";
import { buildDiff, applyDiffToMap, renderDiffMd } from "../builders/diff.js";

interface Args { from?: string; to?: string; out: string }

function parseArgs(argv: string[]): Args {
  const a: Args = { out: "runs" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") a.from = argv[++i];
    else if (argv[i] === "--to") a.to = argv[++i];
    else if (argv[i] === "--out") a.out = argv[++i];
  }
  return a;
}

const isMain = process.argv[1] && process.argv[1].endsWith("diff.ts");
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from || !args.to) {
    console.error("[diff] --from <runId> and --to <runId> are required");
    process.exit(1);
  }
  const repo = new FilesystemRepository(path.resolve(args.out));
  (async () => {
    const [oldModel, newModel] = await Promise.all([
      repo.loadJson<DiscoveryModel>(args.from!, FILENAMES.discoveryModelJson),
      repo.loadJson<DiscoveryModel>(args.to!, FILENAMES.discoveryModelJson),
    ]);
    const [oldTree, newTree] = await Promise.all([
      repo.loadJson<FeatureTree>(args.from!, FILENAMES.featureTreeJson),
      repo.loadJson<FeatureTree>(args.to!, FILENAMES.featureTreeJson),
    ]);
    const [oldMr, newMr] = await Promise.all([
      repo.loadJson<ManualReview>(args.from!, FILENAMES.manualReviewJson),
      repo.loadJson<ManualReview>(args.to!, FILENAMES.manualReviewJson),
    ]);
    const at = newModel.generatedAt;
    const diff = buildDiff(oldModel, newModel, oldTree, newTree, oldMr, newMr, at);
    await repo.saveJson(args.to!, FILENAMES.diffReportJson, diff);
    await repo.saveFile(args.to!, FILENAMES.diffReportMd, renderDiffMd(diff));

    // update qa-map for the new run: carry tick-state for unchanged, flag deltas
    const [oldMap, newMap] = await Promise.all([
      repo.loadJson<QaMap>(args.from!, FILENAMES.qaMapJson),
      repo.loadJson<QaMap>(args.to!, FILENAMES.qaMapJson),
    ]);
    const updated = applyDiffToMap(newMap, oldMap, diff);
    await repo.saveJson(args.to!, FILENAMES.qaMapJson, updated);

    const totals = Object.values(diff.byCategory).reduce(
      (a, c) => ({ new: a.new + c.new, removed: a.removed + c.removed, changed: a.changed + c.changed }),
      { new: 0, removed: 0, changed: 0 },
    );
    console.log(`[diff] ${args.from} → ${args.to}: new=${totals.new} removed=${totals.removed} changed=${totals.changed}`);
    console.log(`[diff] wrote diff-report.json + diff-report.md`);
  })().catch((err) => {
    console.error("[diff] error:", err.message);
    process.exit(1);
  });
}
