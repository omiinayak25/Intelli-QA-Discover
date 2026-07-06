/**
 * Discovery store — the platform's data access. Metadata (projects + runs) lives
 * in SQLite (the source of truth, via the platform Db); the full run artifacts
 * (Discovery Model, screenshots, exports) stay on disk behind the existing
 * FilesystemRepository (the cache). The public interface is unchanged so the job
 * manager, engine, and routes keep working; project grouping is layered on top.
 */

import { promises as fs, mkdirSync } from "node:fs";
import path from "node:path";
import { FilesystemRepository } from "../storage/filesystem.js";
import { FILENAMES } from "../core/constants.js";
import { Db, type ProjectRow, type ProjectSummary, type RunRow } from "../platform/db.js";

export interface DiscoveryRecord {
  id: string;
  runId: string;
  projectId?: string;
  url: string;
  appName: string;
  createdAt: string;
  status: "running" | "done" | "error";
  error?: string;
  confidence?: number;
  completeness?: number;
  counts?: { pages: number; components: number; features: number; flows: number; forms: number; apis: number; manualReview: number };
  durationMs?: number;
}

export function safeId(runId: string): string {
  return runId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toRecord(r: RunRow): DiscoveryRecord {
  return {
    id: r.id, runId: r.runId, projectId: r.projectId, url: r.url, appName: r.appName,
    createdAt: r.createdAt, status: r.status, error: r.error ?? undefined,
    confidence: r.confidence ?? undefined, completeness: r.completeness ?? undefined,
    counts: (r.counts as any) ?? undefined, durationMs: r.durationMs ?? undefined,
  };
}
function toRow(rec: DiscoveryRecord): RunRow {
  return {
    id: rec.id, runId: rec.runId, projectId: rec.projectId ?? "", url: rec.url, appName: rec.appName,
    createdAt: rec.createdAt, status: rec.status, error: rec.error ?? null,
    confidence: rec.confidence ?? null, completeness: rec.completeness ?? null,
    counts: rec.counts ?? null, durationMs: rec.durationMs ?? null,
  };
}

export class DiscoveryStore {
  readonly dataDir: string;
  readonly runsDir: string;
  readonly repo: FilesystemRepository;
  readonly db: Db;

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
    this.runsDir = path.join(this.dataDir, "runs");
    // ensure the data dir exists before opening the DB (e.g. after a full wipe)
    mkdirSync(this.runsDir, { recursive: true });
    this.repo = new FilesystemRepository(this.runsDir);
    this.db = new Db(path.join(this.dataDir, "iqad.db"));
  }

  async init(): Promise<void> {
    await fs.mkdir(this.runsDir, { recursive: true });
    await this.migrateLegacyIndex();
  }

  /** One-time import of the pre-Phase-3 JSON index into SQLite (grouped by origin). */
  private async migrateLegacyIndex(): Promise<void> {
    if (this.db.countRuns() > 0) return;
    const legacy = path.join(this.dataDir, "discoveries.json");
    try {
      const recs: DiscoveryRecord[] = JSON.parse(await fs.readFile(legacy, "utf8"));
      for (const rec of recs) {
        const project = this.db.ensureProject(rec.url, rec.createdAt);
        this.db.upsertRun(toRow({ ...rec, projectId: project.id }));
      }
      if (recs.length) console.log(`[store] migrated ${recs.length} legacy discovery record(s) into SQLite`);
      await fs.rename(legacy, legacy + ".migrated").catch(() => {});
    } catch { /* no legacy index */ }
  }

  // ---------- runs (records) ----------
  async list(): Promise<DiscoveryRecord[]> { return this.db.listRuns().map(toRecord); }
  async get(id: string): Promise<DiscoveryRecord | undefined> { const r = this.db.getRun(id); return r ? toRecord(r) : undefined; }
  async upsert(rec: DiscoveryRecord): Promise<void> {
    if (!rec.projectId) rec.projectId = this.db.ensureProject(rec.url, rec.createdAt).id;
    this.db.upsertRun(toRow(rec));
  }
  async patch(id: string, patch: Partial<DiscoveryRecord>): Promise<DiscoveryRecord | undefined> {
    const cur = this.db.getRun(id);
    if (!cur) return undefined;
    const r = this.db.patchRun(id, toRow({ ...toRecord(cur), ...patch }));
    return r ? toRecord(r) : undefined;
  }
  async remove(id: string): Promise<boolean> {
    const r = this.db.getRun(id); if (!r) return false;
    this.db.removeRun(id);
    try { await fs.rm(path.join(this.runsDir, safeId(r.runId)), { recursive: true, force: true }); } catch {}
    return true;
  }

  // ---------- projects ----------
  ensureProject(url: string, now: string): ProjectRow { return this.db.ensureProject(url, now); }
  listProjects(): ProjectSummary[] { return this.db.listProjects(); }
  getProject(id: string): ProjectRow | undefined { return this.db.getProject(id); }
  updateProject(id: string, patch: any, now: string) { return this.db.updateProject(id, patch, now); }
  runsByProject(projectId: string): DiscoveryRecord[] { return this.db.runsByProject(projectId).map(toRecord); }
  async deleteProject(id: string): Promise<void> {
    for (const run of this.db.runsByProject(id)) { try { await fs.rm(path.join(this.runsDir, safeId(run.runId)), { recursive: true, force: true }); } catch {} }
    this.db.deleteProject(id);
  }
  stats() { return this.db.stats(); }

  /** Clear ALL data: every project, run, knowledge row, and run artifact on disk. */
  async clearAll(): Promise<{ projects: number; runs: number; knowledge: number }> {
    const cleared = this.db.reset();
    try {
      await fs.rm(this.runsDir, { recursive: true, force: true });
      await fs.mkdir(this.runsDir, { recursive: true });
    } catch { /* best effort */ }
    // drop any migrated legacy index too
    try { await fs.rm(path.join(this.dataDir, "discoveries.json.migrated"), { force: true }); } catch {}
    return cleared;
  }

  // ---------- artifacts (filesystem cache) ----------
  runDir(runId: string): string { return this.repo.runDir(runId); }
  async loadArtifact<T = unknown>(runId: string, filename: string): Promise<T> { return this.repo.loadJson<T>(runId, filename); }
  async hasArtifact(runId: string, filename = FILENAMES.discoveryModelJson): Promise<boolean> { return this.repo.exists(runId, filename); }
}
