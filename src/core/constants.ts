/**
 * Canonical constants for the QA Discovery Agent.
 *
 * Discovery only — no test cases, no pass/fail, no risk scores.
 * These values are frozen contracts referenced by every phase.
 */

/** Frozen baseline schema version. Bump only on a real shape change; never phase-coupled. */
export const SCHEMA_VERSION = "1.0.0" as const;

/** Low-confidence threshold. Items below this MUST carry a reason. */
export const LOW_CONFIDENCE_THRESHOLD = 80 as const;

/** The one question the product answers. */
export const THE_ONE_QUESTION =
  "What all is present in this application that I need to test?";

/** The 10 discovery categories in canonical order (APIs = 7, Forms = 8). */
export const CATEGORIES = [
  "page",
  "navigation",
  "component",
  "business_feature",
  "user_flow",
  "hidden",
  "api",
  "form",
  "role",
  "state",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Canonical QA-map node-type vocabulary. */
export const MAP_NODE_TYPES = [
  "root",
  "feature",
  "page",
  "component",
  "flow_step",
  "form",
  "api",
  "state",
] as const;
export type MapNodeType = (typeof MAP_NODE_TYPES)[number];

/** Three-state tick model used everywhere a node can be covered. */
export type TickState = "untested" | "partial" | "tested";

/** Canonical artifact filenames (each emitter uses this exact string). */
export const FILENAMES = {
  rawCapture: "raw-capture.json",
  discoveryModelJson: "discovery-model.json",
  discoveryModelMd: "discovery-model.md",
  featureTreeJson: "feature-tree.json",
  featureTreeMd: "feature-tree.md",
  featureRelationshipsJson: "feature-relationships.json",
  featureRelationshipsMd: "feature-relationships.md",
  qaInventoryJson: "qa-inventory.json",
  applicationOverviewMd: "application-overview.md",
  applicationOverviewJson: "application-overview.json",
  qaMapJson: "qa-map.json",
  qaMapHtml: "qa-map.html",
  qaMapMd: "qa-map.md",
  qaChecklistJson: "qa-checklist.json",
  qaChecklistMd: "qa-checklist.md",
  discoverySummaryJson: "discovery-summary.json",
  discoverySummaryMd: "discovery-summary.md",
  manualReviewJson: "manual-review.json",
  manualReviewMd: "manual-review.md",
  discoveryValidationJson: "discovery-validation.json",
  discoveryValidationMd: "discovery-validation.md",
  reportMd: "report.md",
  reportHtml: "report.html",
  bundleJson: "bundle.json",
  diffReportJson: "diff-report.json",
  diffReportMd: "diff-report.md",
} as const;

/**
 * Manual-review blocker types (why auto-discovery was blocked).
 */
export const BLOCKER_TYPES = [
  "auth_gated",
  "payment_gateway",
  "otp",
  "captcha",
  "external_redirect",
  "native_dialog",
  "third_party_widget",
] as const;
export type BlockerType = (typeof BLOCKER_TYPES)[number];
