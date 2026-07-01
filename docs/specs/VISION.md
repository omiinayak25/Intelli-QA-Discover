# VISION — QA Discovery Agent

## Product Definition

The QA Discovery Agent safely crawls a **running** web application with Playwright and produces human-consumable QA deliverables that describe **everything present** in the application: pages, navigation, components, business features, user flows, hidden elements, mapped APIs, forms, roles, and states. It discovers and organizes; the human tests.

> **Discovery only — no test cases, no pass/fail.**

## The One Question

> "What all is present in this application that I need to test?"

Every artifact exists to answer that single question — nothing more.

## Target User & Job-To-Be-Done

| Aspect | Detail |
|--------|--------|
| Primary user | QA lead / QA engineer |
| Core job | Walk into an unfamiliar (or evolving) app and get a complete, organized, tickable picture of its surface area — so nothing to test is missed. |
| Value | Replaces manual "click around and take notes" discovery with a safe, repeatable, versioned inventory. |

## In Scope

- Safe, read-only crawl of a live app (navigate, read DOM, observe network).
- Discovery across **10 categories**: page, navigation, component, business_feature, user_flow, hidden, api, form, role, state.
- Semantic **description** of each item (business function, inferred purpose, observed behavior, flow membership) — descriptive only.
- Cross-cutting **Confidence** (0–100) on every discovered item, expressing certainty of *discovery*.
- Organized deliverables: Application Overview, QA Inventory, Business Feature Tree, hierarchical **tickable** QA Map, QA Checklist (global + page-wise), Discovery Summary, Manual Review Required, plus Feature Relationships and Discovery Validation.
- Outputs as Markdown, interactive HTML tree, and JSON.
- Three-state tick model (`untested | partial | tested`) that carries over across re-runs so a human tracks their own coverage.

## Out of Scope (Explicitly Banned)

The product **never** produces or performs any of the following:

- Test case generation
- Test execution / pass-fail assertions
- API testing (APIs are **mapped only**)
- Risk scoring
- Severity
- Vision heatmaps
- ML-based test design
- Knowledge-graph databases
- Plugin marketplace

Naming these here is a statement of what the product does **not** do. No deliverable prescribes verification, asserts an outcome, or scores quality.

## Success Criteria (Observable Outcomes)

| # | Outcome |
|---|---------|
| 1 | A single crawl of an unseen app yields a complete inventory across all 10 categories with stable IDs. |
| 2 | A QA engineer can open the HTML QA Map and tick items; ticks survive a re-run for unchanged items. |
| 3 | Every discovered item carries a Confidence score; low-confidence items (< 80) carry a reason. |
| 4 | Items that auto-discovery could not reach (auth, payment, OTP, captcha, etc.) appear in Manual Review Required with a blocker reason. |
| 5 | Re-running against a changed app flags NEW and CHANGED items and preserves tick state for UNCHANGED ones. |
| 6 | No emitted artifact contains a test case, verdict, score, or verification instruction. |
