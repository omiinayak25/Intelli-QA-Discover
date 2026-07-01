# TESTING STRATEGY (of the Tool)

**Scope note.** This describes how **WE** test the QA Discovery Agent itself — our own codebase. It is **not** the discovery output, and it does **not** change the product's discipline: the product still emits **no** test cases, no verdicts, no scores. The tests below live in our repo, not in any deliverable.

---

## Layers

| Layer | What it covers | Approach |
|-------|----------------|----------|
| **Unit tests (transforms)** | Pure functions in `core` and `builders` — ID generation, sameness keys, envelope, tickState roll-up, discipline scan, category typing helpers. | Feed a fixed input object, assert the returned object equals the expected structure (modulo `generatedAt`). |
| **Golden-file tests (artifacts)** | Whole-artifact output for each emitter. | Run the transform on a frozen input artifact; compare the emitted JSON/MD byte-for-byte (modulo `generatedAt`) to a committed golden file. Regenerate goldens deliberately when a shape changes. |
| **End-to-end (sample-app fixture)** | Explore → Classify → Organize → Report against a **local sample web app** fixture. | Crawl the fixture, run the full pipeline, assert the produced bundle matches a golden bundle and that all filenames/IDs are present. |

## Determinism Aids for Tests

- Inject a fixed `generatedAt` and `runId` so transform output is byte-stable.
- Vision (Phase 2) is **stubbed** in tests with a recorded typing response — no live model call, keeping E2E deterministic and free.
- The sample-app fixture is served locally (static), so the crawl is repeatable and offline.

## What We Assert

- Every artifact carries a valid envelope at `schemaVersion 1.0.0`.
- Stable IDs are content/selector-derived and identical across two runs of the same fixture.
- tickState roll-up matches the frozen rule; re-run carry-over keeps UNCHANGED, resets CHANGED, marks NEW `untested`.
- The **discipline gate passes**: `assertClean` finds zero forbidden tokens in every emitted artifact.
- Manual-review entries carry a valid `blockerType`.

## What We Do NOT Do

- We do not assert anything about the *tested app's* correctness — our tests judge **our transforms**, not the target app.
- We do not generate test cases as output; the golden files are inputs/fixtures for our own suite, never a product deliverable.
