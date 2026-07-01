/**
 * Filesystem implementation of the Repository. The only lean backend we ship.
 *
 * Layout: <root>/<runId>/<canonical-filename>
 * Writes are interruption-safe (write-then-rename).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Repository } from "./repository.js";

/** Deterministic JSON: stable 2-space indentation; object key order = insertion order. */
export function stableStringify(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}

export class FilesystemRepository implements Repository {
  constructor(private readonly root: string) {}

  runDir(runId: string): string {
    // runId may be like "RUN:01hxa"; use the key part as directory name.
    const safe = runId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(this.root, safe);
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }

  private async atomicWrite(target: string, data: string | Uint8Array): Promise<void> {
    await this.ensureDir(path.dirname(target));
    const tmp = `${target}.tmp-${process.pid}`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
  }

  async saveJson(runId: string, filename: string, data: unknown): Promise<void> {
    await this.atomicWrite(path.join(this.runDir(runId), filename), stableStringify(data));
  }

  async loadJson<T = unknown>(runId: string, filename: string): Promise<T> {
    const raw = await fs.readFile(path.join(this.runDir(runId), filename), "utf8");
    return JSON.parse(raw) as T;
  }

  async exists(runId: string, filename: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.runDir(runId), filename));
      return true;
    } catch {
      return false;
    }
  }

  async saveFile(runId: string, relPath: string, data: string | Uint8Array): Promise<void> {
    await this.atomicWrite(path.join(this.runDir(runId), relPath), data);
  }

  async loadText(runId: string, relPath: string): Promise<string> {
    return fs.readFile(path.join(this.runDir(runId), relPath), "utf8");
  }

  async listRuns(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.root, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }
}
