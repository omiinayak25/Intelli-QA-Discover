# DISCOVERY MODEL — The Anchor

This is the authoritative definition of the discovery domain. Every other doc defers to this one.

All entities describe **what exists**. There is no `expected*` field, no verdict, no pass/fail, no risk, no severity anywhere by design.

---

## 1. The 10 Discovery Categories (Canonical Order)

| # | Category | Entity | Describes |
|---|----------|--------|-----------|
| 1 | `page` | PageItem | A distinct routed screen / archetype. |
| 2 | `navigation` | NavigationItem | A nav structure (header, sidebar, menu) and its edges. |
| 3 | `component` | ComponentItem | A discrete UI element (interactive or not). |
| 4 | `business_feature` | FeatureItem | A named capability grouping pages/components/forms/flows/apis. |
| 5 | `user_flow` | FlowItem | An ordered path of steps across pages/components. |
| 6 | `hidden` | HiddenItem | An element revealed only by an interaction. |
| 7 | `api` | ApiItem | An **observed** network call (method + path template + trigger). **Mapped only.** |
| 8 | `form` | FormItem | A form + its fields + client-side validation attributes (never submitted). |
| 9 | `role` | RoleItem | A distinct access role and what it can reach. |
| 10 | `state` | StateItem | An observed UI state (empty, error, loading, etc.). |

### Derived (non-category) entities

| Entity | Purpose |
|--------|---------|
| InventoryItem | A single counted row referencing exactly one source entity. |
| ChecklistItem | A tickable line bound to one InventoryItem/Page **plus** its MapNode. |
| MapNode | One node in the hierarchical QA Map. |
| FeatureTreeNode | One node in the Business Feature Tree. |
| ManualReviewEntry | A blocked entity + the reason auto-discovery could not reach it. |

---

## 2. Canonical Stable ID Scheme (FROZEN)

Format: `<PREFIX>:<content/selector-derived key>` — **NEVER index-based** (index IDs reshuffle on add/remove and break diffing and tick carry-over). Keys derive from content/selectors so the same underlying thing keeps the same ID across runs.

| Prefix | Entity | Example |
|--------|--------|---------|
| `RUN` | Run | `RUN:01hxa` |
| `PAGE` | Page | `PAGE:home` |
| `NAV` | Navigation | `NAV:header-search` |
| `CMP` | Component | `CMP:home:hero-banner` |
| `FEAT` | Business feature | `FEAT:booking` |
| `FLOW` | User flow | `FLOW:booking` |
| `HID` | Hidden element | `HID:home:kebab-menu` |
| `API` | Observed API | `API:GET:/movies` |
| `FORM` | Form | `FORM:checkout:payment` |
| `ROLE` | Role | `ROLE:admin` |
| `STATE` | State | `STATE:home:empty` |
| `INV` | Inventory item | `INV:buttons` |
| `MAP` | Map node | `MAP:auth:login` / `MAP:pages:home:banner` |
| `CHK` | Checklist item | `CHK:global:login` / `CHK:home:banner` |
| `FEATNODE` | Feature-tree node | `FEATNODE:authentication:login` |
| `MRR` | Manual-review entry | `MRR:payment-gateway` |
| `REL` | Feature relationship | `REL:login->dashboard` |
| `VAL` | Validation entry | `VAL:all-accordions-expanded` |
| `OVW` | Overview | (envelope-level) |
| `SUM` | Summary | (envelope-level) |

---

## 3. Sameness Key (ID Stability Basis)

The **sameness key** is what makes an ID stable across runs. Two runs that observe the same underlying thing must produce the same key.

| Entity | Sameness key basis |
|--------|--------------------|
| Page | URL normalized to a page **archetype** slug (numeric/uuid segments collapse to `:param`). |
| Navigation | Nav type + scope + stable label/selector. |
| Component | `page-slug` + hash(selector, label). |
| Feature | Feature name slug. |
| Flow | Flow name slug (feature-scoped). |
| Hidden | `page-slug` + reveal-trigger/selector. |
| API | `METHOD` + path **template** (data-variant segments collapsed). |
| Form | `page-slug` + form name/selector. |
| Role | Role slug (lowercase). |
| State | `entity-slug` + state slug. |
| InventoryItem | Category/label of its single source entity. |
| MapNode | Referenced entity ID + parent map path. |
| ChecklistItem | Referenced InventoryItem/Page ID + MapNode ID. |
| FeatureTreeNode | Feature-tree path (`feature:member`). |
| ManualReviewEntry | Blocked entity ID + blocker type. |

---

## 4. Fields On Every Entity

Each entity (via `BaseItem`) carries:

| Field | Meaning |
|-------|---------|
| `id` | Stable ID (§2). |
| `category` | One of the 10 categories. |
| `label` | Human label. |
| `roleVisibility[]` | Roles that can reach it — stored **lowercase/slug**. |
| `detectionMethod` | `dom` \| `accessibility_tree` \| `computed_style` \| `event_listener` \| `network` \| `vision`. |
| `sourceEvidence` | Provenance: `{ rawArtifact, stateId?, locator?, screenshotRef? }` → links back to `raw-capture.json`. |
| **Confidence** | `confidence` (0–100) + `confidenceReason?`. |
| **Semantics** | `businessFunction`, `inferredPurpose`, `behavior`/`leadsTo[]`, `partOfFlow` + `semanticConfidence`. |
| **ManualReviewTag** | `manualReview`, `manualReviewReason?`, `blockerType?`. |

### Cross-cutting Confidence

- `confidence`: 0–100, certainty of **DISCOVERY** (the item exists / is correctly identified). Never a test/pass probability.
- Low-confidence threshold = **80**. Below it, `confidenceReason` **must** be non-empty.

### Semantic fields (descriptive, never prescriptive)

- `businessFunction`, `inferredPurpose`, `behavior`/`leadsTo`, `partOfFlow`, each with its own `semanticConfidence` (+ reason when low).
- Allowed: `"opens Seat Selection"`. Forbidden: prescriptive phrasings that assert a required outcome.

### Manual-review tags (blocker types)

`auth_gated` · `payment_gateway` · `otp` · `captcha` · `external_redirect` · `native_dialog` · `third_party_widget`

---

## 5. Provenance

Every entity references:

1. The **run** (`runId` in envelope) that produced it.
2. The **raw-capture evidence** (`sourceEvidence.rawArtifact` + `locator`/`stateId`/`screenshotRef`).
3. **Upstream entity IDs** it was built from (e.g. a Feature references its member Page/Component/Form IDs).

---

## 6. Relationship Rules

| Relationship | Rule |
|--------------|------|
| Flow | References Pages / Forms / Components by ID (ordered `steps`). |
| InventoryItem | References **exactly one** source entity. |
| ChecklistItem | References **exactly one** InventoryItem **or** Page, **plus** its MapNode. |
| MapNode | References **one** entity + **one** parent MapNode. |
| FeatureTreeNode | References member entity IDs + parent FeatureTreeNode. |
| ManualReviewEntry | References the blocked entity + blocker reason. |
| Feature | References its member `pages/components/forms/flows/apis` IDs. |
| Role | References its reachable page/nav/component/feature/form/hidden IDs. |

---

## 7. Frozen Conventions

- **Role labels** are stored **lowercase/slug** (`guest`, `user`, `admin`) and **Title-Cased only at render time**.
- **schemaVersion** frozen baseline `1.0.0`; bump only on real shape change; never coupled to phase number.
- **tickState**: `untested | partial | tested` (roll-up defined in OUTPUT_CONTRACTS.md).
- **Map node-type vocabulary**: `root | feature | page | component | flow_step | form | api | state`.
