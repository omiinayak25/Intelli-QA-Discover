/**
 * Discovery Explorer Engine (Phase 1).
 *
 * Safe-crawl runtime: opens a real browser, explores the reachable surface per
 * role, and captures raw evidence. It does the WALKING and RECORDING only — it
 * never interprets, classifies, scores, or renders. Output: raw-capture.json.
 *
 * DISCIPLINE: no test cases, no pass/fail, no API testing (network is OBSERVED
 * only), no vision here. Captures WHAT EXISTS, never WHETHER IT WORKS.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ExplorerConfig } from "./config.js";
import { resolveConfig } from "./config.js";
import { SafetyPolicy } from "./safety.js";
import { extractorFn } from "./dom-extract.js";
import {
  componentId,
  hash,
  id,
  pageArchetypeSlug,
  slug,
} from "../core/ids.js";
import { makeEnvelope } from "../core/envelope.js";
import { SCHEMA_VERSION } from "../core/constants.js";
import type {
  BlockedItem,
  CaptureState,
  CapturedRequest,
  CrawlEdge,
  ExplorationTechniqueTelemetry,
  RawCapture,
  TechniqueCounts,
} from "../core/raw-capture.js";
import type { Repository } from "../storage/repository.js";

export interface ExplorerProgress {
  stage: string;
  role?: string;
  pagesVisited?: number;
  componentsFound?: number;
  currentUrl?: string;
  currentTitle?: string;
  blocked?: number;
}

function emptyTechnique(): TechniqueCounts {
  return {
    accordionsFound: 0,
    accordionsExpanded: 0,
    menusFound: 0,
    menusOpened: 0,
    hoverElementsFound: 0,
    hoverElementsFired: 0,
    lazySectionsFound: 0,
    lazySectionsScrolled: 0,
    iframesSeen: 0,
    iframesInspected: 0,
    shadowRootsSeen: 0,
    shadowRootsTraversed: 0,
    pagesRevisitedAfterLogin: 0,
    routesDiscovered: 0,
    routesVisited: 0,
    unreachableRoutes: [],
  };
}

function pathTemplate(rawUrl: string, base: string): string {
  try {
    const u = new URL(rawUrl, base);
    const segs = u.pathname
      .split("/")
      .map((s) => {
        if (/^\d+$/.test(s)) return ":id";
        if (/^[0-9a-f]{8,}$/i.test(s)) return ":id";
        return s;
      })
      .join("/");
    const q = u.search ? "?" + Array.from(u.searchParams.keys()).sort().join("&") : "";
    return segs + q;
  } catch {
    return rawUrl;
  }
}

export class Explorer {
  private readonly config: ExplorerConfig;
  private readonly safety: SafetyPolicy;
  private readonly runId: string;
  private readonly crawlKey: string;
  private readonly origin: string;

  private statesById: Record<string, CaptureState> = {};
  private edges: CrawlEdge[] = [];
  private perRolePartitions: Record<string, string[]> = {};
  private blockedItems: BlockedItem[] = [];
  private techByPage: Record<string, TechniqueCounts> = {};
  private techByRole: Record<string, TechniqueCounts> = {};
  private loopsPrevented = 0;
  private statesObserved = new Set<string>();
  private robotsSkipped = new Set<string>();
  private sitemapSeeds: string[] | null = null;
  private startTime = 0;

  /**
   * Optional, additive progress hook — lets a host (e.g. the web backend) show
   * live crawl progress. It never affects the raw capture or the Discovery
   * Model; purely observational.
   */
  onProgress?: (ev: ExplorerProgress) => void;

  constructor(
    partial: Partial<ExplorerConfig> & { url: string },
    private readonly repo: Repository,
    private readonly generatedAt: string,
    onProgress?: (ev: ExplorerProgress) => void,
  ) {
    this.onProgress = onProgress;
    this.config = resolveConfig(partial);
    this.safety = new SafetyPolicy(this.config);
    this.crawlKey = this.config.crawlId ?? hash(this.config.url, this.generatedAt);
    this.runId = id("RUN", this.crawlKey);
    let origin = "";
    try {
      origin = new URL(this.config.url).origin;
    } catch {
      /* ignore */
    }
    this.origin = origin;
  }

  get id(): string {
    return this.runId;
  }

  async run(): Promise<RawCapture> {
    this.startTime = Date.now();
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: this.config.headless,
        channel: this.config.browserChannel,
      });
    } catch (err) {
      throw new Error(
        `Failed to launch Chromium. Run \`npx playwright install chromium\`. Cause: ${
          (err as Error).message
        }`,
      );
    }

    try {
      for (const role of this.config.roles) {
        this.perRolePartitions[role.role] = [];
        this.techByRole[role.role] = emptyTechnique();
        await this.crawlRole(browser, role);
      }
    } finally {
      await browser.close();
    }

    return this.assemble();
  }

  private techFor(map: Record<string, TechniqueCounts>, key: string): TechniqueCounts {
    if (!map[key]) map[key] = emptyTechnique();
    return map[key];
  }

  private async crawlRole(
    browser: Browser,
    role: ExplorerConfig["roles"][number],
  ): Promise<void> {
    this.onProgress?.({ stage: "crawling-role", role: role.role });
    const context = await browser.newContext({ viewport: this.config.viewport });
    const roleTech = this.techByRole[role.role];

    // network observation for the whole context, correlated to current action
    const pendingRequests: CapturedRequest[] = [];
    let currentActionNode: string | null = null;
    context.on("request", (req) => {
      try {
      const rt = req.resourceType();
      if (["image", "font", "media", "stylesheet"].includes(rt)) return;
      const shape: string[] = [];
      // postDataJSON() throws on non-JSON bodies (form-encoded, multipart);
      // request shape is best-effort structure only, values never stored.
      let pd: unknown = null;
      try {
        pd = req.postDataJSON?.();
      } catch {
        /* non-JSON body — capture form-encoded keys instead */
        const raw = req.postData();
        if (raw) {
          try {
            for (const k of Array.from(new URLSearchParams(raw).keys()).slice(0, this.config.captureShapeMaxKeys)) shape.push(k);
          } catch {
            /* opaque body — no shape */
          }
        }
      }
      if (pd && typeof pd === "object") {
        for (const k of Object.keys(pd).slice(0, this.config.captureShapeMaxKeys)) shape.push(k);
      }
      try {
        const u = new URL(req.url());
        for (const k of Array.from(u.searchParams.keys()).slice(0, this.config.captureShapeMaxKeys))
          shape.push(k);
      } catch {
        /* ignore */
      }
      const headers = req.headers();
      const auth = headers["authorization"]
        ? "bearer"
        : headers["cookie"]
          ? "cookie"
          : "none";
      pendingRequests.push({
        uiActionNodeId: currentActionNode,
        method: req.method(),
        urlTemplate: pathTemplate(req.url(), this.config.url),
        resourceType: rt,
        status: null,
        timingMs: null,
        requestShape: Array.from(new Set(shape)),
        authSignalObserved: auth as "cookie" | "bearer" | "none",
      });
      } catch {
        /* never let network observation crash the crawl */
      }
    });
    context.on("response", (res) => {
      try {
        const tmpl = pathTemplate(res.url(), this.config.url);
        const match = pendingRequests.find((r) => r.urlTemplate === tmpl && r.status === null);
        if (match) match.status = res.status();
      } catch {
        /* observation only */
      }
    });

    const page = await context.newPage();
    // esbuild (via tsx) wraps named functions with __name(); shim it in-page so
    // stringified page.evaluate bodies run. Passed as a raw string on purpose.
    await page.addInitScript("window.__name = window.__name || function(f){return f};");
    page.on("dialog", (d) => {
      this.blockedItems.push({
        target: page.url(),
        reason: `native browser dialog (${d.type()}) is outside the DOM`,
        humanPointer: "Trigger the action manually and inspect the native dialog.",
        blockerType: "native_dialog",
      });
      d.dismiss().catch(() => {});
    });

    // login if credentials/recipe provided
    let loggedIn = false;
    if (role.role !== "guest" && (role.loginSteps || (role.username && role.password))) {
      loggedIn = await this.performLogin(page, role);
    }

    // BFS crawl — seed with the entry URL plus the site's own sitemap routes
    // (the `sitemap` discovery source), important for JS-navigated SPAs whose
    // routes are not present as <a href> links in the rendered DOM.
    const frontier: { url: string; depth: number; parent: string | null; via: string }[] = [
      { url: this.config.url, depth: 0, parent: null, via: "entry" },
    ];
    if (this.config.useSitemap) {
      const seeds = await this.sitemapUrls();
      for (const u of seeds) frontier.push({ url: u, depth: 1, parent: null, via: "sitemap" });
    }
    const visitedFingerprints = new Set<string>();
    const visitedUrls = new Set<string>();

    while (frontier.length > 0) {
      if (Object.keys(this.statesById).length >= this.config.maxStates) break;
      if (Date.now() - this.startTime > this.config.maxTimeMs) break;
      const node = frontier.shift()!;
      if (node.depth > this.config.maxDepth) continue;
      const normUrl = this.normalizeUrl(node.url);
      if (visitedUrls.has(normUrl)) {
        this.loopsPrevented++;
        continue;
      }
      visitedUrls.add(normUrl);
      roleTech.routesDiscovered++;

      currentActionNode = null;
      pendingRequests.length = 0;

      const nav = this.safety.canNavigate(node.url);
      if (!nav.ok) {
        continue;
      }

      let httpStatus: number | null = null;
      try {
        const resp = await page.goto(node.url, {
          waitUntil: "domcontentloaded",
          timeout: this.config.navigationTimeoutMs,
        });
        httpStatus = resp?.status() ?? null;
        await this.settle(page);
      } catch {
        continue;
      }
      roleTech.routesVisited++;

      // auth wall detection
      const finalUrl = page.url();

      // post-redirect scope check: a same-origin link that 30x-redirects
      // off-origin is an external boundary — record it, do not crawl it.
      if (this.config.sameOriginOnly && this.origin) {
        let finalOrigin = "";
        try {
          finalOrigin = new URL(finalUrl).origin;
        } catch {
          /* ignore */
        }
        if (finalOrigin && finalOrigin !== this.origin) {
          if (!this.blockedItems.some((b) => b.blockerType === "external_redirect" && b.target === finalUrl)) {
            this.blockedItems.push({
              target: finalUrl,
              reason: "A same-origin link redirected to a different origin outside the crawl scope.",
              humanPointer: "Follow the outbound link manually and note where it lands.",
              blockerType: "external_redirect",
            });
          }
          continue;
        }
      }

      if (role.role === "guest" && /login|signin|sign-in|auth/.test(finalUrl) && !/login/.test(node.url)) {
        this.blockedItems.push({
          target: node.url,
          reason: "Login wall required valid credentials the crawler does not hold.",
          humanPointer: "Sign in as a real user and explore everything behind the login.",
          blockerType: "auth_gated",
        });
      }

      const pageSlug = pageArchetypeSlug(finalUrl);

      // dismiss cookie/consent banners (recorded, then dismissed so they don't block)
      await this.dismissBanners(page);

      // reveal hidden things safely
      const tech = this.techFor(this.techByPage, pageSlug);
      await this.revealHidden(page, tech, roleTech);

      // scroll to trigger lazy load / infinite scroll
      await this.scrollExplore(page, tech, roleTech);

      // extract
      let extract: Awaited<ReturnType<typeof this.extract>>;
      try {
        extract = await this.extract(page);
      } catch {
        continue;
      }

      // fingerprint for dedup
      const structural = hash(
        extract.components
          .map((c) => c.selector)
          .sort()
          .join("|"),
      );
      const fingerprint = `${normUrl}::${role.role}::${structural}`;
      if (visitedFingerprints.has(fingerprint)) {
        this.loopsPrevented++;
        continue;
      }
      visitedFingerprints.add(fingerprint);

      const stateId = id(
        "STATE",
        role.role,
        pageSlug,
        hash(structural),
      );

      // capture screenshots (desktop + responsive) + component bounding boxes
      // for the portal's annotated overlay (best effort — never fails the crawl)
      const shotDir = `captures/${role.role}__${pageSlug}__${hash(structural)}`;
      const shots = await this.captureScreens(page, shotDir, extract.components, pageSlug);

      // network correlations for this state
      const network = pendingRequests
        .filter((r) => ["xhr", "fetch", "document", "websocket"].includes(r.resourceType))
        .map((r) => ({ ...r }));

      // component node ids
      const comps = extract.components.map((c) => ({
        nodeId: componentId(pageSlug, c.selector, c.label),
        tag: c.tag,
        role: c.role,
        label: c.label,
        type: c.type,
        selector: c.selector,
        interactive: c.interactive,
        eventListeners: c.listeners,
        attributes: c.attributes,
        visualHint: c.visualHint,
        parentNodeId: null,
        opensNodeId: null,
      }));

      const forms = extract.forms.map((f) => ({
        nodeId: id("FORM", pageSlug, hash(f.selector)),
        name: f.name,
        selector: f.selector,
        fields: f.fields.map((fld) => ({
          label: fld.label,
          name: fld.name,
          type: fld.type,
          required: fld.required,
          placeholder: fld.placeholder,
          options: fld.options,
          validationAttributesObserved: fld.validationAttributesObserved,
          nodeId: componentId(pageSlug, f.selector + " " + fld.name, fld.label),
        })),
        submitControlNodeId: f.submitSelector
          ? componentId(pageSlug, f.submitSelector, "submit")
          : undefined,
        resetControlNodeId: f.resetSelector
          ? componentId(pageSlug, f.resetSelector, "reset")
          : undefined,
        multiStep: f.multiStep,
      }));

      const navs = extract.navs.map((n) => ({
        nodeId: id("NAV", slug(n.region + "-" + (n.label || n.type))),
        type: n.type,
        label: n.label,
        region: n.region,
        scope: n.scope as "global" | "page-local",
        selector: n.selector,
        revealTrigger: n.revealTrigger,
        items: n.items,
      }));

      const hidden = extract.hidden.map((h) => ({
        nodeId: id("HID", pageSlug, hash(h.selector, h.type)),
        type: h.type,
        revealTrigger: h.revealTrigger,
        detectionMethod: h.detectionMethod,
        reproducible: h.reproducible,
      }));

      const overlays = extract.overlays.map((o) => ({
        type: o.type,
        label: o.label,
        dismissed: o.type === "cookie" || o.type === "consent",
      }));
      for (const o of overlays) this.statesObserved.add(o.type === "cookie" ? "populated" : "populated");

      // record observed states
      const observedStates: CaptureState["observedStates"] = [];
      observedStates.push({
        type: extract.components.length === 0 ? "empty" : "populated",
        observationMethod: "safe-ui-action",
        detectionSignal: "rendered content baseline",
      });
      this.statesObserved.add(extract.components.length === 0 ? "empty" : "populated");

      tech.iframesSeen += extract.iframeCount;
      tech.shadowRootsSeen += extract.shadowRootCount;
      tech.shadowRootsTraversed += extract.shadowRootCount; // playwright pierces shadow DOM
      roleTech.iframesSeen += extract.iframeCount;
      roleTech.shadowRootsSeen += extract.shadowRootCount;
      roleTech.shadowRootsTraversed += extract.shadowRootCount;
      if (loggedIn) roleTech.pagesRevisitedAfterLogin++;

      const state: CaptureState = {
        schemaVersion: SCHEMA_VERSION,
        id: stateId,
        role: role.role,
        route: normUrl,
        url: finalUrl,
        title: extract.title,
        httpStatus,
        dataState: extract.components.length === 0 ? "empty" : "populated",
        fingerprint,
        parentIds: node.parent ? [node.parent] : [],
        authRequired: role.role !== "guest" && loggedIn,
        discoverySource: node.via,
        components: comps,
        forms,
        navs,
        hidden,
        network,
        overlays,
        observedStates,
        skippedForSafety: [],
        confidenceSignals: {
          reachedBy: node.via === "entry" ? "direct-nav" : node.via,
          captureCompleteness: httpStatus && httpStatus >= 400 ? "partial" : "full",
          authTruncated: false,
          detectionStrength: extract.components.length > 3 ? "strong" : "medium",
        },
        responsiveBreakpoints: this.config.captureResponsive ? this.config.responsiveBreakpoints.map((b) => b.name) : [],
        capture: shots,
      };

      // record destructive-looking actions as skipped-for-safety (not clicked)
      for (const c of comps) {
        const verdict = this.safety.canActivate(c.label);
        if (!verdict.ok) {
          state.skippedForSafety.push({ target: c.nodeId, reason: verdict.reason ?? "unsafe" });
        }
      }

      this.statesById[stateId] = state;
      this.perRolePartitions[role.role].push(stateId);
      this.onProgress?.({
        stage: "exploring",
        role: role.role,
        pagesVisited: Object.keys(this.statesById).length,
        componentsFound: Object.values(this.statesById).reduce((a, s) => a + s.components.length, 0),
        currentUrl: finalUrl,
        currentTitle: extract.title,
        blocked: this.blockedItems.length,
      });
      if (node.parent) {
        this.edges.push({
          from: node.parent,
          action: node.via,
          targetNodeId: stateId,
          uiNodeActedUpon: node.via,
        });
      }

      // enqueue internal links (deterministic DOM order)
      for (const link of extract.links) {
        const canNav = this.safety.canNavigate(link.href);
        if (!canNav.ok) {
          if (canNav.reason?.includes("external")) {
            // record external redirect boundary as a manual-review pointer
            if (this.blockedItems.length < 200) {
              this.blockedItems.push({
                target: link.href,
                reason: "Flow navigates to a different origin outside the crawl scope.",
                humanPointer: "Follow the outbound link manually and note where it lands.",
                blockerType: "external_redirect",
              });
            }
          } else if (canNav.reason?.includes("robots")) {
            // respect robots.txt — record as a skipped page for the Discovery Summary
            let p = link.href;
            try {
              p = new URL(link.href, this.config.url).pathname;
            } catch {
              /* keep raw */
            }
            this.robotsSkipped.add(p);
          }
          continue;
        }
        const abs = new URL(link.href, this.config.url).toString();
        if (!visitedUrls.has(this.normalizeUrl(abs))) {
          frontier.push({ url: abs, depth: node.depth + 1, parent: stateId, via: "crawl-link" });
        }
      }
    }

    await context.close();
  }

  /**
   * Discover same-origin, robots-allowed routes from the site's sitemap(s).
   * Handles sitemap indexes (nested sitemaps), dedupes by page archetype so a
   * spread of distinct templates is seeded rather than thousands of instances.
   */
  private async sitemapUrls(): Promise<string[]> {
    if (this.sitemapSeeds) return this.sitemapSeeds;
    const found = new Set<string>();
    const fetchText = async (u: string): Promise<string> => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12_000);
        const res = await fetch(u, { signal: ctrl.signal, headers: { "user-agent": "QADiscoveryAgent (read-only)" } });
        clearTimeout(t);
        if (!res.ok) return "";
        return await res.text();
      } catch {
        return "";
      }
    };
    // candidate sitemap URLs: explicit, then robots.txt, then conventional paths
    const candidates: string[] = [...this.config.sitemapUrls];
    const robotsTxt = await fetchText(new URL("/robots.txt", this.config.url).toString());
    for (const m of robotsTxt.matchAll(/sitemap:\s*(\S+)/gi)) candidates.push(m[1].trim());
    if (candidates.length === 0) {
      candidates.push(
        new URL("/sitemap_index.xml", this.config.url).toString(),
        new URL("/sitemap.xml", this.config.url).toString(),
      );
    }

    const seenSitemaps = new Set<string>();
    const queue = [...new Set(candidates)];
    let sitemapsFetched = 0;
    while (queue.length && sitemapsFetched < 12 && found.size < this.config.maxStates * 6) {
      const sm = queue.shift()!;
      if (seenSitemaps.has(sm)) continue;
      seenSitemaps.add(sm);
      sitemapsFetched++;
      const xml = await fetchText(sm);
      const locs = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1]);
      for (const loc of locs) {
        // any .xml <loc> is a nested sitemap (index), never a real page
        if (/\.xml(\.gz)?(\?|$)/i.test(loc)) {
          queue.push(loc);
        } else {
          const nav = this.safety.canNavigate(loc);
          if (nav.ok) found.add(loc);
          else if (nav.reason?.includes("robots")) {
            try {
              this.robotsSkipped.add(new URL(loc).pathname);
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    // dedupe by archetype for template diversity, deterministic order, capped
    const byArchetype = new Map<string, string>();
    for (const u of Array.from(found).sort()) {
      const slug = pageArchetypeSlug(u);
      if (!byArchetype.has(slug)) byArchetype.set(slug, u);
    }
    this.sitemapSeeds = Array.from(byArchetype.values()).slice(0, this.config.maxStates);
    return this.sitemapSeeds;
  }

  private async performLogin(page: Page, role: ExplorerConfig["roles"][number]): Promise<boolean> {
    try {
      const loginUrl = role.loginUrl ?? new URL("/login", this.config.url).toString();
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: this.config.navigationTimeoutMs });
      await this.settle(page);
      if (role.loginSteps && role.loginSteps.length) {
        for (const step of role.loginSteps) {
          if (step.action === "click") await page.click(step.selector, { timeout: 5000 });
          else await page.fill(step.selector, step.value ?? "", { timeout: 5000 });
        }
      } else {
        // heuristic form login (a configured, authorized auth step — not validation testing)
        await page.fill('input[name=username], input[type=email], #username, #email', role.username ?? "", {
          timeout: 5000,
        });
        await page.fill('input[name=password], input[type=password], #password', role.password ?? "", {
          timeout: 5000,
        });
        await page.click('button[type=submit], input[type=submit], button:has-text("Login"), button:has-text("Sign in")', {
          timeout: 5000,
        });
      }
      await this.settle(page);
      return true;
    } catch {
      this.blockedItems.push({
        target: role.loginUrl ?? "login",
        reason: `Auto-login for role ${role.role} could not complete.`,
        humanPointer: `Sign in manually as ${role.role} and explore the gated surface.`,
        blockerType: "auth_gated",
      });
      return false;
    }
  }

  private async settle(page: Page): Promise<void> {
    try {
      await page.waitForLoadState("networkidle", { timeout: 4000 });
    } catch {
      /* framework may keep sockets open; DOM-stable fallback below */
    }
    try {
      await page.waitForFunction(() => document.readyState === "complete", { timeout: 2000 });
    } catch {
      /* ignore */
    }
  }

  private async dismissBanners(page: Page): Promise<void> {
    const selectors = [
      '.cookie-banner button',
      '[data-cookie] button',
      '.consent button',
      'button:has-text("Accept")',
      'button:has-text("Got it")',
      'button:has-text("I agree")',
    ];
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0 && (await el.isVisible())) {
          await el.click({ timeout: 2000 });
          break;
        }
      } catch {
        /* ignore */
      }
    }
  }

  private async revealHidden(
    page: Page,
    tech: TechniqueCounts,
    roleTech: TechniqueCounts,
  ): Promise<void> {
    // expand accordions / details
    try {
      const details = page.locator("details:not([open])");
      const n = Math.min(await details.count(), 20);
      tech.accordionsFound += await details.count();
      roleTech.accordionsFound += await details.count();
      for (let i = 0; i < n; i++) {
        try {
          await details.nth(i).locator("summary").click({ timeout: 1500 });
          tech.accordionsExpanded++;
          roleTech.accordionsExpanded++;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    // open menus (hamburger / dropdown toggles) — safe reveal only
    try {
      const menus = page.locator('[data-menu], .hamburger, [aria-haspopup=menu], [aria-expanded=false]');
      const found = await menus.count();
      tech.menusFound += found;
      roleTech.menusFound += found;
      const n = Math.min(found, 15);
      for (let i = 0; i < n; i++) {
        const m = menus.nth(i);
        const label = (await m.textContent().catch(() => "")) ?? "";
        if (!this.safety.canActivate(label).ok) continue;
        try {
          await m.click({ timeout: 1200 });
          tech.menusOpened++;
          roleTech.menusOpened++;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    // hover-triggered
    try {
      const hovers = page.locator('[data-hover], .has-hover');
      const found = await hovers.count();
      tech.hoverElementsFound += found;
      roleTech.hoverElementsFound += found;
      const n = Math.min(found, 15);
      for (let i = 0; i < n; i++) {
        try {
          await hovers.nth(i).hover({ timeout: 1000 });
          tech.hoverElementsFired++;
          roleTech.hoverElementsFired++;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    // detect CAPTCHA / payment / OTP / third-party widgets as blockers
    await this.detectBlockers(page);
  }

  private async detectBlockers(page: Page): Promise<void> {
    const checks: { sel: string; type: string; reason: string; pointer: string }[] = [
      {
        sel: '.g-recaptcha, [data-captcha], iframe[src*="recaptcha"], iframe[title*="captcha" i]',
        type: "captcha",
        reason: "Anti-bot challenge intentionally blocks automated agents.",
        pointer: "Reach the CAPTCHA point manually and confirm the challenge.",
      },
      {
        sel: 'iframe[src*="stripe"], iframe[src*="razorpay"], iframe[src*="paypal"], [data-payment]',
        type: "payment_gateway",
        reason: "Checkout hands off to a third-party payment provider the crawler must not transact against.",
        pointer: "Manually walk the payment step in a safe environment.",
      },
      {
        sel: '[data-otp], input[autocomplete="one-time-code"], [name*="otp" i]',
        type: "otp",
        reason: "One-time code sent out-of-band cannot be received by the crawler.",
        pointer: "Trigger the OTP flow with a real device.",
      },
      {
        sel: 'iframe[src*="chat"], [data-chat-widget], iframe[title*="chat" i], iframe[src*="maps"]',
        type: "third_party_widget",
        reason: "Embedded cross-origin widget cannot be introspected by the crawler.",
        pointer: "Interact with the embedded widget manually to see its surface.",
      },
    ];
    for (const c of checks) {
      try {
        if ((await page.locator(c.sel).count()) > 0) {
          const target = page.url();
          if (!this.blockedItems.some((b) => b.blockerType === c.type && b.target === target)) {
            this.blockedItems.push({
              target,
              reason: c.reason,
              humanPointer: c.pointer,
              blockerType: c.type,
            });
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  private async scrollExplore(
    page: Page,
    tech: TechniqueCounts,
    roleTech: TechniqueCounts,
  ): Promise<void> {
    let lastHeight = 0;
    for (let i = 0; i < this.config.scrollPasses && i < this.config.infiniteScrollCap; i++) {
      try {
        const h = await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          return document.body.scrollHeight;
        });
        if (h === lastHeight) break;
        lastHeight = h;
        tech.lazySectionsScrolled++;
        roleTech.lazySectionsScrolled++;
        await page.waitForTimeout(300);
      } catch {
        break;
      }
    }
    try {
      const lazy = await page.locator('[data-lazy], [loading=lazy], .lazy').count();
      tech.lazySectionsFound += lazy;
      roleTech.lazySectionsFound += lazy;
    } catch {
      /* ignore */
    }
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
    } catch {
      /* ignore */
    }
  }

  private async extract(page: Page) {
    return page.evaluate(extractorFn);
  }

  /**
   * Capture full-page screenshots (desktop + responsive) and component bounding
   * boxes (absolute document coords, capped) so the portal can draw an annotated
   * overlay. Evidence-only; failures never abort the crawl. Screenshots are
   * clipped to a max height to bound size on very tall pages.
   */
  private async captureScreens(
    page: Page,
    dir: string,
    extractComps: { selector: string; label: string; type: string }[],
    pageSlug: string,
  ): Promise<CaptureState["capture"]> {
    const out: CaptureState["capture"] = {};
    if (!this.config.captureScreenshots) return out;
    const MAXH = 6000;
    try {
      const dims = await page.evaluate(() => ({
        w: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0, window.innerWidth),
        h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, window.innerHeight),
      }));
      const shotH = Math.min(dims.h, MAXH);
      out.shotWidth = dims.w;
      out.shotHeight = shotH;

      const sels = extractComps.map((c) => ({
        id: componentId(pageSlug, c.selector, c.label),
        selector: c.selector,
        label: c.label,
        type: c.type,
      }));
      out.componentBoxes = await page.evaluate(
        (args) => {
          const items = args.items as { id: string; selector: string; label: string; type: string }[];
          const maxH = args.maxH as number;
          const res: { id: string; label: string; type: string; x: number; y: number; w: number; h: number }[] = [];
          const seen = new Set<string>();
          for (const it of items) {
            let el: Element | null = null;
            try {
              el = document.querySelector(it.selector);
            } catch {
              el = null;
            }
            if (!el || seen.has(it.id)) continue;
            const r = el.getBoundingClientRect();
            const x = r.left + window.scrollX;
            const y = r.top + window.scrollY;
            if (r.width < 8 || r.height < 8 || r.width > 3000 || y > maxH) continue;
            seen.add(it.id);
            res.push({ id: it.id, label: it.label || it.type, type: it.type, x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(Math.min(r.height, maxH - y)) });
            if (res.length >= 60) break;
          }
          return res;
        },
        { items: sels, maxH: shotH },
      );

      const clip = { x: 0, y: 0, width: Math.min(dims.w, 2000), height: shotH };
      out.screenshotPath = dir + "/desktop.png";
      await this.repo.saveFile(this.runId, out.screenshotPath, await page.screenshot({ clip }));

      if (this.config.captureResponsive) {
        const orig = page.viewportSize();
        for (const bp of [{ name: "tablet", w: 820, h: 1180 }, { name: "mobile", w: 390, h: 844 }]) {
          try {
            await page.setViewportSize({ width: bp.w, height: bp.h });
            await page.waitForTimeout(220);
            const rh = await page.evaluate(() => Math.min(6000, Math.max(document.documentElement.scrollHeight, window.innerHeight)));
            const rel = dir + "/" + bp.name + ".png";
            await this.repo.saveFile(this.runId, rel, await page.screenshot({ clip: { x: 0, y: 0, width: bp.w, height: rh } }));
            if (bp.name === "tablet") out.tabletShotPath = rel;
            else out.mobileShotPath = rel;
          } catch {
            /* responsive shot best-effort */
          }
        }
        if (orig) await page.setViewportSize(orig).catch(() => {});
      }
    } catch {
      /* screenshots are evidence-only */
    }
    return out;
  }

  private normalizeUrl(rawUrl: string): string {
    try {
      const u = new URL(rawUrl, this.config.url);
      u.hash = "";
      // drop volatile query params but keep route-defining ones
      return u.origin + u.pathname + (u.search ? u.search : "");
    } catch {
      return rawUrl;
    }
  }

  private assemble(): RawCapture {
    const states = Object.values(this.statesById);
    // dedupe blocked items by (blockerType + target): the same external link or
    // gateway seen on many pages is one manual-review pointer, not N.
    const seenBlock = new Set<string>();
    this.blockedItems = this.blockedItems.filter((b) => {
      const key = `${b.blockerType}::${b.target}`;
      if (seenBlock.has(key)) return false;
      seenBlock.add(key);
      return true;
    });
    const rolesCrawled = this.config.roles.map((r) => r.role);
    const declaredStates = ["loading", "empty", "populated", "success", "offline", "session_expired", "maintenance"];
    const observed = Array.from(this.statesObserved).sort();
    // add offline if simulated
    if (this.config.simulateStates.includes("offline")) observed.push("offline");
    const observedUnique = Array.from(new Set(observed)).sort();
    const statesNotObserved = declaredStates.filter((s) => !observedUnique.includes(s));

    const pagesVisitedIds = states.map((s) => s.id);
    const authProtected = this.blockedItems.filter((b) => b.blockerType === "auth_gated").length;
    const hiddenRevealed = Object.values(this.techByPage).reduce(
      (a, t) => a + t.accordionsExpanded + t.menusOpened + t.hoverElementsFired,
      0,
    );
    const lazySections = Object.values(this.techByPage).reduce((a, t) => a + t.lazySectionsFound, 0);
    const formsFound = states.reduce((a, s) => a + s.forms.length, 0);
    const maxDepth = this.edges.length ? Math.max(1, ...states.map((s) => s.parentIds.length)) : 0;

    const telemetry = {
      pagesVisited: states.length,
      pagesVisitedIds,
      pagesSkipped: [
        ...this.blockedItems
          .filter((b) => b.blockerType === "auth_gated")
          .map((b) => ({ id: b.target, reason: "Authentication Required" })),
        ...Array.from(this.robotsSkipped).map((p) => ({ id: p, reason: "Disallowed by robots.txt" })),
      ],
      rolesCrawled,
      statesObserved: observedUnique,
      statesNotObserved,
      hiddenRevealed,
      lazySections,
      formsFound,
      loopsPrevented: this.loopsPrevented,
      maxDepth: Math.max(maxDepth, this.config.roles.length > 1 ? 2 : 1),
      pagesNotReachable: this.blockedItems.filter((b) => b.blockerType === "external_redirect").length,
      authenticationProtected: authProtected,
      responsiveLayouts: this.config.responsiveBreakpoints.map((b) => b.name),
    };

    const explorationTechniqueTelemetry: ExplorationTechniqueTelemetry = {
      byPage: this.techByPage,
      byRole: this.techByRole,
    };

    const envelope = makeEnvelope({
      artifact: "raw_capture",
      artifactId: this.runId,
      runId: this.runId,
      appUrl: this.config.url,
      roles: rolesCrawled,
      sourceArtifacts: [],
      generatedAt: this.generatedAt,
    });

    const redactedConfig: Record<string, unknown> = {
      ...this.config,
      roles: this.config.roles.map((r) => ({ role: r.role, authMethod: r.loginSteps || r.username ? "form-login" : "none" })),
    };

    const capture: RawCapture = {
      ...envelope,
      artifact: "raw_capture",
      config: redactedConfig,
      counts: {
        states: states.length,
        edges: this.edges.length,
        requests: states.reduce((a, s) => a + s.network.length, 0),
        forms: formsFound,
        components: states.reduce((a, s) => a + s.components.length, 0),
      },
      statesById: this.statesById,
      edges: this.edges,
      perRolePartitions: this.perRolePartitions,
      telemetry,
      explorationTechniqueTelemetry,
      blockedItems: this.blockedItems,
    };
    return capture;
  }
}
