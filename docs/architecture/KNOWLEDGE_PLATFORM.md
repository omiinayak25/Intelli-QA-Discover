# Knowledge Platform — bounded context (Phase 4, step 2)

The `knowledge` bounded context turns accumulated discovery runs into
cross-application intelligence. It is **additive** — the Discovery Engine,
Discovery Model, builders, and 37 tests are untouched.

## Discipline (non-negotiable)
Every inference is **evidence-based, confidence-scored, and traceable to source**
components / pages / modules. Nothing is invented. Offline detection returns an
honest "not detected", never a guess.

## Modules
| File | Responsibility |
|---|---|
| `src/knowledge/signatures.ts` | Technology + business-domain signature libraries (each match records the exact marker). |
| `src/knowledge/tech.ts` | Technology Detection Agent — fetches the homepage HTML server-side (no browser, no re-crawl), matches signatures, caches; evidence = the matched marker. |
| `src/knowledge/service.ts` | `KnowledgeService`: `ingest`/`backfill` a run into the index; `dna` (Application DNA); `similar` (Similarity Engine); `overview`; `search` (enterprise, cross-project); `ask` (cross-application reasoning). Domain inference weighs matched terms across modules + component labels + pages + features. |
| `src/platform/db.ts` | `run_knowledge` table — the denormalized per-run index (source of truth for collective intelligence). |

## Flow
```
run completes → JobManager.onRunDone → KnowledgeService.ingest(run)
   → detect tech (homepage HTML) + infer domain (evidence) + component profile
   → upsert run_knowledge (SQLite)
boot → KnowledgeService.backfill()  (indexes any run not yet learned)
```
So **every discovery permanently improves the platform** (Rule #1).

## API
`GET /api/knowledge/overview` · `GET /api/knowledge/search?q=` ·
`POST /api/knowledge/ask {q}` · `GET /api/knowledge/similar/:runId` ·
`GET /api/projects/:id/dna`.

## Similarity model
`score = 0.40·moduleJaccard + 0.20·techJaccard + 0.25·componentCosine +
0.15·domainMatch`, with human-readable reasons (shared domain, shared modules,
shared tech, similar composition).

## Delivered vs. remaining roadmap
- **Delivered (this increment):** knowledge ingestion + backfill, Application DNA
  (domain + technology + modules + component profile), Similarity Engine,
  cross-project Enterprise Search, and the Global Knowledge Assistant — plus the
  Knowledge hub UI and per-project DNA/Similar panels.
- **Deferred (later increments, per the agreed order):** Component DNA (stable
  cross-run component identity), Visual Memory (screenshot embeddings/search),
  Evolution Engine timelines (Compare already exists as the basis), Multi-Agent
  orchestration, and Self-Learning / Recommendations.
