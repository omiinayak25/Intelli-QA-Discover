/**
 * Storage abstraction. Discovery data is persisted behind this interface so the
 * backend can change (filesystem now; SQLite optional later) WITHOUT touching
 * discovery logic. Agents never import a concrete backend.
 */

export interface Repository {
  /** Absolute path/uri of the run directory (for report links). */
  runDir(runId: string): string;

  /** Save a JSON artifact by canonical filename under the run. */
  saveJson(runId: string, filename: string, data: unknown): Promise<void>;

  /** Load a JSON artifact by canonical filename. Throws if absent. */
  loadJson<T = unknown>(runId: string, filename: string): Promise<T>;

  /** True if an artifact exists. */
  exists(runId: string, filename: string): Promise<boolean>;

  /** Save a text/binary artifact (markdown, html, png) by relative path. */
  saveFile(runId: string, relPath: string, data: string | Uint8Array): Promise<void>;

  /** Load a text artifact by relative path. */
  loadText(runId: string, relPath: string): Promise<string>;

  /** List run ids present in the store, in stable order. */
  listRuns(): Promise<string[]>;
}
