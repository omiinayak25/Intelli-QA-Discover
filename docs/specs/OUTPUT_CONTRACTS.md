# OUTPUT CONTRACTS

Authoritative list of every emitted artifact: exact filename, format, `schemaVersion`, top-level shape, and the upstream artifact IDs it references. Filenames are frozen strings and must match verbatim.

---

## Common Envelope (Frozen)

Every JSON artifact embeds:

```
{ artifact, schemaVersion, artifactId, runId, appUrl, generatedAt, roles, sourceArtifacts }
```

- `schemaVersion` — frozen baseline **`1.0.0`**.
- `roles` — stored **lowercase/slug**; Title-Cased only at render.
- `sourceArtifacts` — the upstream artifact IDs this one was built from.

### schemaVersion Policy

- Baseline `1.0.0` for **every** artifact.
- Bump **only** on a real shape change; **never** coupled to phase number.
- A consumer reading a mismatched version errors rather than coercing.

### tickState (Frozen) + Roll-Up

- Values: `untested | partial | tested`.
- Roll-up rule for a parent node:
  - `tested` — **all** children tested.
  - `untested` — **no** children tested.
  - `partial` — **any** mix, or **any** child partial.

### Map Node-Type Vocabulary (Frozen)

`root | feature | page | component | flow_step | form | api | state`

### Re-Run Rule

| Item status vs prior run | Behavior |
|--------------------------|----------|
| UNCHANGED | Keeps its prior tick state. |
| NEW | Starts `untested`. |
| CHANGED | Resets to `untested` **and** is flagged as changed. |

---

## Artifact Catalog

| Artifact | Filename(s) | Format | Produced by | References (upstream IDs) |
|----------|-------------|--------|-------------|---------------------------|
| Raw capture | `raw-capture.json` | JSON | Explorer | — (run root) |
| Discovery Model | `discovery-model.json`, `discovery-model.md` | JSON + MD | Classifier | raw-capture |
| Feature Tree | `feature-tree.json`, `feature-tree.md` | JSON + MD | Organizer | discovery-model (FEAT + member IDs) |
| Feature Relationships | `feature-relationships.json`, `feature-relationships.md` | JSON + MD | Organizer | discovery-model (FEAT, FLOW) |
| QA Inventory | `qa-inventory.json` | JSON | Organizer | discovery-model (one source entity per INV) |
| Application Overview | `application-overview.md`, `application-overview.json` | MD + JSON | Organizer | discovery-model, qa-inventory |
| QA Map | `qa-map.json`, `qa-map.html`, `qa-map.md` | JSON + HTML + MD | Organizer | discovery-model (one entity + parent MAP per node) |
| QA Checklist | `qa-checklist.json`, `qa-checklist.md` | JSON + MD | Checklist/Map Reporter | qa-inventory/discovery-model + qa-map (INV/Page + MAP per CHK) |
| Discovery Summary | `discovery-summary.json`, `discovery-summary.md` | JSON + MD | Checklist/Map Reporter | raw-capture, discovery-model |
| Manual Review | `manual-review.json`, `manual-review.md` | JSON + MD | Checklist/Map Reporter | discovery-model (blocked entity per MRR) |
| Discovery Validation | `discovery-validation.json`, `discovery-validation.md` | JSON + MD | Discovery Coverage Validator | raw-capture (audits Explorer) |
| Report | `report.md`, `report.html` | MD + HTML | Checklist/Map Reporter | all above |
| Bundle | `bundle.json` | JSON | Checklist/Map Reporter | all above |
| Diff (Phase 9, optional) | `diff-report.json`, `diff-report.md` | JSON + MD | Diff | two runs' bundles |

---

## Seven Primary Deliverables (Presentation Order)

| # | Deliverable | Artifact | Top-level shape (beyond envelope) |
|---|-------------|----------|-----------------------------------|
| 1 | Application Overview | `application-overview.*` | `{ appSummary, categories[], roleSummary[] }` |
| 2 | QA Inventory (counts) | `qa-inventory.json` | `{ items: InventoryItem[], countsByCategory }` — each item references exactly one source entity |
| 3 | Business Feature Tree | `feature-tree.*` | `{ root: FeatureTreeNode }` — nodes reference member IDs + parent |
| 4 | Hierarchical QA Map (tickable) | `qa-map.*` | `{ root: MapNode }` — nodes carry `nodeType`, `tickState`, entity ref, parent |
| 5 | QA Checklist (global + page-wise) | `qa-checklist.*` | `{ global: ChecklistItem[], byPage: { [pageId]: ChecklistItem[] } }` — each references one INV/Page + its MAP node |
| 6 | Discovery Summary (crawl-completeness) | `discovery-summary.*` | `{ pagesVisited, pagesSkipped, coverageByCategory, budgets }` |
| 7 | Manual Review Required | `manual-review.*` | `{ entries: ManualReviewEntry[] }` — each references a blocked entity + `blockerType` + reason |

### Cross-Cutting & Auxiliary

- **Confidence** — present on every discovered item (`confidence` 0–100 + `confidenceReason` when < 80). Not a separate artifact.
- **Feature Relationships** — `feature-relationships.*`: `{ relationships: { id: "REL:a->b", from, to, kind }[] }`.
- **Discovery Validation** — `discovery-validation.*`: `{ checks: { id: "VAL:...", finding, coverageGap? }[] }`; audits the Explorer stage only.

---

## Invariants

- No artifact contains a test case, verdict, score, severity, or verification instruction (enforced by the discipline gate).
- APIs appear as **mapped** entries (method + path template + trigger); never as API tests, never with response bodies.
- Every referenced ID resolves to an entity in an upstream artifact named in `sourceArtifacts`.
