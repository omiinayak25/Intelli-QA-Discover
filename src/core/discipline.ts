/**
 * Scope-discipline enforcement — the bright, non-negotiable line.
 *
 * The product DISCOVERS and ORGANIZES; the human TESTS. No artifact may contain
 * a test case, a pass/fail verdict, a risk score, or a verification instruction.
 *
 * This module owns the single canonical forbidden-token list. Every phase's
 * scope-discipline gate uses THIS regex — not a per-phase ad-hoc set.
 */

/**
 * Canonical forbidden-token regex (case-insensitive), transcribed verbatim from
 * the Global Quality Gates. A hit in an emitted artifact is a defect.
 */
export const FORBIDDEN_REGEX =
  /\b(test\s*case|expected(\s+(result|output|value|behavior|behaviour))?|assert(ion|\s+pass)?|pass\/fail|given\s+.*\s+when\s+.*\s+then|verify|should\s+(return|be|equal|display|open|show|navigate|redirect|load)?|risk\s+score|severity|heatmap|pass\s+probability|confidence\s+to\s+pass)\b/i;

const GLOBAL_FORBIDDEN =
  /\b(test\s*case|expected(\s+(result|output|value|behavior|behaviour))?|assert(ion|\s+pass)?|pass\/fail|given\s+.*\s+when\s+.*\s+then|verify|should\s+(return|be|equal|display|open|show|navigate|redirect|load)?|risk\s+score|severity|heatmap|pass\s+probability|confidence\s+to\s+pass)\b/gi;

export interface DisciplineHit {
  token: string;
  index: number;
  context: string;
  path?: string;
}

/** Scan raw text for forbidden tokens. Returns every hit. */
export function scanText(text: string, path?: string): DisciplineHit[] {
  const hits: DisciplineHit[] = [];
  if (!text) return hits;
  GLOBAL_FORBIDDEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GLOBAL_FORBIDDEN.exec(text)) !== null) {
    const start = Math.max(0, m.index - 30);
    const end = Math.min(text.length, m.index + m[0].length + 30);
    hits.push({
      token: m[0],
      index: m.index,
      context: text.slice(start, end).replace(/\s+/g, " "),
      path,
    });
    if (m.index === GLOBAL_FORBIDDEN.lastIndex) GLOBAL_FORBIDDEN.lastIndex++;
  }
  return hits;
}

/**
 * Walk a JSON value and scan every STRING (keys and values) for forbidden tokens.
 * Records the JSON path so a violation is traceable.
 */
export function scanJson(value: unknown, basePath = "$"): DisciplineHit[] {
  const hits: DisciplineHit[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === "string") {
      for (const h of scanText(v, p)) hits.push(h);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        // keys are contract field names; scan their string values only.
        walk(val, `${p}.${k}`);
      }
    }
  };
  walk(value, basePath);
  return hits;
}

/** True when the text is discovery-clean (zero forbidden tokens). */
export function isClean(text: string): boolean {
  return scanText(text).length === 0;
}

/**
 * Assert a value (string | object) is discovery-clean. Throws with a report
 * listing every hit. Used by builders before they emit an artifact.
 */
export function assertClean(value: unknown, label = "artifact"): void {
  const hits = typeof value === "string" ? scanText(value) : scanJson(value);
  if (hits.length > 0) {
    const report = hits
      .slice(0, 20)
      .map((h) => `  - "${h.token}" at ${h.path ?? h.index}: …${h.context}…`)
      .join("\n");
    throw new Error(
      `Scope-discipline violation in ${label}: ${hits.length} forbidden token(s):\n${report}\n` +
        `Discovery only — no test cases, no pass/fail, no risk scores, no verification instructions.`,
    );
  }
}
