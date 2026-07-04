/**
 * Live Browser Mode — drives a real Playwright browser on demand so a tester can
 * click a discovered component and see it opened, scrolled to, and highlighted on
 * the actual website, with a live inspector. Read-only: it navigates, scrolls,
 * highlights, and inspects — it never clicks destructive actions or submits.
 *
 * Reuses the Discovery Model (selectors, page sample URLs, bounding boxes); it
 * does not re-crawl. Robust location: CSS → ARIA → text → stored bounding box.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { FILENAMES } from "../core/constants.js";
import type { DiscoveryStore } from "./store.js";

interface Session {
  context: BrowserContext;
  page: Page;
  currentUrl: string;
  lastUsed: number;
}

export interface LiveResult {
  sessionId: string;
  url: string;
  found: boolean;
  strategy: string;
  inspect: any;
  screenshot: string; // data URL
  currentUrl: string;
}

const IDLE_MS = 4 * 60 * 1000;

export class LiveBrowser {
  private browser: Browser | null = null;
  private sessions = new Map<string, Session>();

  constructor(private readonly store: DiscoveryStore) {
    const t = setInterval(() => this.sweep(), 30_000);
    (t as any).unref?.();
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  private async session(id: string): Promise<Session> {
    const existing = this.sessions.get(id);
    if (existing && !existing.page.isClosed()) { existing.lastUsed = Date.now(); return existing; }
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript("window.__name = window.__name || function(f){return f};");
    const s: Session = { context, page, currentUrl: "", lastUsed: Date.now() };
    this.sessions.set(id, s);
    return s;
  }

  async close(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (s) { try { await s.context.close(); } catch {} this.sessions.delete(id); }
  }

  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const [id, s] of this.sessions) if (now - s.lastUsed > IDLE_MS) await this.close(id);
  }

  /** Navigate to a component's page, locate + scroll + highlight it, return a live shot + inspect data. */
  async openComponent(sessionId: string, runId: string, componentId: string): Promise<LiveResult> {
    const model = await this.store.loadArtifact<any>(runId, FILENAMES.discoveryModelJson);
    const comp = model.components.find((c: any) => c.id === componentId);
    if (!comp) throw new Error("component not found in model");
    const pageItem = model.pages.find((p: any) => p.id === comp.page);
    const url = pageItem?.sampleUrls?.[0] || model.appUrl;

    let box: any = null;
    try {
      const raw = await this.store.loadArtifact<any>(runId, FILENAMES.rawCapture);
      for (const st of Object.values(raw.statesById) as any[]) {
        const b = (st.capture?.componentBoxes || []).find((x: any) => x.id === componentId);
        if (b) { box = b; break; }
      }
    } catch { /* boxes optional */ }

    const s = await this.session(sessionId);
    if (s.currentUrl !== url) {
      try { await s.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }); } catch { /* best effort */ }
      s.currentUrl = url;
      await s.page.waitForTimeout(700);
    }
    const located = await this.locateHighlight(s.page, { selector: comp.selector, label: comp.label, aria: comp.ariaRole, box });
    const shot = await s.page.screenshot({ type: "jpeg", quality: 68 }).catch(() => Buffer.from(""));
    return {
      sessionId, url, found: located.found, strategy: located.strategy,
      inspect: { ...located.inspect, businessFunction: comp.businessFunction, inferredPurpose: comp.inferredPurpose, type: comp.type, label: comp.label },
      screenshot: shot.length ? "data:image/jpeg;base64," + shot.toString("base64") : "",
      currentUrl: s.page.url(),
    };
  }

  /** Re-shoot the current session page (for a live-refresh poll). */
  async frame(sessionId: string): Promise<string> {
    const s = this.sessions.get(sessionId);
    if (!s || s.page.isClosed()) return "";
    s.lastUsed = Date.now();
    const shot = await s.page.screenshot({ type: "jpeg", quality: 60 }).catch(() => Buffer.from(""));
    return shot.length ? "data:image/jpeg;base64," + shot.toString("base64") : "";
  }

  private async locateHighlight(page: Page, args: { selector: string; label: string; aria?: string; box: any }) {
    return page.evaluate((a: { selector: string; label: string; aria?: string; box: any }) => {
      const OLD = document.getElementById("__iqad_hl");
      if (OLD) OLD.remove();

      function xpathOf(el: Element): string {
        const parts: string[] = [];
        let node: Element | null = el;
        while (node && node.nodeType === 1 && node !== document.documentElement) {
          let i = 1;
          let sib = node.previousElementSibling;
          while (sib) { if (sib.nodeName === node.nodeName) i++; sib = sib.previousElementSibling; }
          parts.unshift(node.nodeName.toLowerCase() + "[" + i + "]");
          node = node.parentElement;
        }
        return "/html/" + parts.join("/");
      }
      function overlay(rect: { left: number; top: number; width: number; height: number }, fixed: boolean) {
        const o = document.createElement("div");
        o.id = "__iqad_hl";
        o.style.cssText =
          "position:" + (fixed ? "fixed" : "absolute") + ";z-index:2147483647;pointer-events:none;" +
          "border:3px solid #5b8cff;border-radius:4px;box-shadow:0 0 0 3px rgba(91,140,255,.35),0 0 0 9999px rgba(9,13,20,.30);" +
          "left:" + rect.left + "px;top:" + rect.top + "px;width:" + rect.width + "px;height:" + rect.height + "px;transition:all .15s;";
        document.body.appendChild(o);
      }
      function inspectOf(el: Element, r: DOMRect) {
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          id: (el as HTMLElement).id || null,
          classes: (el.getAttribute("class") || "").slice(0, 120),
          xpath: xpathOf(el),
          ariaRole: el.getAttribute("role") || null,
          ariaLabel: el.getAttribute("aria-label") || null,
          text: (el.textContent || "").trim().slice(0, 120),
          boundingBox: { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
          styles: { color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize, display: cs.display },
        };
      }

      let el: Element | null = null;
      let strategy = "none";
      // 1) CSS selector
      try { el = document.querySelector(a.selector); if (el) strategy = "css"; } catch { el = null; }
      // 2) ARIA role + name
      if (!el && a.aria) {
        const cand = Array.from(document.querySelectorAll('[role="' + a.aria + '"]'))
          .find((e) => ((e.getAttribute("aria-label") || e.textContent || "").trim().toLowerCase().includes((a.label || "").toLowerCase())));
        if (cand) { el = cand; strategy = "aria"; }
      }
      // 3) exact text
      if (!el && a.label && a.label.length > 1) {
        const cands = Array.from(document.querySelectorAll("a,button,[role],input,label,h1,h2,h3,h4,span,li,div"))
          .filter((e) => (e.textContent || "").trim() === a.label && (e as HTMLElement).offsetParent !== null);
        if (cands.length) { el = cands[0]; strategy = "text"; }
      }

      if (el) {
        (el as HTMLElement).scrollIntoView({ block: "center", inline: "center" });
        const r = el.getBoundingClientRect();
        overlay({ left: r.left, top: r.top, width: Math.max(r.width, 8), height: Math.max(r.height, 8) }, true);
        return { found: true, strategy, inspect: inspectOf(el, r) };
      }
      // 4) stored bounding box (always available if captured) — highlight the region
      if (a.box) {
        window.scrollTo(0, Math.max(0, a.box.y - 220));
        overlay({ left: a.box.x, top: a.box.y, width: a.box.w, height: a.box.h }, false);
        return { found: true, strategy: "box", inspect: { boundingBox: a.box, note: "Located by stored position (selector did not resolve on the live page)." } };
      }
      return { found: false, strategy: "none", inspect: {} };
    }, args);
  }
}
