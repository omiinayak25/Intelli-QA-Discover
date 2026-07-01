/**
 * `scope-lint` CLI — Global Quality Gate 5/6.
 *
 * Runs the canonical forbidden-token scan over every EMITTED artifact in a run.
 * A hit in AUTHORED text (our narrative / inference) is a defect and fails.
 *
 * A hit that is attributable to captured APP CONTENT — the target application's
 * own label, endpoint, or URL (e.g. Amazon's `/_sec/verify` security endpoint) —
 * is the spec's permitted "inventory noun" and is reported, not failed.
 *
 * Exit code 0 = no authored violations; 1 = authored violations found.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { scanText, scanTextAllow, buildAllowBlob, type DisciplineHit } from "../core/discipline.js";

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
      if (e.name === "captures" || e.name === "states") continue; // binary/raw evidence
      out.push(...(await walk(full)));
    } else if (/\.(json|md|html)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

async function loadAllowBlob(runDir: string): Promise<string> {
  const sources: unknown[] = [];
  for (const f of ["discovery-model.json", "raw-capture.json"]) {
    try {
      sources.push(JSON.parse(await fs.readFile(path.join(runDir, f), "utf8")));
    } catch {
      /* absent */
    }
  }
  return buildAllowBlob(...sources);
}

export interface LintResult {
  file: string;
  violations: DisciplineHit[];
  permitted: number;
}

/** Lint a single run directory (app-content aware). */
export async function lintRun(runDir: string): Promise<LintResult[]> {
  const allow = await loadAllowBlob(runDir);
  const files = await walk(runDir);
  const results: LintResult[] = [];
  for (const f of files) {
    if (/(^|\/)(raw-capture)\.json$/.test(f)) continue; // pure evidence, not a deliverable
    const text = await fs.readFile(f, "utf8");
    const all = scanText(text).length;
    const violations = scanTextAllow(text, allow);
    results.push({ file: f, violations, permitted: all - violations.length });
  }
  return results;
}

/** Back-compat: plain scan (no app allow-blob) — used by tests. */
export async function lintDir(dir: string): Promise<{ file: string; hits: DisciplineHit[] }[]> {
  const runs = await discoverRunDirs(dir);
  const out: { file: string; hits: DisciplineHit[] }[] = [];
  for (const rd of runs) {
    for (const r of await lintRun(rd)) if (r.violations.length) out.push({ file: r.file, hits: r.violations });
  }
  return out;
}

async function discoverRunDirs(target: string): Promise<string[]> {
  // target is a run dir if it holds discovery-model.json or raw-capture.json
  for (const marker of ["discovery-model.json", "raw-capture.json"]) {
    try {
      await fs.access(path.join(target, marker));
      return [target];
    } catch {
      /* keep looking */
    }
  }
  // otherwise treat immediate subdirectories as runs
  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(target, e.name));
  } catch {
    return [];
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("scope-lint.ts");
if (isMain) {
  const target = path.resolve(process.argv[2] ?? "runs");
  (async () => {
    const runDirs = await discoverRunDirs(target);
    let totalViolations = 0;
    let totalPermitted = 0;
    const violatingFiles: LintResult[] = [];
    for (const rd of runDirs) {
      for (const r of await lintRun(rd)) {
        totalPermitted += r.permitted;
        if (r.violations.length) {
          totalViolations += r.violations.length;
          violatingFiles.push(r);
        }
      }
    }
    if (totalPermitted > 0) {
      console.log(
        `[scope-lint] ${totalPermitted} forbidden-token match(es) permitted as captured app content ` +
          `(the target app's own labels/endpoints — the inventory-noun exception).`,
      );
    }
    if (totalViolations === 0) {
      console.log(`[scope-lint] ✔ ${target}: ZERO authored violations. Discovery only.`);
      process.exit(0);
    }
    console.error(`[scope-lint] ✘ ${totalViolations} authored forbidden token(s) in ${violatingFiles.length} file(s):`);
    for (const r of violatingFiles) {
      console.error(`\n  ${r.file}`);
      for (const h of r.violations.slice(0, 8)) console.error(`    - "${h.token}": …${h.context}…`);
    }
    process.exit(1);
  })();
}
