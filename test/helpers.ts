/**
 * Test helpers — build a small, realistic RawCapture in-memory so the pure
 * transforms (Phases 2-9) can be tested deterministically without a browser.
 */

import { componentId, id, pageArchetypeSlug, hash } from "../src/core/ids.js";
import { SCHEMA_VERSION } from "../src/core/constants.js";
import { makeEnvelope } from "../src/core/envelope.js";
import type { CaptureState, RawCapture, TechniqueCounts } from "../src/core/raw-capture.js";

const AT = "2026-07-01T10:22:04Z";

function tech(over: Partial<TechniqueCounts> = {}): TechniqueCounts {
  return {
    accordionsFound: 2, accordionsExpanded: 2, menusFound: 1, menusOpened: 1,
    hoverElementsFound: 1, hoverElementsFired: 1, lazySectionsFound: 1, lazySectionsScrolled: 1,
    iframesSeen: 1, iframesInspected: 0, shadowRootsSeen: 0, shadowRootsTraversed: 0,
    pagesRevisitedAfterLogin: 1, routesDiscovered: 3, routesVisited: 3, unreachableRoutes: [],
    ...over,
  };
}

function state(role: string, url: string, compsIn: { sel: string; label: string; type: string }[], opts: Partial<CaptureState> = {}): CaptureState {
  const pslug = pageArchetypeSlug(url);
  // a shared header component present on every page -> promoted to GLOBAL
  const comps = [{ sel: "header .logo", label: "Logo", type: "button" }, ...compsIn];
  return {
    schemaVersion: SCHEMA_VERSION,
    id: id("STATE", role, pslug, hash(comps.map((c) => c.sel).join())),
    role,
    route: url,
    url,
    title: opts.title ?? `App — ${pslug}`,
    httpStatus: 200,
    dataState: "populated",
    fingerprint: `${url}::${role}`,
    parentIds: [],
    authRequired: role !== "guest",
    discoverySource: "crawl-link",
    components: comps.map((c) => ({
      nodeId: componentId(pslug, c.sel, c.label),
      tag: "button",
      role: "",
      label: c.label,
      type: c.type,
      selector: c.sel,
      interactive: true,
      eventListeners: ["click"],
      attributes: {},
      visualHint: c.type === "chart" ? "canvas" : "",
      parentNodeId: null,
      opensNodeId: null,
    })),
    forms: [],
    navs: [
      { nodeId: id("NAV", "header-primary"), type: "header", label: "Header", region: "header", scope: "global", selector: "header", revealTrigger: "always-visible", items: [{ label: "Home", selector: "a", target: "/" }] },
    ],
    hidden: [
      { nodeId: id("HID", pslug, hash(url, "menu")), type: "hover-revealed", revealTrigger: "hover menu", detectionMethod: "listener-scan", reproducible: true } as any,
    ],
    network: [
      { uiActionNodeId: null, method: "GET", urlTemplate: `/${pslug}`, resourceType: "document", status: 200, timingMs: 10, requestShape: [], authSignalObserved: role === "guest" ? "none" : "cookie" },
    ],
    overlays: [{ type: "cookie", label: "Cookie", dismissed: true }],
    observedStates: [{ type: "populated", observationMethod: "safe-ui-action", detectionSignal: "content" }],
    skippedForSafety: [],
    confidenceSignals: { reachedBy: "direct-nav", captureCompleteness: "full", authTruncated: false, detectionStrength: "strong" },
    responsiveBreakpoints: [],
    capture: {},
    ...opts,
  };
}

export function makeRawCapture(): RawCapture {
  const runId = id("RUN", "test01");
  const states: CaptureState[] = [
    state("guest", "http://app.test/", [
      { sel: ".search", label: "Search", type: "search" },
      { sel: ".book", label: "Book Now", type: "button" },
      { sel: ".filter", label: "Filters", type: "dropdown" },
    ], { title: "App — Home" }),
    state("guest", "http://app.test/login", [
      { sel: ".login", label: "Login", type: "button" },
    ], { title: "App — Login" }),
    state("user", "http://app.test/profile", [
      { sel: ".upload", label: "Upload Photo", type: "upload" },
      { sel: ".save", label: "Save", type: "button" },
    ], { title: "App — Profile" }),
    state("admin", "http://app.test/admin", [
      { sel: ".create", label: "Create User", type: "button" },
      { sel: ".chart", label: "Usage", type: "chart" },
    ], { title: "App — Admin" }),
  ];
  const statesById: Record<string, CaptureState> = {};
  for (const s of states) statesById[s.id] = s;

  const envelope = makeEnvelope({
    artifact: "raw_capture",
    artifactId: runId,
    runId,
    appUrl: "http://app.test/",
    roles: ["guest", "user", "admin"],
    sourceArtifacts: [],
    generatedAt: AT,
  });

  return {
    ...envelope,
    artifact: "raw_capture",
    config: { url: "http://app.test/" },
    counts: { states: states.length, edges: 0, requests: states.length, forms: 0, components: 8 },
    statesById,
    edges: [],
    perRolePartitions: {
      guest: states.filter((s) => s.role === "guest").map((s) => s.id),
      user: states.filter((s) => s.role === "user").map((s) => s.id),
      admin: states.filter((s) => s.role === "admin").map((s) => s.id),
    },
    telemetry: {
      pagesVisited: states.length,
      pagesVisitedIds: states.map((s) => s.id),
      pagesSkipped: [{ id: "PAGE:billing", reason: "Authentication Required" }],
      rolesCrawled: ["guest", "user", "admin"],
      statesObserved: ["populated", "offline"],
      statesNotObserved: ["session_expired", "maintenance"],
      hiddenRevealed: 4,
      lazySections: 2,
      formsFound: 3,
      loopsPrevented: 1,
      maxDepth: 3,
      pagesNotReachable: 1,
      authenticationProtected: 1,
      responsiveLayouts: ["mobile", "tablet", "desktop"],
    },
    explorationTechniqueTelemetry: { byPage: { home: tech(), admin: tech({ iframesSeen: 0 }) }, byRole: { guest: tech(), user: tech(), admin: tech() } },
    blockedItems: [
      { target: "http://app.test/checkout", reason: "Payment provider on a separate origin.", humanPointer: "Walk the payment step manually.", blockerType: "payment_gateway" },
      { target: "http://app.test/admin", reason: "Login wall required credentials.", humanPointer: "Sign in and explore.", blockerType: "auth_gated" },
    ],
  };
}

export const TEST_AT = AT;
