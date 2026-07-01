# AGENTS

A **small, fixed** agent set. Agents communicate only through versioned artifacts (never in-memory), and never import one another.

---

## 1. Explorer

| | |
|---|---|
| **Responsibility** | Safe, read-only Playwright crawl of the live app. Captures raw evidence only. **No vision.** No classification, no reports. |
| **Input** | Live app URL + crawl config (allow-list, budgets, auth). |
| **Output** | `raw-capture.json` |
| **Invariant** | **Non-destructive**: never submits forms, never triggers destructive actions, never stores response bodies. Pages get stable archetype keys. |

## 2. Classifier

| | |
|---|---|
| **Responsibility** | Type raw evidence into the 10 discovery categories, assign Confidence, attach semantics. |
| **Input** | `raw-capture.json` @ `schemaVersion 1.0.0` |
| **Output** | `discovery-model.json`, `discovery-model.md` |
| **Vision** | The **only** agent that invokes Claude vision — **solely** to TYPE canvas/chart/custom widgets (sets `visionClassified`, `detectionMethod: "vision"`). |
| **Invariant** | Descriptive only: semantics never prescribe an outcome. Every item carries `confidence`; if `< 80`, a non-empty `confidenceReason`. IDs are content/selector-derived. |

## 3. Organizer / Inventory

| | |
|---|---|
| **Responsibility** | Count items, build the Business Feature Tree and relationships, build the hierarchical tickable QA Map, write the overview. |
| **Input** | `discovery-model.json` @ `schemaVersion 1.0.0` |
| **Output** | `qa-inventory.json`, `application-overview.{md,json}`, `feature-tree.{json,md}`, `feature-relationships.{json,md}`, `qa-map.{json,html,md}` |
| **Invariant** | Each InventoryItem references **exactly one** source entity; each MapNode references **one** entity + parent; node types drawn only from `root \| feature \| page \| component \| flow_step \| form \| api \| state`. |

## 4. Checklist / Map Reporter

| | |
|---|---|
| **Responsibility** | Derive global + page-wise checklist items bound to map nodes; assemble summary, manual-review, validation, and the human report bundle. |
| **Input** | `discovery-model.json` + `qa-map.json` @ `schemaVersion 1.0.0` |
| **Output** | `qa-checklist.{json,md}`, `discovery-summary.{json,md}`, `manual-review.{json,md}`, `discovery-validation.{json,md}`, `report.{md,html}`, `bundle.json` |
| **Invariant** | Each ChecklistItem references **exactly one** InventoryItem/Page **plus** its MapNode; tickState roll-up follows the frozen rule; the discipline gate passes before emit. |

---

## Shared Invariants (All Agents)

- Read a versioned upstream artifact; write a versioned downstream artifact. No mutable shared state.
- Deterministic (Phases 2–9): same input → same output modulo `generatedAt`.
- Role labels stored lowercase/slug; Title-Cased only at render.
- No artifact contains a test case, verdict, score, severity, or verification instruction.

## Not An Agent

The **Discovery Coverage Validator** audits the Explorer stage (reads `raw-capture.json` → `discovery-validation.*`). It is an auditor, not a report stage.
