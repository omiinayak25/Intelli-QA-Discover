# DATA FLOW & STORAGE

## StorageProvider / Repository Interface

Artifacts are loaded and saved **by name + version** through a single abstraction. The filesystem implementation is the **only lean backend**.

```
SKETCH — not implementation

interface StorageProvider {
  save(runId: string, name: string, version: string, data: unknown): Promise<void>;
  load<T>(runId: string, name: string, version: string): Promise<T>;
  exists(runId: string, name: string): Promise<boolean>;
  listRuns(): Promise<string[]>;
}
```

- `name` is a canonical artifact filename (`qa-map.json`, etc.).
- `version` is the `schemaVersion` (`1.0.0`); a load with a mismatched version errors.
- Agents depend on `StorageProvider`, never on the filesystem directly.

## Artifact Envelope

Every JSON artifact embeds:

```
{ artifact, schemaVersion, artifactId, runId, appUrl, generatedAt, roles, sourceArtifacts }
```

- `sourceArtifacts` records the upstream artifact IDs each artifact was built from — the on-disk provenance chain.

## Run Directory Layout

```
runs/
  <runId>/                     # runId e.g. RUN:01hxa
    raw-capture.json
    captures/                  # screenshots + raw DOM/network snapshots
      <page-slug>/…
    discovery-model.json
    discovery-model.md
    feature-tree.json
    feature-tree.md
    feature-relationships.json
    feature-relationships.md
    qa-inventory.json
    application-overview.md
    application-overview.json
    qa-map.json
    qa-map.html
    qa-map.md
    qa-checklist.json
    qa-checklist.md
    discovery-summary.json
    discovery-summary.md
    manual-review.json
    manual-review.md
    discovery-validation.json
    discovery-validation.md
    report.md
    report.html
    bundle.json
    diff-report.json           # Phase 9, optional
    diff-report.md             # Phase 9, optional
```

## Run Identity

- A run is identified by its `runId` (prefix `RUN:`, e.g. `RUN:01hxa`), stamped into every artifact's envelope.
- All artifacts for one run live under `runs/<runId>/`; re-runs are separate directories, compared by the Phase 9 diff.

## Storage Decision

- **No database engine now.** No knowledge graph. Files (JSON + Markdown + inlined HTML) behind the Repository are the whole persistence layer.
- SQLite is an optional future backend behind the same interface; it is not shipped.
