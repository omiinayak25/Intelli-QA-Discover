/**
 * `scope-lint` CLI — Global Quality Gate 5/6.
 *
 * Runs the canonical forbidden-token scan over every EMITTED artifact in a run
 * directory. Any hit is a scope-discipline defect (a test case, pass/fail,
 * expected result, verification, or risk score leaked into an output).
 *
 * Exit code 0 = clean; 1 = violations found.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { scanText, type DisciplineHit } from "../core/discipline.js";

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "captures") continue; // binary evidence
      out.push(...(await walk(full)));
    } else if (/\.(json|md|html)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

export async function lintDir(dir: string): Promise<{ file: string; hits: DisciplineHit[] }[]> {
  const files = await walk(dir);
  const results: { file: string; hits: DisciplineHit[] }[] = [];
  for (const f of files) {
    const text = await fs.readFile(f, "utf8");
    const hits = scanText(text);
    if (hits.length) results.push({ file: f, hits });
  }
  return results;
}

const isMain = process.argv[1] && process.argv[1].endsWith("scope-lint.ts");
if (isMain) {
  const target = process.argv[2] ?? "runs";
  (async () => {
    const results = await lintDir(path.resolve(target));
    if (results.length === 0) {
      console.log(`[scope-lint] ✔ ${target}: ZERO forbidden tokens. Discovery only.`);
      process.exit(0);
    }
    console.error(`[scope-lint] ✘ forbidden tokens found in ${results.length} file(s):`);
    for (const r of results) {
      console.error(`\n  ${r.file}`);
      for (const h of r.hits.slice(0, 8)) console.error(`    - "${h.token}": …${h.context}…`);
    }
    process.exit(1);
  })();
}
