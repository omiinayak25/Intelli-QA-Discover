/**
 * Platform persistence — embedded SQLite (Node's built-in `node:sqlite`) as the
 * SOURCE OF TRUTH for projects and runs. Zero native dependencies. Run artifacts
 * on disk (Discovery Model, screenshots, exports) are the CACHE, referenced by id.
 *
 * Repository pattern: this class is the only thing that talks SQL; services and
 * routes depend on its typed methods, never on the driver.
 */

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

export interface ProjectRow {
  id: string;
  name: string;
  baseUrl: string;
  slug: string;
  origin: string;
  createdAt: string;
  updatedAt: string;
  settings: Record<string, unknown>;
}
export interface ProjectSummary extends ProjectRow {
  runCount: number;
  lastRunAt: string | null;
  lastConfidence: number | null;
}
export interface RunRow {
  id: string;
  runId: string;
  projectId: string;
  url: string;
  appName: string;
  createdAt: string;
  status: "running" | "done" | "error";
  error?: string | null;
  confidence?: number | null;
  completeness?: number | null;
  counts?: Record<string, number> | null;
  durationMs?: number | null;
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return url; }
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
}
function projectId(origin: string): string {
  return "prj_" + createHash("sha1").update(origin).digest("hex").slice(0, 10);
}
function projectName(origin: string): string {
  try { const h = new URL(origin).hostname.replace(/^www\./, ""); const b = h.split(".")[0]; return b.charAt(0).toUpperCase() + b.slice(1); } catch { return origin; }
}

export interface TechHit { name: string; category: string; confidence: number; evidence: string }
export interface KnowledgeRow {
  runId: string;
  projectId: string;
  url: string;
  appName: string;
  createdAt: string;
  domain: string;
  domainConfidence: number;
  domainEvidence: string[];
  modules: string[];
  featureKeys: string[];
  componentProfile: Record<string, number>;
  componentLabels: string[];
  tech: TechHit[];
  kpis: Record<string, number>;
  pages: { label: string; archetype: string }[];
}

export class Db {
  private db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT, base_url TEXT, slug TEXT, origin TEXT UNIQUE,
        created_at TEXT, updated_at TEXT, settings TEXT
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, run_id TEXT, project_id TEXT, url TEXT, app_name TEXT,
        created_at TEXT, status TEXT, error TEXT, confidence REAL, completeness REAL,
        counts TEXT, duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
      CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at);

      -- Knowledge index: one denormalized row per discovered run, the substrate
      -- for cross-application intelligence (search / similarity / DNA / reasoning).
      CREATE TABLE IF NOT EXISTS run_knowledge (
        run_id TEXT PRIMARY KEY, project_id TEXT, url TEXT, app_name TEXT, created_at TEXT,
        domain TEXT, domain_confidence REAL, domain_evidence TEXT,
        modules TEXT, feature_keys TEXT, component_profile TEXT, component_labels TEXT,
        tech TEXT, kpis TEXT, pages TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_know_project ON run_knowledge(project_id);
    `);
  }

  // ---------- projects ----------
  ensureProject(url: string, now: string): ProjectRow {
    const origin = originOf(url);
    const id = projectId(origin);
    const existing = this.getProject(id);
    if (existing) return existing;
    const row: ProjectRow = {
      id, name: projectName(origin), baseUrl: origin, slug: slugify(projectName(origin)),
      origin, createdAt: now, updatedAt: now, settings: {},
    };
    this.db.prepare(`INSERT OR IGNORE INTO projects(id,name,base_url,slug,origin,created_at,updated_at,settings) VALUES(?,?,?,?,?,?,?,?)`)
      .run(row.id, row.name, row.baseUrl, row.slug, row.origin, row.createdAt, row.updatedAt, JSON.stringify(row.settings));
    return this.getProject(id) ?? row;
  }

  getProject(id: string): ProjectRow | undefined {
    const r = this.db.prepare(`SELECT * FROM projects WHERE id=?`).get(id) as any;
    return r ? this.mapProject(r) : undefined;
  }

  listProjects(): ProjectSummary[] {
    const rows = this.db.prepare(`
      SELECT p.*, COUNT(r.id) AS run_count, MAX(r.created_at) AS last_run_at,
        (SELECT confidence FROM runs r2 WHERE r2.project_id=p.id AND r2.status='done' ORDER BY created_at DESC LIMIT 1) AS last_confidence
      FROM projects p LEFT JOIN runs r ON r.project_id=p.id
      GROUP BY p.id ORDER BY last_run_at DESC
    `).all() as any[];
    return rows.map((r) => ({ ...this.mapProject(r), runCount: r.run_count ?? 0, lastRunAt: r.last_run_at ?? null, lastConfidence: r.last_confidence ?? null }));
  }

  updateProject(id: string, patch: Partial<Pick<ProjectRow, "name" | "settings">>, now: string): ProjectRow | undefined {
    const cur = this.getProject(id); if (!cur) return undefined;
    const name = patch.name ?? cur.name;
    const settings = patch.settings ?? cur.settings;
    this.db.prepare(`UPDATE projects SET name=?, settings=?, updated_at=? WHERE id=?`).run(name, JSON.stringify(settings), now, id);
    return this.getProject(id);
  }

  deleteProject(id: string): void {
    this.db.prepare(`DELETE FROM runs WHERE project_id=?`).run(id);
    this.db.prepare(`DELETE FROM projects WHERE id=?`).run(id);
  }

  private mapProject(r: any): ProjectRow {
    return { id: r.id, name: r.name, baseUrl: r.base_url, slug: r.slug, origin: r.origin, createdAt: r.created_at, updatedAt: r.updated_at, settings: safeJson(r.settings, {}) };
  }

  // ---------- runs ----------
  upsertRun(row: RunRow): void {
    if (!row.projectId) row.projectId = this.ensureProject(row.url, row.createdAt).id;
    this.db.prepare(`
      INSERT INTO runs(id,run_id,project_id,url,app_name,created_at,status,error,confidence,completeness,counts,duration_ms)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET run_id=excluded.run_id, project_id=excluded.project_id, url=excluded.url,
        app_name=excluded.app_name, status=excluded.status, error=excluded.error, confidence=excluded.confidence,
        completeness=excluded.completeness, counts=excluded.counts, duration_ms=excluded.duration_ms
    `).run(
      row.id, row.runId, row.projectId, row.url, row.appName, row.createdAt, row.status,
      row.error ?? null, row.confidence ?? null, row.completeness ?? null,
      row.counts ? JSON.stringify(row.counts) : null, row.durationMs ?? null,
    );
  }

  patchRun(id: string, patch: Partial<RunRow>): RunRow | undefined {
    const cur = this.getRun(id); if (!cur) return undefined;
    const next = { ...cur, ...patch };
    this.upsertRun(next);
    return this.getRun(id);
  }

  getRun(id: string): RunRow | undefined {
    const r = this.db.prepare(`SELECT * FROM runs WHERE id=?`).get(id) as any;
    return r ? this.mapRun(r) : undefined;
  }
  listRuns(): RunRow[] {
    return (this.db.prepare(`SELECT * FROM runs ORDER BY created_at DESC`).all() as any[]).map((r) => this.mapRun(r));
  }
  runsByProject(projectId: string): RunRow[] {
    return (this.db.prepare(`SELECT * FROM runs WHERE project_id=? ORDER BY created_at DESC`).all(projectId) as any[]).map((r) => this.mapRun(r));
  }
  removeRun(id: string): void {
    this.db.prepare(`DELETE FROM runs WHERE id=?`).run(id);
  }
  countRuns(): number { return (this.db.prepare(`SELECT COUNT(*) c FROM runs`).get() as any).c; }

  private mapRun(r: any): RunRow {
    return { id: r.id, runId: r.run_id, projectId: r.project_id, url: r.url, appName: r.app_name, createdAt: r.created_at, status: r.status, error: r.error, confidence: r.confidence, completeness: r.completeness, counts: safeJson(r.counts, null), durationMs: r.duration_ms };
  }

  // ---------- knowledge index ----------
  upsertKnowledge(k: KnowledgeRow): void {
    this.db.prepare(`
      INSERT INTO run_knowledge(run_id,project_id,url,app_name,created_at,domain,domain_confidence,domain_evidence,modules,feature_keys,component_profile,component_labels,tech,kpis,pages)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(run_id) DO UPDATE SET project_id=excluded.project_id,url=excluded.url,app_name=excluded.app_name,created_at=excluded.created_at,
        domain=excluded.domain,domain_confidence=excluded.domain_confidence,domain_evidence=excluded.domain_evidence,modules=excluded.modules,
        feature_keys=excluded.feature_keys,component_profile=excluded.component_profile,component_labels=excluded.component_labels,tech=excluded.tech,kpis=excluded.kpis,pages=excluded.pages
    `).run(
      k.runId, k.projectId, k.url, k.appName, k.createdAt, k.domain, k.domainConfidence,
      JSON.stringify(k.domainEvidence), JSON.stringify(k.modules), JSON.stringify(k.featureKeys),
      JSON.stringify(k.componentProfile), JSON.stringify(k.componentLabels), JSON.stringify(k.tech),
      JSON.stringify(k.kpis), JSON.stringify(k.pages),
    );
  }
  getKnowledge(runId: string): KnowledgeRow | undefined {
    const r = this.db.prepare(`SELECT * FROM run_knowledge WHERE run_id=?`).get(runId) as any;
    return r ? this.mapKnowledge(r) : undefined;
  }
  allKnowledge(): KnowledgeRow[] {
    return (this.db.prepare(`SELECT * FROM run_knowledge ORDER BY created_at DESC`).all() as any[]).map((r) => this.mapKnowledge(r));
  }
  hasKnowledge(runId: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM run_knowledge WHERE run_id=?`).get(runId);
  }
  removeKnowledge(runId: string): void { this.db.prepare(`DELETE FROM run_knowledge WHERE run_id=?`).run(runId); }
  private mapKnowledge(r: any): KnowledgeRow {
    return {
      runId: r.run_id, projectId: r.project_id, url: r.url, appName: r.app_name, createdAt: r.created_at,
      domain: r.domain, domainConfidence: r.domain_confidence, domainEvidence: safeJson(r.domain_evidence, []),
      modules: safeJson(r.modules, []), featureKeys: safeJson(r.feature_keys, []),
      componentProfile: safeJson(r.component_profile, {}), componentLabels: safeJson(r.component_labels, []),
      tech: safeJson(r.tech, []), kpis: safeJson(r.kpis, {}), pages: safeJson(r.pages, []),
    };
  }

  /** Wipe ALL platform data (projects, runs, knowledge). Irreversible. */
  reset(): { projects: number; runs: number; knowledge: number } {
    const projects = this.listProjects().length;
    const runs = this.countRuns();
    const knowledge = this.allKnowledge().length;
    this.db.exec(`DELETE FROM run_knowledge; DELETE FROM runs; DELETE FROM projects; VACUUM;`);
    return { projects, runs, knowledge };
  }

  stats(): { projects: number; runs: number; done: number; components: number; pages: number; features: number } {
    const runs = this.listRuns().filter((r) => r.status === "done");
    return {
      projects: this.listProjects().length,
      runs: this.countRuns(),
      done: runs.length,
      components: runs.reduce((a, r) => a + (r.counts?.components || 0), 0),
      pages: runs.reduce((a, r) => a + (r.counts?.pages || 0), 0),
      features: runs.reduce((a, r) => a + (r.counts?.features || 0), 0),
    };
  }
}

function safeJson<T>(s: any, fallback: T): T { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
