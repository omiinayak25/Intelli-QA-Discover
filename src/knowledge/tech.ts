/**
 * Technology Detection Agent — fetches an application's homepage HTML
 * server-side (no browser, no re-crawl) and detects the tech stack from
 * signatures. Every hit records the exact marker as evidence. Cached; degrades
 * to an empty (honest "not detected") result when offline.
 */

import { TECH_SIGS } from "./signatures.js";
import type { TechHit } from "../platform/db.js";

const cache = new Map<string, { at: number; hits: TechHit[] }>();
const TTL = 60 * 60 * 1000;

export async function detectTech(url: string): Promise<TechHit[]> {
  const origin = safeOrigin(url);
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.at < TTL) return cached.hits;

  let html = "";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(origin, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 IntelliQADiscover" }, redirect: "follow" });
    clearTimeout(t);
    if (res.ok) html = (await res.text()).slice(0, 400_000);
  } catch { /* offline — return empty, honestly */ }

  const hits: TechHit[] = [];
  const seen = new Set<string>();
  for (const sig of TECH_SIGS) {
    const m = html.match(sig.re);
    if (m && !seen.has(sig.name)) {
      seen.add(sig.name);
      hits.push({ name: sig.name, category: sig.category, confidence: 90, evidence: (m[0] || "").slice(0, 60) });
    }
  }
  // SPA/MPA heuristic from the shell (evidence: a near-empty <body> root)
  if (html && /<div id="root"><\/div>|<div id="app"><\/div>|<app-root><\/app-root>/.test(html) && !seen.has("Single-Page App")) {
    hits.push({ name: "Single-Page App", category: "architecture", confidence: 80, evidence: "empty mount node in initial HTML" });
  }
  if (hits.length) cache.set(origin, { at: Date.now(), hits });
  return hits;
}

function safeOrigin(url: string): string { try { return new URL(url).origin; } catch { return url; } }
