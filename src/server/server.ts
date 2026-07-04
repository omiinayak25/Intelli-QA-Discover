/**
 * Intelli QA Discover — web server. Serves the REST API and (in production) the
 * built React app, so the whole product lives at one URL. The Discovery Engine
 * is used as a service; it is never modified here.
 */

import express from "express";
import cors from "cors";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { DiscoveryStore } from "./store.js";
import { JobManager } from "./jobs.js";
import { LiveBrowser } from "./live.js";
import { createApiRouter } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const PORT = Number(process.env.PORT ?? 3000);
  const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, "data");
  const WEB_DIST = path.join(ROOT, "web", "dist");

  const store = new DiscoveryStore(DATA_DIR);
  await store.init();
  const jobs = new JobManager(store);
  const live = new LiveBrowser(store);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, product: "Intelli QA Discover", dataDir: DATA_DIR }));
  app.use("/api", createApiRouter(store, jobs, live));

  // serve the built React app (production); in dev the Vite server proxies /api
  let hasDist = false;
  try {
    await fs.access(path.join(WEB_DIST, "index.html"));
    hasDist = true;
  } catch {
    hasDist = false;
  }
  if (hasDist) {
    app.use(express.static(WEB_DIST));
    app.get("*", (_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")));
  } else {
    app.get("/", (_req, res) =>
      res
        .status(200)
        .send(
          `<html><body style="font-family:system-ui;padding:2rem;max-width:640px;margin:auto">
           <h1>Intelli QA Discover — API</h1>
           <p>The API is running on <b>:${PORT}</b>. The frontend build was not found at <code>web/dist</code>.</p>
           <p>Run the frontend in dev mode: <code>npm run web:dev</code> (opens the app on :5173, proxying the API), or build it with <code>npm run web:build</code> and restart.</p>
           <p>Health: <a href="/api/health">/api/health</a> · History: <a href="/api/discoveries">/api/discoveries</a></p>
           </body></html>`,
        ),
    );
  }

  app.listen(PORT, () => {
    console.log(`[intelli-qa-discover] server on http://localhost:${PORT}  (data: ${DATA_DIR}, web: ${hasDist ? "built" : "dev-mode"})`);
  });
}

main().catch((err) => {
  console.error("[server] fatal:", err);
  process.exit(1);
});
