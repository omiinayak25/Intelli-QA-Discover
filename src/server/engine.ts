/**
 * Engine runner — wraps the EXISTING Discovery Engine (Explorer + pipeline) as a
 * service. It does not modify the engine or the Discovery Model; it orchestrates
 * a run, forwards progress, and returns a history record.
 */

import path from "node:path";
import { Explorer, type ExplorerProgress } from "../explorer/explorer.js";
import type { ExplorerConfig } from "../explorer/config.js";
import { runPipeline } from "../cli/pipeline.js";
import { FILENAMES } from "../core/constants.js";
import { DiscoveryStore, safeId, type DiscoveryRecord } from "./store.js";

export interface DiscoverOptions {
  crawlId?: string;
  maxStates?: number;
  maxDepth?: number;
  maxTimeMs?: number;
  captureScreenshots?: boolean;
  captureResponsive?: boolean;
  sameOriginOnly?: boolean;
}

export interface StageProgress {
  stage: string; // human-readable stage label
  pct: number; // 0-100 coarse estimate
  pagesVisited?: number;
  componentsFound?: number;
  currentUrl?: string;
  currentTitle?: string;
  blocked?: number;
}

const STAGE_ORDER = [
  "Opening browser",
  "Discovering pages",
  "Finding components",
  "Generating screenshots",
  "Generating discovery model",
  "Building business tree",
  "Rendering report",
  "Saving discovery",
];

function appNameFrom(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    const base = h.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return "Application";
  }
}

/** Fetch robots.txt Disallow rules for the target so the crawl respects them. */
async function fetchRobotsDisallow(url: string): Promise<string[]> {
  try {
    const robotsUrl = new URL("/robots.txt", url).toString();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(robotsUrl, { signal: ctrl.signal, headers: { "user-agent": "IntelliQADiscover (read-only)" } });
    clearTimeout(t);
    if (!res.ok) return [];
    const txt = await res.text();
    const out: string[] = [];
    let applies = false;
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      const m = line.match(/^(user-agent|disallow):\s*(.*)$/i);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === "user-agent") applies = val === "*";
      else if (key === "disallow" && applies && val) out.push(val);
    }
    return Array.from(new Set(out));
  } catch {
    return [];
  }
}

export async function runDiscovery(
  store: DiscoveryStore,
  url: string,
  opts: DiscoverOptions,
  onProgress: (p: StageProgress) => void,
): Promise<DiscoveryRecord> {
  const started = Date.now();
  onProgress({ stage: STAGE_ORDER[0], pct: 3 });

  const robotsDisallow = await fetchRobotsDisallow(url);

  const config: Partial<ExplorerConfig> & { url: string } = {
    url,
    crawlId: opts.crawlId,
    headless: true,
    maxStates: opts.maxStates ?? 40,
    maxDepth: opts.maxDepth ?? 3,
    maxTimeMs: opts.maxTimeMs ?? 180_000,
    navigationTimeoutMs: 30_000,
    sameOriginOnly: opts.sameOriginOnly ?? true,
    captureScreenshots: opts.captureScreenshots ?? true,
    captureResponsive: opts.captureResponsive ?? true,
    robotsDisallow,
    roles: [{ role: "guest" }],
    outputDir: store.runsDir,
  };

  const generatedAt = new Date().toISOString();
  const forward = (ev: ExplorerProgress) => {
    let stage = "Discovering pages";
    let pct = 10;
    if (ev.stage === "crawling-role") { stage = "Opening browser"; pct = 6; }
    else if (ev.stage === "exploring") {
      const visited = ev.pagesVisited ?? 0;
      // crawl phase spans ~10-60% of the coarse bar
      pct = Math.min(60, 10 + visited * 2.5);
      stage = ev.componentsFound && ev.componentsFound > 40 ? "Finding components" : "Discovering pages";
    }
    onProgress({
      stage,
      pct,
      pagesVisited: ev.pagesVisited,
      componentsFound: ev.componentsFound,
      currentUrl: ev.currentUrl,
      currentTitle: ev.currentTitle,
      blocked: ev.blocked,
    });
  };

  const explorer = new Explorer(config, store.repo, generatedAt, forward);
  const runId = explorer.id;

  const capture = await explorer.run();
  onProgress({ stage: "Generating screenshots", pct: 62, pagesVisited: capture.counts.states, componentsFound: capture.counts.components });

  // persist raw capture + per-state files (as the discover CLI does)
  await store.repo.saveJson(runId, FILENAMES.rawCapture, capture);
  for (const [sid, state] of Object.entries(capture.statesById)) {
    await store.repo.saveJson(runId, path.join("states", `${safeId(sid)}.json`), state);
  }

  onProgress({ stage: "Generating discovery model", pct: 70 });
  const model = await runPipeline(store.repo, runId);
  onProgress({ stage: "Building business tree", pct: 88 });

  // read rollups for the history record
  const summary = await store.repo.loadJson<any>(runId, FILENAMES.discoverySummaryJson).catch(() => ({}));
  const validation = await store.repo.loadJson<any>(runId, FILENAMES.discoveryValidationJson).catch(() => ({}));
  const manualReview = await store.repo.loadJson<any>(runId, FILENAMES.manualReviewJson).catch(() => ({ entries: [] }));

  onProgress({ stage: "Rendering report", pct: 95 });

  const record: DiscoveryRecord = {
    id: safeId(runId),
    runId,
    url,
    appName: appNameFrom(url),
    createdAt: generatedAt,
    status: "done",
    confidence: summary.discoveryConfidence,
    completeness: validation.overallDiscoveryCompleteness,
    counts: {
      pages: model.pages.length,
      components: model.components.length,
      features: model.features.length,
      flows: model.flows.length,
      forms: model.forms.length,
      apis: model.apis.length,
      manualReview: (manualReview.entries || []).length,
    },
    durationMs: Date.now() - started,
  };
  onProgress({ stage: "Saving discovery", pct: 100 });
  return record;
}

export { STAGE_ORDER };
