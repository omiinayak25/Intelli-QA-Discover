/**
 * `e2e` CLI — one-shot: crawl a URL, build all deliverables, run the scope gate.
 *
 *   e2e --url <URL> [--config config.json] [--out runs]
 */

import path from "node:path";
import { FilesystemRepository } from "../storage/filesystem.js";
import { runDiscover, parseArgs as parseDiscoverArgs } from "./discover.js";
import { runPipeline } from "./pipeline.js";
import { lintDir } from "./scope-lint.js";

const isMain = process.argv[1] && process.argv[1].endsWith("e2e.ts");
if (isMain) {
  const args = parseDiscoverArgs(process.argv.slice(2));
  (async () => {
    const runId = await runDiscover(args);
    const repo = new FilesystemRepository(path.resolve(args.out));
    await runPipeline(repo, runId);
    const results = await lintDir(repo.runDir(runId));
    if (results.length) {
      console.error(`[e2e] scope-lint FAILED: ${results.length} file(s) with forbidden tokens`);
      process.exit(1);
    }
    console.log(`[e2e] ✔ complete. All deliverables under ${repo.runDir(runId)} · scope-clean.`);
  })().catch((err) => {
    console.error("[e2e] error:", err.message);
    process.exit(1);
  });
}
