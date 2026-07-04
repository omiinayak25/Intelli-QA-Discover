/**
 * Raw capture contract (Phase 1 output). The Explorer produces ONLY this; it
 * never interprets, classifies, scores, or renders. Downstream phases treat it
 * as immutable evidence.
 *
 * DISCIPLINE: raw capture records WHAT EXISTS and HOW IT WAS REACHED. It never
 * records whether anything WORKS. No response bodies are ever stored.
 */

import type { Envelope } from "./envelope.js";

export interface CapturedRequest {
  /** DOM node id of the UI action that initiated this request. */
  uiActionNodeId: string | null;
  method: string;
  urlTemplate: string;
  resourceType: string;
  status: number | null;
  timingMs: number | null;
  /** Request key names only — values REDACTED. Never a body. */
  requestShape: string[];
  authSignalObserved: "cookie" | "bearer" | "none";
}

export interface CapturedComponent {
  nodeId: string;
  tag: string;
  role?: string;
  label: string;
  /** Component type from the extraction taxonomy (button, input, table, …). */
  type: string;
  selector: string;
  xpath?: string;
  interactive: boolean;
  eventListeners: string[];
  attributes: Record<string, string>;
  /** hints the Classifier uses to type it (e.g. "canvas", "chart"). */
  visualHint?: string;
  parentNodeId?: string | null;
  opensNodeId?: string | null;
}

export interface CapturedFormField {
  label: string;
  name: string;
  type: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: string[];
  validationAttributesObserved: string[];
  nodeId?: string;
}

export interface CapturedForm {
  nodeId: string;
  name: string;
  selector: string;
  fields: CapturedFormField[];
  submitControlNodeId?: string;
  resetControlNodeId?: string;
  multiStep: boolean;
  /** Only set for idempotent GET-style navigations observed safely. */
  submitTargetApi?: string;
}

export interface CapturedNav {
  nodeId: string;
  type: string;
  label: string;
  region: string;
  scope: "global" | "page-local";
  selector: string;
  revealTrigger: string;
  items: { label: string; selector: string; target: string }[];
}

export interface CapturedHidden {
  nodeId: string;
  type: string;
  revealTrigger: string;
  revealedNodeId?: string;
  detectionMethod: string;
  reproducible: boolean;
  preconditions?: string;
}

export interface CapturedOverlay {
  type: string; // modal | cookie | consent | auth | session-timeout | 404 | 500 | ...
  label: string;
  dismissed: boolean;
}

export interface SkippedForSafety {
  target: string;
  reason: string;
}

export interface ConfidenceSignals {
  /** direct-nav | hidden-nav | inferred */
  reachedBy: string;
  /** full | partial | blocked */
  captureCompleteness: string;
  authTruncated: boolean;
  detectionStrength: "strong" | "medium" | "weak";
}

export interface CaptureState {
  schemaVersion: string;
  id: string;
  role: string;
  route: string;
  url: string;
  title: string;
  httpStatus: number | null;
  dataState: string;
  fingerprint: string;
  parentIds: string[];
  authRequired: boolean;
  discoverySource: string;
  components: CapturedComponent[];
  forms: CapturedForm[];
  navs: CapturedNav[];
  hidden: CapturedHidden[];
  network: CapturedRequest[];
  overlays: CapturedOverlay[];
  observedStates: { type: string; observationMethod: string; detectionSignal: string }[];
  skippedForSafety: SkippedForSafety[];
  confidenceSignals: ConfidenceSignals;
  responsiveBreakpoints: string[];
  capture: {
    screenshotPath?: string;
    viewportShotPath?: string;
    tabletShotPath?: string;
    mobileShotPath?: string;
    shotWidth?: number;
    shotHeight?: number;
    componentBoxes?: { id: string; label: string; type: string; x: number; y: number; w: number; h: number }[];
    domPath?: string;
    a11yPath?: string;
    computedStylesPath?: string;
    consolePath?: string;
    eventsPath?: string;
  };
}

export interface CrawlEdge {
  from: string;
  action: string;
  targetNodeId: string;
  uiNodeActedUpon: string;
}

export interface CrawlTelemetry {
  pagesVisited: number;
  pagesVisitedIds: string[];
  pagesSkipped: { id: string; reason: string }[];
  rolesCrawled: string[];
  statesObserved: string[];
  statesNotObserved: string[];
  hiddenRevealed: number;
  lazySections: number;
  formsFound: number;
  loopsPrevented: number;
  maxDepth: number;
  pagesNotReachable: number;
  authenticationProtected: number;
  responsiveLayouts: string[];
}

export interface TechniqueCounts {
  accordionsFound: number;
  accordionsExpanded: number;
  menusFound: number;
  menusOpened: number;
  hoverElementsFound: number;
  hoverElementsFired: number;
  lazySectionsFound: number;
  lazySectionsScrolled: number;
  iframesSeen: number;
  iframesInspected: number;
  shadowRootsSeen: number;
  shadowRootsTraversed: number;
  pagesRevisitedAfterLogin: number;
  routesDiscovered: number;
  routesVisited: number;
  unreachableRoutes: { route: string; reason: string }[];
}

export interface ExplorationTechniqueTelemetry {
  byPage: Record<string, TechniqueCounts>;
  byRole: Record<string, TechniqueCounts>;
}

export interface BlockedItem {
  target: string;
  reason: string;
  humanPointer: string;
  blockerType: string;
}

export interface RawCapture extends Envelope {
  artifact: "raw_capture";
  config: Record<string, unknown>;
  counts: { states: number; edges: number; requests: number; forms: number; components: number };
  statesById: Record<string, CaptureState>;
  edges: CrawlEdge[];
  perRolePartitions: Record<string, string[]>;
  telemetry: CrawlTelemetry;
  explorationTechniqueTelemetry: ExplorationTechniqueTelemetry;
  blockedItems: BlockedItem[];
}
