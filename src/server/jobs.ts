/**
 * Job manager — runs discoveries asynchronously and tracks live progress so the
 * frontend can render a progress page (via polling or SSE).
 */

import { EventEmitter } from "node:events";
import { runDiscovery, type DiscoverOptions, type StageProgress } from "./engine.js";
import { DiscoveryStore, safeId, type DiscoveryRecord } from "./store.js";
import { id as makeId, hash } from "../core/ids.js";

export interface JobState {
  id: string;
  runId: string;
  url: string;
  status: "running" | "done" | "error";
  progress: StageProgress;
  error?: string;
  startedAt: number;
}

export class JobManager {
  private jobs = new Map<string, JobState>();
  private bus = new EventEmitter();

  constructor(private readonly store: DiscoveryStore) {
    this.bus.setMaxListeners(0);
  }

  get(id: string): JobState | undefined {
    return this.jobs.get(id);
  }

  /** Start a discovery; returns the record id immediately (job runs in background). */
  async start(url: string, opts: DiscoverOptions, presetRunId?: string): Promise<string> {
    // stable id derived from url + time (unique per run)
    const runId = presetRunId ?? makeId("RUN", hash(url, String(Date.now()), String(Math.round(performance.now()))));
    const id = safeId(runId);
    const now = new Date().toISOString();

    const rec: DiscoveryRecord = {
      id,
      runId,
      url,
      appName: "",
      createdAt: now,
      status: "running",
    };
    await this.store.upsert(rec);

    this.jobs.set(id, {
      id,
      runId,
      url,
      status: "running",
      progress: { stage: "Queued", pct: 0 },
      startedAt: Date.now(),
    });

    // run in background
    void this.run(id, runId, url, opts);
    return id;
  }

  private async run(id: string, runId: string, url: string, opts: DiscoverOptions): Promise<void> {
    const emit = (progress: StageProgress) => {
      const job = this.jobs.get(id);
      if (job) job.progress = progress;
      this.bus.emit(id, { type: "progress", progress });
    };
    try {
      // pass our crawlId so the engine's runId lines up with this job + record
      const crawlId = runId.replace(/^RUN:/, "");
      const record = await runDiscovery(this.store, url, { ...opts, crawlId }, emit);
      const done: DiscoveryRecord = { ...record, id, runId };
      await this.store.upsert(done);
      const job = this.jobs.get(id);
      if (job) { job.status = "done"; job.progress = { stage: "Saving discovery", pct: 100 }; }
      this.bus.emit(id, { type: "done", record: done });
    } catch (err) {
      const message = (err as Error).message || "discovery failed";
      await this.store.patch(id, { status: "error", error: message });
      const job = this.jobs.get(id);
      if (job) { job.status = "error"; job.error = message; }
      this.bus.emit(id, { type: "error", error: message });
    }
  }

  /** Subscribe to a job's events; returns an unsubscribe fn. */
  subscribe(id: string, listener: (ev: any) => void): () => void {
    this.bus.on(id, listener);
    return () => this.bus.off(id, listener);
  }
}
