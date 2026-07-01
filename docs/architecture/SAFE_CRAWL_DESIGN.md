# SAFE CRAWL DESIGN

The Explorer is **read-only and non-destructive** by construction. It observes; it does not change server state.

## Read-Only / Non-Destructive Policy

| Allowed | Never |
|---------|-------|
| Navigate to URLs | Submit forms to observe server-side validation |
| Read DOM / accessibility tree / computed styles | Click destructive actions (delete, remove, pay, submit-order, logout, send) |
| Enumerate event listeners | Mutate, upload, purchase, or send anything |
| Reveal hidden elements via non-destructive triggers (hover, expand) | Trigger native dialogs that commit an action |
| Observe network requests (method + path template + trigger) | Store response bodies |

Forms are **read** (fields, types, required flags, client-side validation attributes) — never **submitted**.

## Deny-List Heuristic

Skip controls whose label/selector/attributes match destructive intent:

`delete` · `remove` · `pay` · `submit-order` · `logout` · `send`

(Matched case-insensitively across visible text, `aria-label`, `name`, and `value`.)

## Allow-List of Domains

- Crawl stays within a configured **allow-list of domains** (the app under test).
- Off-domain links are recorded as `external_redirect` and **not** followed (they route to Manual Review).

## Budgets

| Budget | Purpose |
|--------|---------|
| `maxDepth` | Cap navigation depth from the start URL. |
| `maxPages` | Cap total distinct pages visited. |
| `maxTime` | Wall-clock ceiling for a run. |

Hitting a budget ends the crawl cleanly and is recorded in `discovery-summary.*`.

## Auth Handling

- Supplied as **config**: an injected session/cookie **or** a declarative **login recipe** (fields + non-destructive submit performed once for session bootstrap).
- Auth-gated areas that cannot be reached with the provided credentials are recorded as `auth_gated` in Manual Review.

## Politeness

| Control | Setting |
|---------|---------|
| Concurrency | Capped parallel pages. |
| Rate limit | Minimum interval between requests. |
| Timeouts | Per-navigation and per-action timeouts. |
| Retry / backoff | Bounded retries with exponential backoff on transient failures. |

## Determinism Aids

- **Stable page keys**: URLs normalized to a page archetype slug (numeric/uuid segments collapse to `:param`) so the same page yields the same ID across runs.
- Deterministic ordering: collections sorted by stable ID before capture is written.

## Capture Scope → `raw-capture.json`

| Captured | Detail |
|----------|--------|
| Pages | Archetype, URL pattern, sample URLs, observed HTTP status. |
| Nav edges | Source → target links between pages. |
| Hidden elements | The element **and** how it was revealed (reveal trigger). |
| ARIA roles | From the accessibility tree. |
| Forms | Fields, types, required, **client-side validation attributes** — captured, **not submitted**. |
| Observed API calls | Method + **path template** + triggering action. **No response bodies.** |

Nothing in the capture is a test, a verdict, or a score — it is raw evidence only.
