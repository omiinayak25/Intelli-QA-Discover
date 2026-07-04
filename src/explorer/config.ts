/**
 * Explorer configuration — a single typed config object with documented
 * defaults, so a bare `{ url }` works end-to-end.
 */

export interface RoleCredential {
  role: string; // stored lowercase/slug
  username?: string;
  password?: string;
  loginUrl?: string;
  /** Login recipe: ordered [selector, value] fill steps then a submit selector. */
  loginSteps?: { selector: string; value?: string; action?: "fill" | "click" }[];
}

export interface ExplorerConfig {
  url: string;
  crawlId?: string;
  headless: boolean;
  browserChannel?: string;
  viewport: { width: number; height: number };
  responsiveBreakpoints: { name: string; width: number; height: number }[];
  roles: RoleCredential[];
  allowList: string[]; // regex over action text + url
  denyList: string[]; // regex over action text + url
  maxDepth: number;
  maxStates: number;
  maxTimeMs: number;
  perPageActionBudget: number;
  navigationTimeoutMs: number;
  scrollPasses: number;
  infiniteScrollCap: number;
  sameOriginOnly: boolean;
  /** robots.txt Disallow patterns (path globs, `*`/`$` supported) — respected. */
  robotsDisallow: string[];
  /** Seed the frontier from the site's own sitemap(s) — the `sitemap` source. */
  useSitemap: boolean;
  /** Explicit sitemap URLs; if empty, robots.txt + /sitemap(_index).xml are tried. */
  sitemapUrls: string[];
  captureShapeMaxKeys: number;
  simulateStates: string[]; // e.g. ["offline"]
  /** Capture full-page screenshots + component bounding boxes for the portal. */
  captureScreenshots: boolean;
  /** Also capture tablet + mobile full-page screenshots (reflow of loaded page). */
  captureResponsive: boolean;
  outputDir: string;
  resume: boolean;
}

/** Default deny-list: destructive/irreversible action text. Never triggered. */
export const DEFAULT_DENY_LIST = [
  "\\bdelete\\b",
  "\\bremove\\b",
  "\\bdeactivate\\b",
  "\\bcancel\\b",
  "\\bpay\\b",
  "\\bbuy\\b",
  "\\bplace\\s+order\\b",
  "\\bconfirm\\s+purchase\\b",
  "\\bcheckout\\b",
  "\\bsend\\b",
  "\\bsubmit\\s+order\\b",
  "\\blogout\\b",
  "\\bsign\\s*out\\b",
  "\\bunsubscribe\\b",
  "\\bpurchase\\b",
];

export function resolveConfig(partial: Partial<ExplorerConfig> & { url: string }): ExplorerConfig {
  return {
    url: partial.url,
    crawlId: partial.crawlId,
    headless: partial.headless ?? true,
    browserChannel: partial.browserChannel,
    viewport: partial.viewport ?? { width: 1280, height: 900 },
    responsiveBreakpoints:
      partial.responsiveBreakpoints ?? [
        { name: "mobile", width: 390, height: 844 },
        { name: "tablet", width: 820, height: 1180 },
        { name: "desktop", width: 1280, height: 900 },
      ],
    roles: partial.roles ?? [{ role: "guest" }],
    allowList: partial.allowList ?? [],
    denyList: partial.denyList ?? DEFAULT_DENY_LIST,
    maxDepth: partial.maxDepth ?? 6,
    maxStates: partial.maxStates ?? 200,
    maxTimeMs: partial.maxTimeMs ?? 120_000,
    perPageActionBudget: partial.perPageActionBudget ?? 40,
    navigationTimeoutMs: partial.navigationTimeoutMs ?? 20_000,
    scrollPasses: partial.scrollPasses ?? 6,
    infiniteScrollCap: partial.infiniteScrollCap ?? 10,
    sameOriginOnly: partial.sameOriginOnly ?? true,
    robotsDisallow: partial.robotsDisallow ?? [],
    useSitemap: partial.useSitemap ?? true,
    sitemapUrls: partial.sitemapUrls ?? [],
    captureShapeMaxKeys: partial.captureShapeMaxKeys ?? 40,
    simulateStates: partial.simulateStates ?? ["offline"],
    captureScreenshots: partial.captureScreenshots ?? true,
    captureResponsive: partial.captureResponsive ?? true,
    outputDir: partial.outputDir ?? "runs",
    resume: partial.resume ?? false,
  };
}
