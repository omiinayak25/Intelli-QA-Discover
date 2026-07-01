/**
 * `discover` CLI — Phase 1 entry point.
 *
 *   discover --url <URL> [--config config.json] [--headed] [--out runs]
 *
 * Runs the safe-crawl Explorer and writes raw-capture.json (+ per-state files).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Explorer } from "../explorer/explorer.js";
import { FilesystemRepository } from "../storage/filesystem.js";
import type { ExplorerConfig } from "../explorer/config.js";
import { FILENAMES } from "../core/constants.js";

interface Args {
  url?: string;
  config?: string;
  out: string;
  headed: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { out: "runs", headed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--config") args.config = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--headed") args.headed = true;
  }
  return args;
}

export async function runDiscover(args: Args): Promise<string> {
  let partial: Partial<ExplorerConfig> & { url: string };
  if (args.config) {
    const raw = JSON.parse(await fs.readFile(args.config, "utf8"));
    partial = { ...raw };
    if (args.url) partial.url = args.url;
  } else {
    if (!args.url) throw new Error("--url is required (or provide --config with a url)");
    partial = { url: args.url };
  }
  partial.outputDir = args.out;
  if (args.headed) partial.headless = false;

  const repo = new FilesystemRepository(path.resolve(args.out));
  const generatedAt = new Date().toISOString();
  const explorer = new Explorer(partial, repo, generatedAt);
  const runId = explorer.id;

  console.log(`[discover] crawling ${partial.url} as run ${runId} …`);
  const capture = await explorer.run();

  await repo.saveJson(runId, FILENAMES.rawCapture, capture);
  // per-state files (contract: states/<stateId>.json)
  for (const [sid, state] of Object.entries(capture.statesById)) {
    const safe = sid.replace(/[^a-zA-Z0-9._-]/g, "_");
    await repo.saveJson(runId, path.join("states", `${safe}.json`), state);
  }

  console.log(
    `[discover] done. states=${capture.counts.states} components=${capture.counts.components} ` +
      `forms=${capture.counts.forms} requests=${capture.counts.requests} blocked=${capture.blockedItems.length}`,
  );
  console.log(`[discover] run dir: ${repo.runDir(runId)}`);
  return runId;
}

// direct execution
const isMain = process.argv[1] && process.argv[1].endsWith("discover.ts");
if (isMain) {
  runDiscover(parseArgs(process.argv.slice(2)))
    .then((rid) => {
      process.stdout.write(rid + "\n");
    })
    .catch((err) => {
      console.error("[discover] error:", err.message);
      process.exit(1);
    });
}
