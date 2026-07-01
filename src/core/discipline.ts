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
 * The "inventory noun" exception (per the canonical spec): a forbidden-token
 * match is PERMITTED where the word names a discovered surface captured verbatim
 * from the target application — e.g. Amazon's own `/_sec/verify` endpoint, or an
 * app's "Verify Email" page label. Such content is discovery, not prescription.
 *
 * An allow-blob is a lowercased concatenation of every captured string in a run
 * (labels, names, titles, endpoint patterns, URLs, selectors, ids, request
 * shapes, options, placeholders). A hit is permitted only when the token, in the
 * context of its surrounding "word", is attributable to that captured content.
 */
export function buildAllowBlob(...sources: unknown[]): string {
  const parts: string[] = [];
  const push = (s: string) => {
    parts.push(s);
    // also the slugged form, so slug-derived ids (MAP:/CHK:/…) match too.
    const sl = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (sl && sl !== s.toLowerCase()) parts.push(sl);
  };
  const collect = (v: unknown) => {
    if (typeof v === "string") push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(collect);
  };
  sources.forEach(collect);
  return parts.join("  ").toLowerCase();
}

const WORD_AROUND = /[\w/:._?=%&+-]+/g;

/** The surrounding "word" (path/label token) that contains index `idx` in text. */
function wordAround(text: string, idx: number): string {
  WORD_AROUND.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_AROUND.exec(text)) !== null) {
    if (m.index <= idx && idx < m.index + m[0].length) return m[0];
    if (m.index > idx) break;
  }
  return text.slice(Math.max(0, idx - 15), idx + 15);
}

/**
 * A hit is permitted when the forbidden token is carried inside a LARGER app
 * token/phrase — an endpoint/id path segment (e.g. `post-sec-verify-provider`)
 * or a captured multi-word label (e.g. `verify email`). The candidate must
 * contain the token AND be strictly longer than the bare token, so a lone app
 * word (e.g. a "Verify" button) can never launder an authored "verify the …".
 */
function isPermittedByApp(text: string, hit: DisciplineHit, allowBlob: string): boolean {
  if (!allowBlob) return false;
  const tok = hit.token.toLowerCase().trim();
  const tokJoined = tok.replace(/\s+/g, "");
  const first = tok.split(/\s+/)[0];
  const candidates = new Set<string>();

  // (1) path/id-segment candidates: the surrounding [\w/:._?=%&+-]+ word + its :/ splits
  const word = wordAround(text, hit.index).toLowerCase();
  for (const seg of [word, ...word.split(/[:/]/)]) {
    if (seg.includes(tokJoined)) candidates.add(seg);
  }

  // (2) adjacent-word phrase candidates: 2-3 word windows around the token
  const start = Math.max(0, hit.index - 30);
  const ctx = text.slice(start, hit.index + hit.token.length + 30).toLowerCase();
  const words = ctx.split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (!words[i].includes(first)) continue;
    for (const [a, b] of [[i - 1, i], [i, i + 1], [i - 1, i + 1], [i, i + 2]]) {
      if (a < 0 || b >= words.length) continue;
      candidates.add(words.slice(a, b + 1).join(" "));
      candidates.add(words.slice(a, b + 1).join("-"));
    }
  }

  for (const c of candidates) {
    // Strictly longer than the FULL token (spaces included) — so a candidate
    // equal to a multi-word forbidden phrase (e.g. "should return") can never
    // launder itself; only a genuinely larger app token/phrase qualifies.
    if (c.length > tok.length && c.includes(first) && allowBlob.includes(c)) return true;
  }
  return false;
}

/** scanText, but drop hits attributable to captured app content (allow-blob). */
export function scanTextAllow(text: string, allowBlob: string): DisciplineHit[] {
  return scanText(text).filter((h) => !isPermittedByApp(text, h, allowBlob));
}

/** scanJson over string values, dropping hits attributable to captured app content. */
export function scanJsonAllow(value: unknown, allowBlob: string): DisciplineHit[] {
  const out: DisciplineHit[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === "string") {
      for (const h of scanText(v, p)) if (!isPermittedByApp(v, h, allowBlob)) out.push(h);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) walk(val, `${p}.${k}`);
    }
  };
  walk(value, "$");
  return out;
}

/**
 * Assert a value (string | object) is discovery-clean. Throws with a report
 * listing every hit. Used by builders before they emit an artifact.
 *
 * When `allowBlob` is supplied, hits attributable to captured app content are
 * permitted (the inventory-noun exception); only authored drift fails.
 */
export function assertClean(value: unknown, label = "artifact", allowBlob = ""): void {
  const hits =
    typeof value === "string"
      ? allowBlob
        ? scanTextAllow(value, allowBlob)
        : scanText(value)
      : allowBlob
        ? scanJsonAllow(value, allowBlob)
        : scanJson(value);
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
