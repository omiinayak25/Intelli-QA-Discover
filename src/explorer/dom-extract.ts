/**
 * In-page DOM extraction. This function body is serialized and executed in the
 * browser context by Playwright's page.evaluate. It DETECTS and DESCRIBES the
 * surface (DOM + accessibility roles + attributes + listeners); it never judges.
 *
 * Returns plain serializable data — the Explorer assigns stable IDs afterward.
 */

export interface RawExtract {
  title: string;
  components: RawComp[];
  forms: RawForm[];
  navs: RawNav[];
  hidden: RawHidden[];
  overlays: { type: string; label: string }[];
  links: { href: string; text: string }[];
  routeHints: string[];
  iframeCount: number;
  shadowRootCount: number;
  accordionCount: number;
  menuCount: number;
  hoverCount: number;
  lazyCount: number;
}
export interface RawComp {
  tag: string;
  role: string;
  label: string;
  selector: string;
  interactive: boolean;
  listeners: string[];
  visualHint: string;
  type: string;
  attributes: Record<string, string>;
}
export interface RawForm {
  name: string;
  selector: string;
  method: string;
  actionText: string;
  fields: {
    label: string;
    name: string;
    type: string;
    required: boolean;
    placeholder: string;
    options: string[];
    validationAttributesObserved: string[];
  }[];
  submitSelector: string;
  resetSelector: string;
  multiStep: boolean;
}
export interface RawNav {
  type: string;
  label: string;
  region: string;
  scope: string;
  selector: string;
  revealTrigger: string;
  items: { label: string; selector: string; target: string }[];
}
export interface RawHidden {
  type: string;
  revealTrigger: string;
  selector: string;
  detectionMethod: string;
  reproducible: boolean;
}

/**
 * The extractor function, as a string-safe function. Passed to page.evaluate.
 */
export function extractorFn(): RawExtract {
  function cssPath(el: Element): string {
    if (!(el instanceof Element)) return "";
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      let sel = node.nodeName.toLowerCase();
      const id = (node as HTMLElement).id;
      if (id && /^[a-zA-Z][\w-]*$/.test(id)) {
        parts.unshift(`#${id}`);
        break;
      }
      const dt = node.getAttribute("data-testid") || node.getAttribute("data-test");
      if (dt) {
        sel += `[data-testid="${dt}"]`;
        parts.unshift(sel);
        break;
      }
      const parent: Element | null = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.nodeName === node!.nodeName);
        if (sibs.length > 1) {
          const idx = sibs.indexOf(node) + 1;
          sel += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(sel);
      node = parent;
      depth++;
    }
    return parts.join(" > ");
  }

  function labelOf(el: Element): string {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    const ph = el.getAttribute("placeholder");
    const title = el.getAttribute("title");
    const alt = el.getAttribute("alt");
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    return (text || ph || title || alt || "").slice(0, 80);
  }

  function listenersOf(el: Element): string[] {
    const out: string[] = [];
    const evts = ["click", "input", "change", "submit", "mouseover", "keydown", "focus"];
    for (const e of evts) {
      if ((el as any)["on" + e]) out.push(e);
    }
    if (el.hasAttribute("href") || el.tagName === "BUTTON") out.push("click");
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")
      out.push("input");
    return Array.from(new Set(out));
  }

  function typeOf(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || "";
    const t = (el.getAttribute("type") || "").toLowerCase();
    if (tag === "button" || role === "button") return "button";
    if (tag === "a") return "button"; // link-styled action captured as actionable
    if (tag === "input") {
      if (["checkbox"].includes(t)) return "checkbox";
      if (["radio"].includes(t)) return "radio";
      if (["file"].includes(t)) return "upload";
      if (["search"].includes(t)) return "search";
      if (["date", "datetime-local", "month", "week", "time"].includes(t)) return "calendar";
      return "input";
    }
    if (tag === "textarea") return "input";
    if (tag === "select") return "dropdown";
    if (tag === "table" || role === "grid" || role === "table") return "table";
    if (tag === "canvas") return "chart";
    if (tag === "svg" && el.querySelector("path,rect,circle")) return "chart";
    if (tag === "video") return "video";
    if (role === "tablist" || el.classList.contains("tabs")) return "tabs";
    if (role === "dialog" || role === "alertdialog") return "modal";
    if (role === "tooltip") return "tooltip";
    if (el.classList.contains("carousel") || el.getAttribute("data-carousel") !== null)
      return "carousel";
    if (el.classList.contains("card")) return "card";
    if (el.classList.contains("accordion")) return "accordion";
    if (tag.includes("-")) return "custom"; // custom element <x-...>
    return "custom";
  }

  const seen = new Set<string>();
  const components: RawComp[] = [];
  const interactiveSel =
    "button, a[href], input, textarea, select, [role=button], [onclick], [tabindex], canvas, svg, video, table, [role=grid], .card, .carousel, [data-carousel], [role=tablist], [role=dialog]";
  document.querySelectorAll(interactiveSel).forEach((el) => {
    const selector = cssPath(el);
    if (!selector || seen.has(selector)) return;
    seen.add(selector);
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) {
      if (["class", "style"].includes(a.name)) continue;
      attrs[a.name] = a.value.slice(0, 60);
    }
    const tag = el.tagName.toLowerCase();
    const canvasish = tag === "canvas" || (tag === "svg" && !!el.querySelector("path,rect,circle"));
    components.push({
      tag,
      role: el.getAttribute("role") || "",
      label: labelOf(el),
      selector,
      interactive: true,
      listeners: listenersOf(el),
      visualHint: canvasish ? "canvas" : "",
      type: typeOf(el),
      attributes: attrs,
    });
  });

  // Forms
  const forms: RawForm[] = [];
  document.querySelectorAll("form").forEach((form) => {
    const selector = cssPath(form);
    const method = (form.getAttribute("method") || "get").toLowerCase();
    const submit = form.querySelector('button[type=submit], input[type=submit], button:not([type])');
    const reset = form.querySelector('button[type=reset], input[type=reset]');
    const nameGuess =
      form.getAttribute("name") ||
      form.getAttribute("aria-label") ||
      (form.querySelector("h1,h2,h3,legend")?.textContent || "").trim() ||
      "Form";
    const fields: RawForm["fields"] = [];
    form.querySelectorAll("input, textarea, select").forEach((f) => {
      const fe = f as HTMLInputElement;
      if (["submit", "reset", "button", "hidden"].includes((fe.type || "").toLowerCase())) return;
      const va: string[] = [];
      for (const attr of ["required", "pattern", "min", "max", "maxlength", "minlength", "step"]) {
        if (fe.hasAttribute(attr)) va.push(attr);
      }
      let lbl = "";
      if (fe.id) {
        const l = document.querySelector(`label[for="${fe.id}"]`);
        if (l) lbl = (l.textContent || "").trim();
      }
      if (!lbl) lbl = fe.getAttribute("aria-label") || fe.getAttribute("placeholder") || fe.name || "";
      const options: string[] = [];
      if (fe.tagName === "SELECT") {
        (fe as unknown as HTMLSelectElement)
          .querySelectorAll("option")
          .forEach((o) => options.push((o.textContent || "").trim()));
      }
      fields.push({
        label: lbl.slice(0, 60),
        name: fe.name || fe.id || "",
        type: (fe.getAttribute("type") || fe.tagName.toLowerCase()).toLowerCase(),
        required: fe.hasAttribute("required"),
        placeholder: fe.getAttribute("placeholder") || "",
        options,
        validationAttributesObserved: va,
      });
    });
    forms.push({
      name: nameGuess.slice(0, 60),
      selector,
      method,
      actionText: (submit?.textContent || "").trim() || "Submit",
      fields,
      submitSelector: submit ? cssPath(submit) : "",
      resetSelector: reset ? cssPath(reset) : "",
      multiStep: form.querySelectorAll("[data-step], .step, fieldset").length > 1,
    });
  });

  // Navigation regions
  const navs: RawNav[] = [];
  const navSel = "nav, header, footer, [role=navigation], aside, .sidebar, .navbar, .menu, .breadcrumb";
  document.querySelectorAll(navSel).forEach((nav) => {
    const selector = cssPath(nav);
    const tag = nav.tagName.toLowerCase();
    let region = "inline";
    if (tag === "header" || nav.classList.contains("navbar")) region = "header";
    else if (tag === "footer") region = "footer";
    else if (tag === "aside" || nav.classList.contains("sidebar")) region = "left";
    else if (nav.classList.contains("breadcrumb")) region = "inline";
    const items: RawNav["items"] = [];
    nav.querySelectorAll("a[href]").forEach((a) => {
      const href = (a as HTMLAnchorElement).getAttribute("href") || "";
      items.push({
        label: (a.textContent || "").trim().slice(0, 40),
        selector: cssPath(a),
        target: href,
      });
    });
    let type = "menu";
    if (region === "header") type = "header";
    else if (region === "footer") type = "footer";
    else if (region === "left") type = "sidebar";
    else if (nav.classList.contains("breadcrumb")) type = "breadcrumb";
    if (items.length === 0 && !nav.querySelector("button")) return;
    navs.push({
      type,
      label: nav.getAttribute("aria-label") || type,
      region,
      scope: region === "header" || region === "footer" ? "global" : "page-local",
      selector,
      revealTrigger: "always-visible",
      items,
    });
  });

  // Hidden things
  const hidden: RawHidden[] = [];
  let accordionCount = 0;
  let menuCount = 0;
  let hoverCount = 0;
  let lazyCount = 0;
  document.querySelectorAll("[aria-expanded], details, .accordion, [data-toggle], [data-menu]").forEach(
    (el) => {
      const ae = el.getAttribute("aria-expanded");
      const isAccordion =
        el.tagName === "DETAILS" ||
        el.classList.contains("accordion") ||
        (ae !== null && (el.textContent || "").length > 0);
      if (isAccordion) accordionCount++;
      const isMenu =
        el.hasAttribute("data-menu") ||
        el.classList.contains("dropdown") ||
        (el.getAttribute("aria-haspopup") === "menu");
      if (isMenu) menuCount++;
      if (ae === "false" || el.tagName === "DETAILS") {
        hidden.push({
          type: el.tagName === "DETAILS" ? "click-toggled" : "click-toggled",
          revealTrigger: `click ${cssPath(el).slice(0, 40)}`,
          selector: cssPath(el),
          detectionMethod: "DOM-diff",
          reproducible: true,
        });
      }
    },
  );
  document.querySelectorAll("[data-hover], .has-hover, [title]").forEach((el) => {
    if (el.getAttribute("data-hover") !== null || el.classList.contains("has-hover")) {
      hoverCount++;
      hidden.push({
        type: "hover-revealed",
        revealTrigger: `hover ${cssPath(el).slice(0, 40)}`,
        selector: cssPath(el),
        detectionMethod: "listener-scan",
        reproducible: true,
      });
    }
  });
  document.querySelectorAll("[data-lazy], [loading=lazy], .lazy").forEach(() => lazyCount++);

  // Overlays
  const overlays: { type: string; label: string }[] = [];
  document.querySelectorAll("[role=dialog], .modal, .cookie-banner, [data-cookie], .consent").forEach(
    (el) => {
      let type = "modal";
      if (el.classList.contains("cookie-banner") || el.getAttribute("data-cookie") !== null)
        type = "cookie";
      else if (el.classList.contains("consent")) type = "consent";
      overlays.push({ type, label: labelOf(el).slice(0, 40) || type });
    },
  );

  // Internal links + SPA route hints
  const links: { href: string; text: string }[] = [];
  document.querySelectorAll("a[href]").forEach((a) => {
    const href = (a as HTMLAnchorElement).getAttribute("href") || "";
    if (href && !href.startsWith("javascript:")) {
      links.push({ href, text: (a.textContent || "").trim().slice(0, 40) });
    }
  });
  const routeHints: string[] = [];
  document.querySelectorAll("[data-route], [routerlink], [ng-href]").forEach((el) => {
    const r =
      el.getAttribute("data-route") ||
      el.getAttribute("routerlink") ||
      el.getAttribute("ng-href") ||
      "";
    if (r) routeHints.push(r);
  });

  const iframeCount = document.querySelectorAll("iframe").length;
  let shadowRootCount = 0;
  document.querySelectorAll("*").forEach((el) => {
    if ((el as any).shadowRoot) shadowRootCount++;
  });

  return {
    title: document.title || "",
    components,
    forms,
    navs,
    hidden,
    overlays,
    links,
    routeHints,
    iframeCount,
    shadowRootCount,
    accordionCount,
    menuCount,
    hoverCount,
    lazyCount,
  };
}
