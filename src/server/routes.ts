/**
 * REST API for the Intelli QA Discover platform. Wraps the Discovery Engine as
 * a service; the frontend renders everything from these endpoints.
 *
 *   POST   /api/discover
 *   GET    /api/discoveries
 *   GET    /api/discoveries/:id
 *   GET    /api/discoveries/:id/model
 *   GET    /api/discoveries/:id/status
 *   GET    /api/discoveries/:id/events        (SSE live progress)
 *   DELETE /api/discoveries/:id
 *   POST   /api/discoveries/:id/rerun
 *   GET    /api/discoveries/:id/file/*         (screenshots / artifacts)
 *   GET    /api/search?q=
 */

import { Router } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { DiscoveryStore } from "./store.js";
import { JobManager } from "./jobs.js";
import { loadPortalModel } from "./model.js";

function isValidUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".csv": "text/csv",
};

export function createApiRouter(store: DiscoveryStore, jobs: JobManager): Router {
  const r = Router();

  r.post("/discover", async (req, res) => {
    const { url, options } = req.body || {};
    if (!url || !isValidUrl(url)) return res.status(400).json({ error: "A valid http(s) URL is required." });
    try {
      const id = await jobs.start(url, options || {});
      res.status(202).json({ id });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  r.get("/discoveries", async (_req, res) => {
    res.json(await store.list());
  });

  r.get("/discoveries/:id", async (req, res) => {
    const rec = await store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    res.json(rec);
  });

  r.get("/discoveries/:id/status", async (req, res) => {
    const job = jobs.get(req.params.id);
    const rec = await store.get(req.params.id);
    if (!rec && !job) return res.status(404).json({ error: "not found" });
    res.json({
      id: req.params.id,
      status: job?.status ?? rec?.status ?? "unknown",
      progress: job?.progress ?? { stage: rec?.status === "done" ? "Saving discovery" : "Queued", pct: rec?.status === "done" ? 100 : 0 },
      error: job?.error ?? rec?.error,
      record: rec,
    });
  });

  r.get("/discoveries/:id/events", async (req, res) => {
    const id = req.params.id;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (ev: any) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    // send current state immediately
    const job = jobs.get(id);
    const rec = await store.get(id);
    send({ type: "status", status: job?.status ?? rec?.status, progress: job?.progress });
    if ((job?.status ?? rec?.status) === "done") { send({ type: "done", record: rec }); return res.end(); }
    if ((job?.status ?? rec?.status) === "error") { send({ type: "error", error: job?.error ?? rec?.error }); return res.end(); }
    const unsub = jobs.subscribe(id, (ev) => {
      send(ev);
      if (ev.type === "done" || ev.type === "error") { unsub(); res.end(); }
    });
    const ka = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    req.on("close", () => { clearInterval(ka); unsub(); });
  });

  r.get("/discoveries/:id/model", async (req, res) => {
    const rec = await store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    if (rec.status !== "done") return res.status(409).json({ error: "discovery not complete", status: rec.status });
    try {
      const model = await loadPortalModel(store, rec.id, rec.runId);
      res.json(model);
    } catch (err) {
      res.status(500).json({ error: "failed to build model: " + (err as Error).message });
    }
  });

  r.delete("/discoveries/:id", async (req, res) => {
    const ok = await store.remove(req.params.id);
    res.status(ok ? 200 : 404).json({ ok });
  });

  r.post("/discoveries/:id/rerun", async (req, res) => {
    const rec = await store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    const id = await jobs.start(rec.url, req.body?.options || {});
    res.status(202).json({ id });
  });

  // serve run artifacts (screenshots, json) safely from the run dir
  r.get("/discoveries/:id/file/*", async (req, res) => {
    const rec = await store.get(req.params.id);
    if (!rec) return res.status(404).end();
    const rel = (req.params as any)[0] as string;
    const runDir = store.runDir(rec.runId);
    const abs = path.resolve(runDir, rel);
    if (!abs.startsWith(path.resolve(runDir) + path.sep)) return res.status(403).end();
    const ext = path.extname(abs).toLowerCase();
    if (!MIME[ext]) return res.status(415).end();
    try {
      const data = await fs.readFile(abs);
      res.setHeader("Content-Type", MIME[ext]);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(data);
    } catch {
      res.status(404).end();
    }
  });

  // export a run's discovery model json (other exports are generated client-side)
  r.get("/discoveries/:id/export/model.json", async (req, res) => {
    const rec = await store.get(req.params.id);
    if (!rec) return res.status(404).end();
    try {
      const model = await store.loadArtifact(rec.runId, "discovery-model.json");
      res.setHeader("Content-Disposition", `attachment; filename="${rec.id}-discovery-model.json"`);
      res.json(model);
    } catch {
      res.status(404).end();
    }
  });

  // global history search
  r.get("/search", async (req, res) => {
    const q = String(req.query.q || "").toLowerCase().trim();
    const recs = await store.list();
    const hits = q ? recs.filter((r2) => (r2.url + " " + r2.appName).toLowerCase().includes(q)) : recs;
    res.json(hits);
  });

  return r;
}
