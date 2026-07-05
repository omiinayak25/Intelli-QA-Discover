# UX Experiment — Analysis Report

_Audit before code. Goal: an isolated, feature-flagged, fully reversible
simplified experience that coexists with the current UI. Nothing in the engine,
Discovery Model, crawler, storage, or existing React app is modified or removed._

## 1. Current architecture (audited)

| Area | Current implementation | Notes |
|---|---|---|
| Routing | `web/src/App.tsx` — `/`, `/projects`, `/projects/:id`, `/knowledge`, `/discoveries`, `/discover/:id`, `/discoveries/:id[/:view[/:sub]]` | Flat React-Router v6. |
| Home | `pages/Landing.tsx` | Hero + stats + projects + quick-actions + news. Rich. |
| Report | `pages/Report.tsx` + `report/*` | Sidebar with **21 views** + Ctrl-K search; renders the `PortalModel` from `/api/discoveries/:id/model`. |
| Component detail | `report/views.tsx` → `ComponentDetail` + `LiveInspector` | Live Browser Mode (CSS→ARIA→text→box location). |
| Screenshots | `report/ui.tsx` → `ScreenshotOverlay` | Annotated hotspots. |
| Data | API only; `PortalModel` is the single read-model. | Frontend never re-derives. |

## 2. Pain points (why it "feels complicated")

1. **Information overload on entry to a report** — the sidebar exposes 21 destinations and the Components view can list thousands of rows immediately. A non-QA user does not know "what to do next".
2. **No progressive disclosure** — technical depth (selectors, ARIA, API map) sits at the same level as "what does this app do".
3. **Navigation-first, not intent-first** — the user must know which menu holds what they want; there's no "I want to find the login" path.
4. **Highlight can miss** — Live Browser Mode tries CSS→ARIA→text→box, but on a failed selector with no box it returns "not located" instead of a *closest match*, and gives no confidence/match-type or visual pulse.

## 3. Proposed simplifications (all additive, all flagged)

- **Simple Home** (`experimentalUX`): one URL box, one primary action, four intents (Explore / Find a Feature / Start Manual Testing / Advanced Workspace), recent projects. Nothing else.
- **Progressive disclosure report** (`progressiveDisclosure`): starts at *what the app does* + main modules + main journeys + estimated exploration time; reveals Features → Pages → Components → technical metadata only on demand.
- **Guided Discovery** (`guidedDiscovery`): a 5-minute step-through of the app's business modules.
- **AI-first navigation** (`aiFirst`): an ask box as the primary control ("show login", "where is payment") that performs the navigation.
- **Smart component location** (`smartLocation`): confidence + match-type ("Exact 96%" / "Closest Match 82%"), a *nearest-similar* fallback that never dead-ends, and a pulse highlight. This only strengthens the existing live inspector — it can never return a worse result than today.

## 4. Risk analysis

| Risk | Mitigation |
|---|---|
| Breaking the current UI | The experiment lives in `web/src/experimental/*` on **new routes** (`/x`, `/x/discoveries/:id`). Existing routes/components are untouched. |
| Users stuck in the experiment | A persistent "Back to classic" control; classic routes always reachable. |
| Engine / model drift | Zero engine/model/crawler/storage changes. The experiment consumes the **same** `PortalModel` API. |
| Highlight regressions | Smart location is strictly additive (new fallbacks + metadata); the previous strategies run first, unchanged. |

## 5. Rollback strategy (< 1 minute, no migrations)

- All experimental UI is gated by flags in `localStorage` (`iqad:flags`) + an optional `?ux=exp` URL param. **Default = OFF** → current experience for everyone.
- To roll back: turn the flag off (a toggle in the UI, or clear `iqad:flags`). No DB migration, no schema change, no Discovery Model change, no crawler change, no rebuild required.
- Worst case: delete `web/src/experimental/` and the two route lines — the classic app is entirely intact.

## 6. Experiment metrics (client-side, local only)

A tiny `metrics` recorder (localStorage) counts: time-to-first-discovery, clicks-to-feature, clicks-to-component, highlight success rate + match-type, search usage, AI-assistant usage. No PII, no network; surfaced in the experiment's Settings for evaluation.

## 7. Decision

Proceed with an **opt-in** experimental layer (default off), so current users are unaffected and the experiment is measurable and reversible. Power users keep the full Advanced Workspace unchanged.
