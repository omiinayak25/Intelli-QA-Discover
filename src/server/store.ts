/**
 * Discovery store — persists discovery history and reads per-run artifacts.
 *
 * Backed by a JSON index (`data/discoveries.json`) plus the on-disk run
 * directories written by the existing FilesystemRepository. Clean interface so a
 * SQL backend can drop in without touching the API or engine.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { FilesystemRepository } from "../storage/filesystem.js";
import { FILENAMES } from "../core/constants.js";

export interface DiscoveryRecord {
  id: string; // URL-safe id (also the run directory name)
  runId: string; // engine run id, e.g. "RUN:abc123"
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

export class DiscoveryStore {
  readonly dataDir: string;
  readonly runsDir: string;
  private indexPath: string;
  readonly repo: FilesystemRepository;

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
    this.runsDir = path.join(this.dataDir, "runs");
    this.indexPath = path.join(this.dataDir, "discoveries.json");
    this.repo = new FilesystemRepository(this.runsDir);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.runsDir, { recursive: true });
    try {
      await fs.access(this.indexPath);
    } catch {
      await fs.writeFile(this.indexPath, "[]\n");
    }
  }

  private async readIndex(): Promise<DiscoveryRecord[]> {
    try {
      return JSON.parse(await fs.readFile(this.indexPath, "utf8"));
    } catch {
      return [];
    }
  }
  private async writeIndex(recs: DiscoveryRecord[]): Promise<void> {
    const tmp = this.indexPath + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(recs, null, 2) + "\n");
    await fs.rename(tmp, this.indexPath);
  }

  async list(): Promise<DiscoveryRecord[]> {
    const recs = await this.readIndex();
    return recs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async get(id: string): Promise<DiscoveryRecord | undefined> {
    return (await this.readIndex()).find((r) => r.id === id);
  }

  async upsert(rec: DiscoveryRecord): Promise<void> {
    const recs = await this.readIndex();
    const i = recs.findIndex((r) => r.id === rec.id);
    if (i >= 0) recs[i] = rec;
    else recs.push(rec);
    await this.writeIndex(recs);
  }

  async patch(id: string, patch: Partial<DiscoveryRecord>): Promise<DiscoveryRecord | undefined> {
    const recs = await this.readIndex();
    const i = recs.findIndex((r) => r.id === id);
    if (i < 0) return undefined;
    recs[i] = { ...recs[i], ...patch };
    await this.writeIndex(recs);
    return recs[i];
  }

  async remove(id: string): Promise<boolean> {
    const recs = await this.readIndex();
    const rec = recs.find((r) => r.id === id);
    if (!rec) return false;
    await this.writeIndex(recs.filter((r) => r.id !== id));
    try {
      await fs.rm(path.join(this.runsDir, safeId(rec.runId)), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    return true;
  }

  /** Absolute path to a run directory (for serving screenshots). */
  runDir(runId: string): string {
    return this.repo.runDir(runId);
  }

  async loadArtifact<T = unknown>(runId: string, filename: string): Promise<T> {
    return this.repo.loadJson<T>(runId, filename);
  }

  async hasArtifact(runId: string, filename = FILENAMES.discoveryModelJson): Promise<boolean> {
    return this.repo.exists(runId, filename);
  }
}
