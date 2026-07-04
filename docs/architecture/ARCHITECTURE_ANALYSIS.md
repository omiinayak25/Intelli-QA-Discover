# Architecture Analysis Report — Intelli QA Discover

_Audit performed before the Phase-3 project-workspace refactor. Goal: an
enterprise SaaS platform (GitHub / Jira / SonarQube-grade) without rewriting the
working Discovery Engine or breaking the Discovery Model._

## 1. Current repository map (audited)

| Layer | Location | Role | Verdict |
|---|---|---|---|
| **Discovery Engine** | `src/explorer` (crawl), `src/classifier` (Phase 2 model), `src/builders` (Phases 3-9) | Produces the Discovery Model + all artifacts | **Keep & reuse — never rewrite** |
| **Domain contracts** | `src/core` (ids, envelope, types, discipline, constants, raw-capture) | Canonical schema + scope discipline | **Keep — frozen contract** |
| **Storage abstraction** | `src/storage` (Repository + FilesystemRepository) | Artifacts on disk per run | **Keep — becomes the artifact cache** |
| **CLI** | `src/cli` (discover, pipeline, diff, e2e, scope-lint) | Run the engine directly | **Keep — still valid** |
| **Portal renderer** | `src/portal` (model, styles, client-app.js) | Denormalized `PortalModel` the UI renders | **Reuse `model.ts` as the API's read-model** |
| **Web backend** | `src/server` (store, jobs, engine, routes, model, live) | Engine-as-a-service + REST + SSE + live browser | **Extend** |
| **Web frontend** | `web/` (Vite + React) | The single SaaS app | **Extend** |

## 2. What stays / moves / becomes shared

- **Stays put (reused, unchanged):** the entire engine (`explorer`/`classifier`/
  `builders`), `core`, `storage`, `cli`. Moving these into `packages/*` folders
  would rewrite hundreds of imports, `tsconfig`, and break the 37 passing tests
  for **zero user value**. A senior platform engineer favours *safe, incremental*
  refactoring over a big-bang directory move. We therefore keep the proven module
  boundaries and layer the platform on top.
- **New platform layer:** `src/platform/` — the enterprise persistence + domain
  services (repository + service pattern): `db.ts` (SQLite source of truth),
  `projects.ts` (Project/Run services). This is the Phase-3 addition.
- **Becomes source of truth:** an embedded **SQLite** database (`data/iqad.db`,
  via Node's built-in `node:sqlite`, zero native deps). Run artifacts on disk are
  now explicitly the **cache**, exactly as specified.
- **Becomes reusable/shared:** `PortalModel` (read-model), the design system, and
  the report view components already render *any* website from the model — no
  site-specific code exists or is added.

## 3. Target architecture (layered clean architecture)

```
apps           web/ (React SPA)  ·  src/server (API + SSE + Live Browser)
platform       src/platform (Db · ProjectService · RunService — repository/service)
engine         src/explorer · src/classifier · src/builders   (UNCHANGED)
contracts      src/core (Discovery Model, ids, discipline)     (FROZEN)
storage        src/storage (artifact cache) + data/ (SQLite = source of truth)
```

Dependencies point downward only; the engine never imports the platform or web.

## 4. Domain model (Phase 3)

- **Project** — one website workspace. Stable id `prj_<hash(origin)>`; groups many
  runs; owns settings, metadata, comparison history. Never keyed by URL/folder name.
- **Run** — one immutable discovery execution. Keeps the engine `runId`, links to a
  project, stores rollups (confidence, counts) in the DB and full artifacts on
  disk (`data/runs/<runId>/…`). Nothing overwrites a prior run; every run is
  reproducible from its artifacts.

DB tables: `projects`, `runs` (rollups + JSON blobs). The heavy per-entity tables
(components/pages/…) remain in the on-disk Discovery Model artifacts and are read
through `PortalModel`; the DB indexes runs/projects for scale (1000s of projects,
100000s of runs) while artifacts stay lazy-loaded.

## 5. Migration & compatibility

- On boot, existing `data/discoveries.json` records are imported into SQLite and
  grouped into projects by origin. The legacy `/api/discoveries/*` endpoints keep
  working (now DB-backed); `/api/projects/*` is added on top. No artifact is moved
  or rewritten; the Discovery Model schema is untouched.

## 6. Non-goals (explicitly deferred, to avoid breakage)

- Full monorepo (`apps/*`, `packages/*`) directory relocation — deferred; the
  module boundaries above already give clean architecture without the churn.
- Replacing the filesystem artifact store with blob storage — the Repository
  abstraction already allows this later without touching callers.
