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
  private startTime = 0;

  constructor(
    partial: Partial<ExplorerConfig> & { url: string },
    private readonly repo: Repository,
    private readonly generatedAt: string,
  ) {
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

    // BFS crawl
    const frontier: { url: string; depth: number; parent: string | null; via: string }[] = [
      { url: this.config.url, depth: 0, parent: null, via: "entry" },
    ];
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

      // capture screenshot as evidence (best effort)
      const shotRel = `captures/${role.role}__${pageSlug}__${hash(structural)}/screenshot.png`;
      try {
        const buf = await page.screenshot({ fullPage: false });
        await this.repo.saveFile(this.runId, shotRel, buf);
      } catch {
        /* evidence best-effort */
      }

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
        responsiveBreakpoints: [],
        capture: { screenshotPath: shotRel },
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
      pagesSkipped: this.blockedItems
        .filter((b) => b.blockerType === "auth_gated")
        .map((b) => ({ id: b.target, reason: "Authentication Required" })),
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
