# TECH STACK — Decision Records (ADR)

ADR format: **Context / Decision / Consequences**. Each records a frozen technical choice for the lean build.

---

## ADR-001 — Crawler: Playwright (Chromium), Safe & Read-Only

**Context.** The tool must observe a *running* app the way a browser does: real DOM, accessibility tree, computed styles, event listeners, network. It must never mutate server state.

**Decision.** Use **Playwright** driving **Chromium**. Operate strictly read-only: navigate, read DOM, observe network. Do not submit forms, do not click destructive controls.

**Consequences.**
- Rich, real-browser signals (DOM + a11y + styles + listeners + network).
- Safety enforced by policy + deny-list (see SAFE_CRAWL_DESIGN.md); no server-side side effects.
- Single browser engine keeps determinism and setup simple; other engines can be swapped behind the crawl-driver seam.

---

## ADR-002 — Language / Runtime: Node.js + TypeScript

**Context.** Same-language front-to-back (crawler and transforms), strong typing for the frozen artifact contracts.

**Decision.** **Node.js + TypeScript**. Playwright's first-class runtime is Node; TypeScript encodes the envelope, categories, and ID scheme as compile-time contracts.

**Consequences.**
- One toolchain from crawl to report.
- Types guard the frozen contracts (envelope, 10 categories, node-type vocabulary).
- Transforms are ordinary pure TS functions — easy to unit and golden-file test.

---

## ADR-003 — Storage: JSON + Markdown Files Behind a Repository Interface

**Context.** Artifacts hand off stage-to-stage and must be inspectable, diffable, and versioned.

**Decision.** Persist every artifact as **JSON + Markdown files** behind a **Repository / StorageProvider** abstraction. Filesystem backend is the only lean backend. **SQLite is optional and not shipped.**

**Consequences.**
- Human-readable, git-diffable artifacts.
- Storage backend is swappable without touching agents (dependency points inward to core).
- **NO database engine / NO knowledge graph in the lean build.**

---

## ADR-004 — HTML Report: Single Self-Contained File

**Context.** The interactive tickable QA Map must open on any machine with no server, no build step, no network.

**Decision.** Emit `qa-map.html` / `report.html` as a **single self-contained file** (inlined CSS/JS/data).

**Consequences.**
- Double-click to open; portable and archivable alongside the JSON.
- Tick state persists client-side; no backend required.

---

## ADR-005 — Vision Usage: Phase 2 Only, Typing Only

**Context.** Most elements are typed from DOM + a11y + styles. A small residue (canvas, charts, bespoke custom widgets) is opaque to the DOM.

**Decision.** Invoke **Claude vision only in Phase 2 (Classification)**, and **only to TYPE canvas/chart/custom widgets**. Vision is never used to crawl, to score, or to judge.

**Consequences.**
- Cost and nondeterminism confined to one narrow step.
- All other detection stays local (zero-API) and deterministic.
- Vision output labels a `visionClassified` flag and sets `detectionMethod: "vision"`.

---

## ADR-006 — Explicit Exclusions

**Context.** Scope discipline is a product invariant, not an aspiration.

**Decision.** The lean build ships **no** database engine, **no** knowledge graph, **no** test-case generator, **no** scoring/severity/heatmap engine, **no** plugin marketplace.

**Consequences.**
- Smaller surface, faster runs, no scope creep.
- Seams (EXTENSIBILITY.md) are deliberately shaped so they cannot enable any banned capability.
