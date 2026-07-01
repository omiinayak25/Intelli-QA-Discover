/**
 * Safe-by-default crawl policy. Crawling is read-only exploration: reveal what
 * exists, never submit destructive actions, never complete purchases/payments,
 * never delete data, never submit a form to observe server-side validation.
 */

import type { ExplorerConfig } from "./config.js";

export class SafetyPolicy {
  private readonly deny: RegExp[];
  private readonly allow: RegExp[];
  private readonly origin: string;

  constructor(private readonly config: ExplorerConfig) {
    this.deny = config.denyList.map((r) => new RegExp(r, "i"));
    this.allow = config.allowList.map((r) => new RegExp(r, "i"));
    let origin = "";
    try {
      origin = new URL(config.url).origin;
    } catch {
      /* ignore */
    }
    this.origin = origin;
  }

  /** Is this action text/target explicitly allow-listed (overrides deny)? */
  private isAllowed(text: string): boolean {
    return this.allow.some((r) => r.test(text));
  }

  /**
   * May we safely click/activate this control? Deny destructive text unless the
   * user explicitly allow-listed it. Returns {ok, reason}.
   */
  canActivate(actionText: string): { ok: boolean; reason?: string } {
    const text = (actionText || "").trim();
    if (this.isAllowed(text)) return { ok: true };
    for (const r of this.deny) {
      if (r.test(text)) {
        return { ok: false, reason: `deny-listed action text matched ${r.source}` };
      }
    }
    return { ok: true };
  }

  /**
   * Forms are NEVER submitted to observe server validation or success/error.
   * The only permitted submit path is an idempotent GET-style search/filter form
   * that merely navigates. This returns whether a submit is permitted at all.
   */
  canSubmitForm(method: string, actionText: string): { ok: boolean; reason?: string } {
    if ((method || "get").toLowerCase() !== "get") {
      return { ok: false, reason: "non-GET form submission is testing, not discovery" };
    }
    const deny = this.canActivate(actionText);
    if (!deny.ok) return deny;
    return { ok: true };
  }

  /** Should this navigation target be crawled? External links recorded, not crawled. */
  canNavigate(targetUrl: string): { ok: boolean; reason?: string } {
    if (!targetUrl || targetUrl.startsWith("javascript:") || targetUrl.startsWith("#")) {
      return { ok: false, reason: "non-navigational target" };
    }
    if (targetUrl.startsWith("mailto:") || targetUrl.startsWith("tel:")) {
      return { ok: false, reason: "protocol link, not crawled" };
    }
    if (this.config.sameOriginOnly && this.origin) {
      let targetOrigin = "";
      try {
        targetOrigin = new URL(targetUrl, this.config.url).origin;
      } catch {
        return { ok: false, reason: "unparseable url" };
      }
      if (targetOrigin !== this.origin) {
        return { ok: false, reason: "external/off-origin (recorded, not crawled)" };
      }
    }
    return { ok: true };
  }
}
