# SYSTEM ARCHITECTURE

## Pipeline (One Line)

**Explore → Classify → Organize/Inventory → Map/Checklist → Report**

Each stage reads a **versioned upstream artifact** and writes a **versioned downstream artifact**. There is **no mutable shared in-memory state** between stages: the artifact on disk is the only contract.

## The Four Agents

| Agent | Consumes | Produces | Responsibility |
|-------|----------|----------|----------------|
| **Explorer** | (live app URL + crawl config) | `raw-capture.json` | Safe, read-only crawl. Captures DOM, accessibility tree, computed styles, event listeners, nav edges, forms (not submitted), observed API calls. No classification, no vision, no reports. |
| **Classifier** | `raw-capture.json` | `discovery-model.json` (+ `discovery-model.md`) | Types raw evidence into the 10 discovery categories, infers semantics, assigns Confidence. **Only** place Claude vision is invoked — solely to type canvas/chart/custom widgets. |
| **Organizer / Inventory** | `discovery-model.json` | `qa-inventory.json`, `application-overview.{md,json}`, `feature-tree.{json,md}`, `feature-relationships.{json,md}`, `qa-map.{json,html,md}` | Counts, groups into a Business Feature Tree, builds the hierarchical tickable QA Map. |
| **Checklist / Map Reporter** | `discovery-model.json` + `qa-map.json` | `qa-checklist.{json,md}`, `discovery-summary.{json,md}`, `manual-review.{json,md}`, `discovery-validation.{json,md}`, `report.{md,html}`, `bundle.json` | Derives global + page-wise checklist items bound to map nodes, assembles the human-facing report bundle. |

## Data-Flow Guarantees

- **One-directional**: data flows Explore → Report; no stage writes back upstream.
- **Versioned handoff**: every artifact carries a common envelope with `schemaVersion` (frozen baseline `1.0.0`); a consumer reads a known artifact + version.
- **Deterministic transforms**: Classify onward are pure functions — same input yields same output, modulo `generatedAt`.
- **Separation of concerns**: the Explorer never renders reports; the Discovery Coverage Validator audits the Explorer stage and never becomes a report stage.

## Storage Boundary

All artifacts are persisted as JSON + Markdown files behind a **Repository** abstraction (filesystem backend in the lean build; SQLite optional and not shipped). No database engine, no knowledge graph.
