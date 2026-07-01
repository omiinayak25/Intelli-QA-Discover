# EXTENSIBILITY

Four intended seams. Each is a **minimal interface**; extension happens by implementing it, not by editing core. Seams are deliberately shaped so they **cannot** enable banned capabilities.

---

## Seam 1 — Add a Discovery Category

Register a new entity type + its detector without touching existing categories.

```
SKETCH — not implementation

interface CategoryPlugin<T extends BaseItem> {
  category: string;               // extends the 10; canonical order preserved
  idPrefix: string;               // e.g. "WIDGET"
  samenessKey(evidence: RawEvidence): string;
  classify(evidence: RawEvidence): T[];   // descriptive only
}
```

**Constraint:** the classifier still emits description only — a category may not carry a verdict, score, or expected outcome.

## Seam 2 — Add a Report Format

Emit an additional rendering of an existing artifact.

```
SKETCH — not implementation

interface ReportRenderer {
  format: string;                 // e.g. "csv", "pdf"
  render(bundle: Bundle): RenderedFile;   // reads the frozen bundle
}
```

**Constraint:** a renderer only re-presents already-discovered data; it may not add assertions, pass/fail, or scores.

## Seam 3 — Swap StorageProvider

Replace the filesystem backend (e.g. SQLite) behind the existing interface.

```
SKETCH — not implementation

interface StorageProvider {
  save(runId: string, name: string, version: string, data: unknown): Promise<void>;
  load<T>(runId: string, name: string, version: string): Promise<T>;
}
```

**Constraint:** must remain a plain load/save by name + version. No query engine, **no knowledge graph**.

## Seam 4 — Swap the Crawl Driver

Replace Playwright/Chromium with another safe, read-only driver.

```
SKETCH — not implementation

interface CrawlDriver {
  goto(url: string): Promise<void>;
  readDom(): Promise<DomSnapshot>;
  observeNetwork(): NetworkObservation[];   // method + path template + trigger, no bodies
  // NO submit(), NO destructive-action API surface
}
```

**Constraint:** the driver interface exposes read/observe only — it structurally cannot submit forms or perform destructive actions.

---

## Anti-Goals (Restated)

These seams **must not** enable:

- Test-case generation
- Risk scoring / severity / heatmaps
- ML-based test design
- Knowledge-graph databases
- An external plugin **marketplace** (seams are in-repo interfaces, not a third-party ecosystem)

Any extension that would introduce a verdict, a score, or a verification instruction is out of scope by design.
