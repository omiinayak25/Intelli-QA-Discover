# ARCHITECTURE OVERVIEW

## Module Map & Boundaries

| Module | Directory | Single Responsibility | Allowed Dependencies |
|--------|-----------|-----------------------|----------------------|
| **core** (domain model) | `src/core` | Constants, ID scheme, envelope, entity types, discipline gate. | none (inward-most) |
| **explorer** | `src/explorer` | Safe read-only crawl → `raw-capture.json`. | core |
| **classifier** | `src/classifier` | Raw → `discovery-model.json`; the only place vision runs. | core |
| **organizer** (builders) | `src/builders` | Inventory, overview, feature tree, QA map. | core |
| **reporter** (builders) | `src/builders` | Checklist, summary, manual-review, validation, report bundle. | core |
| **storage** | `src/storage` | Repository interface + filesystem backend. | core |
| **cli** | `src/cli` | Orchestrate the pipeline end to end. | core, storage, agents |

**Dependency direction:** all modules point **inward to `core`**. **Agents never import each other** — they communicate only through versioned artifacts on disk via `storage`.

## Data-Flow Diagram (Canonical Filenames)

```
                 (live app URL + crawl config)
                              │
                     ┌────────▼────────┐
                     │    Explorer     │   (no vision, read-only)
                     └────────┬────────┘
                              ▼
                       raw-capture.json
                              │
                     ┌────────▼────────┐         ┌───────────────────────────┐
                     │   Classifier    │         │ Discovery Coverage         │
                     │ (vision: typing │◄────────│ Validator (audits Explorer │
                     │  canvas/chart)  │  audits │ → discovery-validation.*)  │
                     └────────┬────────┘         └───────────────────────────┘
                              ▼
                     discovery-model.json / .md
                              │
                 ┌────────────▼────────────┐
                 │   Organizer / Inventory │
                 └────────────┬────────────┘
      ┌───────────────┬───────┼───────────────┬──────────────────┐
      ▼               ▼       ▼                ▼                  ▼
qa-inventory.json  feature-tree.*  feature-relationships.*  application-overview.*  qa-map.{json,html,md}
                              │
                 ┌────────────▼────────────┐
                 │  Checklist / Map Reporter│
                 └────────────┬────────────┘
      ┌──────────────┬────────┼──────────────┬───────────────┐
      ▼              ▼        ▼               ▼               ▼
qa-checklist.*  discovery-summary.*  manual-review.*  report.{md,html}  bundle.json
```

## Builder Pipeline Decision (Required)

- **Single responsibility, one-directional:** Explorer → Raw Discovery Model → Semantic Analyzer → Business Feature Builder → QA Map Builder → Checklist Builder → Report Builder.
- **The Explorer never builds reports.** It only crawls and captures.
- **The Discovery Coverage Validator audits the Explorer stage** (reads `raw-capture.json`, emits `discovery-validation.*`) and **never becomes a report stage**.
- Every stage reads a versioned upstream artifact and writes a versioned downstream artifact; **no mutable shared in-memory state**.
