# QA Discovery Agent

> **Point it at one running web-app URL. It opens a real browser, explores the whole
> application, and hands a human tester an organized picture of everything there is to look at.**

QA Discovery Agent answers exactly one question:

> **"What all is present in this application that I need to test?"**

It is a **discovery** tool, not a testing tool. It converts a sprawling, unfamiliar
application into an **Overview + Inventory + Feature Tree + Map + Checklist + Discovery
Summary + Manual Review** that a human then works through. **The agent discovers and
organizes; the human tests.**

It never generates test cases, never asserts pass/fail, never tests APIs, never scores
risk. That line is enforced in code (see [Scope discipline](#scope-discipline)).

---

## What it does / does not do

**Does**

- Takes a single URL (with optional per-role credentials) as its only input.
- Drives a real Chromium browser (Playwright) to safely explore every reachable page,
  component, flow, hidden element, and UI state — once per role.
- Discovers across the **10 categories**: Pages, Navigation, Components, Business Features,
  User Flows, Hidden Things, APIs (map-only), Forms, Roles, States.
- Correlates UI actions to API endpoints as *observations only* (`Book → POST /booking`).
- Produces **seven human deliverables** plus a cross-cutting **confidence** field, a
  **Feature Relationships** graph, and a **Discovery Validation** self-audit.

**Does NOT** (hard anti-scope, enforced by `src/core/discipline.ts`)

- No test cases, no steps, no Given/When/Then, no expected results.
- No pass/fail, no assertions, no verification of behavior.
- No API testing — endpoints are *mapped*, never called independently or probed.
- No risk scoring, severity, vision heatmaps, ML test design, knowledge-graph DB, or plugin
  marketplace.

---

## Install

```bash
npm install
npx playwright install chromium
```

Requires Node ≥ 20.

## Quick start

```bash
# 1. (demo) start the bundled fixture site
npm run fixture            # serves http://localhost:4599

# 2. crawl + build every deliverable + run the scope gate, in one shot
npm run e2e -- --config fixture/crawl-config.json
#   or against any URL:
npm run e2e -- --url https://example.com
```

Or run the phases separately:

```bash
# Phase 1 — safe crawl -> raw-capture.json (+ per-state files, screenshots)
npm run discover -- --url https://example.com
npm run discover -- --config fixture/crawl-config.json     # multi-role

# Phases 2-8 — pure transforms -> every deliverable
npm run pipeline -- --run RUN:<id>

# Phase 9 (optional) — diff two runs
npx tsx src/cli/diff.ts --from RUN:<old> --to RUN:<new>

# Scope-discipline gate over emitted artifacts (must be ZERO hits)
npm run lint:scope -- runs
```

Artifacts land in `runs/<runId>/`. **Open `runs/<runId>/portal.html`** — the primary output
is a self-contained, enterprise-grade **interactive QA Discovery Portal** (no server, no
external network). A manual tester opens one file and understands the whole application
within minutes.

### The Portal (`portal.html`)

A single-file SPA (dark/light) with a dashboard and left-nav, generated after every run:

- **Dashboard** — KPI cards, Discovery-Confidence & Completeness rings, coverage map, and a
  "where a human must look" panel.
- **Application Overview** — a senior-QA read of what the app is (domain, capabilities, auth,
  payments, languages).
- **Business Modules** — expandable cards grouping features → pages → components → forms → flows.
- **Business Feature Tree** & **Application Structure** — clickable trees (business vs structural).
- **Pages** — each with an **annotated screenshot overlay** (numbered hotspots over the real
  desktop/tablet/mobile screenshot), page facts, components, forms, states.
- **Components** — virtualized (handles 10k+), filter/sort, full detail per component.
- **Forms · Flows · States · Hidden · API Map · Navigation** — sortable tables.
- **Relationships** — an SVG feature-to-feature graph; **Flows** render as step chains.
- **Screenshots & Component Gallery**, **Coverage Map**, **Discovery Timeline** (replayable),
  **Discovery Validation**, **Manual Review** table.
- **QA Checklist** — tri-state tick-off, persisted in `localStorage`.
- **Global search** (`Ctrl/Cmd+K`) across every entity, and an **AI Assistant** that answers
  *only from the discovery model* (deterministic — never invents or hallucinates).
- **Exports** — JSON, Markdown, CSV, and PDF (print), all from the same model.

`report.html` (a lighter self-contained tree) and the Markdown/JSON artifacts are still
emitted for exports and back-compat.

## Deliverables (per run)

| # | Deliverable | Files |
|---|---|---|
| 1 | Application Overview | `application-overview.md` · `.json` |
| 2 | QA Inventory (counts) | `qa-inventory.json` · `qa-inventory.md` |
| 3 | Business Feature Tree + Relationships | `feature-tree.*` · `feature-relationships.*` |
| 4 | Hierarchical QA Map (tickable) | `qa-map.json` · `qa-map.html` · `qa-map.md` |
| 5 | QA Checklist (global + page-wise) | `qa-checklist.json` · `.md` |
| 6 | Discovery Summary + Validation | `discovery-summary.*` · `discovery-validation.*` |
| 7 | Manual Review Required | `manual-review.json` · `.md` |
| — | Discovery Model (source of truth) | `discovery-model.json` · `.md` |
| ★ | **Interactive Portal (primary)** | **`portal.html`** |
| — | Report bundle | `report.md` · `report.html` · `bundle.json` |

Every discovered item carries a **`confidence`** (0–100, certainty of *discovery*, never a
pass-probability) with a reason when below 80, plus inferred **semantics**
(`businessFunction`, `inferredPurpose`, `behavior`/`leadsTo`, `partOfFlow`) — descriptive
observations, never expected behavior.

## Architecture

A one-directional pipeline of single-responsibility stages, each reading a versioned
upstream artifact and writing a versioned downstream one (never shared in-memory state):

```
Explorer ─▶ raw-capture.json ─▶ Classifier ─▶ discovery-model.json
   │                                              │
   │            ┌─────────────────────────────────┼───────────────────────────┐
   ▼            ▼                 ▼                ▼               ▼             ▼
(Phase 1)  Feature Tree      Inventory +       QA Map        Checklist    Summary /
           (Phase 3)         Overview (P4)     (Phase 5)     (Phase 6)    Validation /
                                                                          Manual Review (P7)
                                          └──────────────┬──────────────┘
                                                         ▼
                                                Report bundle (Phase 8)
                                                         ▼
                                              Multi-run Diff (Phase 9)
```

- **`src/core`** — domain model, canonical stable IDs, the common envelope, the scope
  discipline lint. Everything points inward to core.
- **`src/explorer`** — the Playwright safe-crawl runtime (Phase 1). The only
  non-deterministic stage; the only stage that touches a browser.
- **`src/classifier`** — raw capture → structured Discovery Model across all 10 categories,
  with semantic enrichment and confidence (Phase 2).
- **`src/builders`** — pure transforms for Phases 3-9. Same input → byte-identical output.
- **`src/storage`** — `Repository` abstraction with a filesystem backend (JSON files).
- **`src/cli`** — `discover`, `pipeline`, `diff`, `e2e`, `scope-lint`.

Design & specs live under [`docs/specs/`](docs/specs) (Phase -1) and
[`docs/architecture/`](docs/architecture) (Phase 0). `DISCOVERY_MODEL.md` and
`OUTPUT_CONTRACTS.md` are the anchor contracts.

## Safe-by-default crawl

Crawling is read-only exploration. The Explorer navigates, reads the DOM, observes the
network, and reveals hidden surface (hover / menu / accordion / scroll). It **never**:

- submits destructive actions (delete / pay / place-order / logout / send) — these are
  recorded in `skippedForSafety[]` with a reason;
- submits a form to observe server-side validation or a success/error response;
- issues any request the observed UI interaction did not itself send, or stores response
  bodies;
- crawls off-origin links (they are recorded as external-redirect pointers for manual review).

Login is performed **only** via configured per-role credentials/recipe, as an authorized
auth step.

## Stable IDs & determinism

Every entity has an ID of the form `<PREFIX>:<content/selector-derived key>` — never
index-based — so the same underlying thing keeps the same ID across runs. This makes
tick-state carry over and the Phase 9 diff meaningful. All Phase 2-9 transforms are pure and
deterministic (byte-identical output for identical input, modulo `generatedAt`).

## Scope discipline

`src/core/discipline.ts` owns the single canonical forbidden-token regex (test case,
expected result, assert, pass/fail, verify, should-<verb>, risk score, severity, heatmap,
pass probability, confidence-to-pass). Every builder runs `assertClean()` before emitting,
and `npm run lint:scope` re-scans every emitted `.json` / `.md` / `.html`. A hit is a defect.

## Testing our tool (not the discovery output)

```bash
npm test            # 28 unit + integrity + determinism tests
npx tsc --noEmit    # typecheck
```

These test *our transforms* (IDs, discipline lint, cross-artifact integrity, coverage,
roll-up, determinism, diff). The product itself still emits no test cases.

## License

MIT
