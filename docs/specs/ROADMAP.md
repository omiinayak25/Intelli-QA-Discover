# ROADMAP

Phases −1 … 9. One line each. Phase 9 is **optional**.

| Phase | Name | One-line goal |
|-------|------|---------------|
| −1 | Specification | Freeze vision, discovery model, contracts, and standards (this `docs/specs/`). |
| 0 | Architecture | Module map, safe-crawl design, agent set, storage, extensibility, interface sketches (`docs/architecture/`). |
| 1 | Explore | Safe read-only Playwright crawl → `raw-capture.json`. |
| 2 | Classify | Type raw evidence into the 10 categories → `discovery-model.json` (vision here only, canvas/chart/custom typing). |
| 3 | Semantic Analysis | Infer businessFunction / purpose / behavior / flow membership with semanticConfidence. |
| 4 | Business Feature Build | Group into features → `feature-tree.*` + `feature-relationships.*`. |
| 5 | QA Map Build | Build the hierarchical tickable map → `qa-map.{json,html,md}`. |
| 6 | Inventory & Overview | Counts + `application-overview.*` + `qa-inventory.json`. |
| 7 | Checklist Build | Global + page-wise → `qa-checklist.*`. |
| 8 | Report Build | `discovery-summary.*`, `manual-review.*`, `discovery-validation.*`, `report.*`, `bundle.json`. |
| 9 | Multi-Run Diff *(optional)* | Compare two runs → `diff-report.*`; drives NEW/CHANGED/UNCHANGED tick carry-over. |

## Builder Pipeline (One-Directional)

Explorer → Raw Discovery Model → Semantic Analyzer → Business Feature Builder → QA Map Builder → Checklist Builder → Report Builder. The Explorer never renders reports; the Discovery Coverage Validator audits the Explorer stage and never becomes a report stage.

## Out of Scope (Verbatim — Permanently Banned)

- Test case generation
- Test execution / pass-fail assertions
- API testing (APIs are mapped only)
- Risk scoring
- Severity
- Vision heatmaps
- ML-based test design
- Knowledge-graph databases
- Plugin marketplace
