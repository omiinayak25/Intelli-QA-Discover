# CODING STANDARDS

## Language & Runtime

- **TypeScript**, `strict` mode. No `any` in artifact contracts; entity shapes are typed (see `src/core/types.ts`).
- ES modules (`.js` specifiers in imports, per Node ESM).
- Target the pinned Node LTS; no runtime-specific globals in transform code.

## Module Layout

| Layer | Directory | Role |
|-------|-----------|------|
| Core / domain | `src/core` | Constants, ID scheme, envelope, entity types, discipline gate. The inward-most layer. |
| Explorer | `src/explorer` | Safe crawl → `raw-capture.json`. |
| Classifier | `src/classifier` | Raw → `discovery-model.json` (vision here only). |
| Builders | `src/builders` | Organizer/Inventory + Checklist/Map/Report transforms. |
| Storage | `src/storage` | Repository interface + filesystem backend. |
| CLI | `src/cli` | Entry points / orchestration. |

**Dependency direction:** everything points **inward to `core`**. Agents/builders never import one another.

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `dom-extract.ts` |
| Types / interfaces | PascalCase | `ComponentItem` |
| Functions / vars | camelCase | `pageArchetypeSlug` |
| Constants | UPPER_SNAKE | `SCHEMA_VERSION` |
| Stable IDs | `PREFIX:key` | `CMP:home:hero-banner` |
| Artifact filenames | exact canonical string | `qa-map.json` |
| Role labels | lowercase/slug in storage | `admin` (Title-Cased only at render) |

## Cross-Stage Data Rule

- **All cross-stage data crosses as versioned artifacts** (JSON on disk behind the Repository) — **never** via shared globals or mutable in-memory state.
- A consumer loads a named artifact at a known `schemaVersion`; it does not reach into another stage's memory.

## Determinism Rule (Phases 2–9)

- Every transform in Phases 2–9 is **pure and deterministic**: same input → same output, **modulo `generatedAt`**.
- `generatedAt` is **passed in**, never produced by `Date.now()` inside a transform.
- No wall-clock, no `Math.random`, no filesystem ordering assumptions inside transforms. Sort collections by stable ID before emit.

## Error Handling

- Fail fast at stage boundaries: a missing/invalid upstream artifact throws before any output is written.
- Validate the envelope (`validateEnvelope`) on load; a `schemaVersion` mismatch is an error, not a coercion.
- Never swallow errors silently; never emit a partial artifact under an error.

## Logging

- Structured, leveled logs (`info` / `warn` / `error`) to stderr; artifacts to stdout/files only.
- Log stage name, `runId`, artifact name, and counts — not raw page content.
- No secrets, cookies, or auth tokens in logs.

## Scope-Discipline Gate

- Before any builder emits an artifact, it runs the canonical discipline scan (`assertClean`) — a single shared forbidden-token regex (`src/core/discipline.ts`), not a per-phase ad-hoc set.
- A forbidden token (test case, verdict, score, verification instruction) in an emitted artifact is a **defect** and blocks emit.
