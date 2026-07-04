/* QA Discovery Portal — client SPA. Reads window.__MODEL__ (the inlined
 * discovery model) only. No network, no LLM, no re-derivation. Discovery only:
 * it presents WHAT EXISTS — it never evaluates behaviour or produces verdicts. */
(function () {
  "use strict";
  var M = window.__MODEL__ || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function tc(s) { return String(s || "").split(/[\s_-]+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" "); }
  function pct(n) { return (n == null ? 0 : Math.round(n)) + "%"; }

  // ---- indexes ----
  var idx = { page: {}, component: {}, form: {}, flow: {}, state: {}, hidden: {}, api: {}, module: {}, nav: {} };
  (M.pages || []).forEach(function (p) { idx.page[p.id] = p; });
  (M.components || []).forEach(function (c) { idx.component[c.id] = c; });
  (M.forms || []).forEach(function (f) { idx.form[f.id] = f; });
  (M.flows || []).forEach(function (f) { idx.flow[f.id] = f; });
  (M.states || []).forEach(function (s) { idx.state[s.id] = s; });
  (M.hidden || []).forEach(function (h) { idx.hidden[h.id] = h; });
  (M.apis || []).forEach(function (a) { idx.api[a.id] = a; });
  (M.modules || []).forEach(function (m) { idx.module[m.id] = m; });
  (M.navigation || []).forEach(function (n) { idx.nav[n.id] = n; });
  function label(id) {
    var o = idx.page[id] || idx.component[id] || idx.form[id] || idx.flow[id] || idx.state[id] || idx.hidden[id] || idx.api[id] || idx.module[id] || idx.nav[id];
    return o ? (o.label || o.name || o.endpointPattern || id) : id;
  }

  function conf(c) {
    var v = c == null ? null : (typeof c === "number" ? c : c.confidence);
    if (v == null) return "";
    var cls = v >= 80 ? "g" : v >= 50 ? "y" : "r";
    return '<span class="badge ' + cls + '" title="Certainty of discovery, never a pass-probability">Conf ' + Math.round(v) + '%</span>';
  }
  function confReason(o) { return o && o.confidence < 80 && o.confidenceReason ? '<div class="muted" style="font-size:12px;margin-top:.3rem">' + esc(o.confidenceReason) + "</div>" : ""; }

  // ---- theme ----
  var THEME_KEY = "qadisc:theme:" + M.meta.runId;
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
  var savedTheme; try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(savedTheme || "dark");

  // ---- nav config ----
  var NAV = [
    { group: "Overview", items: [
      { r: "dashboard", i: "◲", t: "Dashboard" },
      { r: "overview", i: "❖", t: "Application Overview" },
      { r: "modules", i: "▦", t: "Business Modules", c: (M.modules || []).length },
      { r: "feature-tree", i: "⑃", t: "Business Feature Tree" },
      { r: "structure", i: "⊞", t: "Application Structure" }
    ]},
    { group: "Inventory", items: [
      { r: "pages", i: "▢", t: "Pages", c: (M.pages || []).length },
      { r: "navigation", i: "≡", t: "Navigation", c: (M.navigation || []).length },
      { r: "components", i: "◱", t: "Components", c: (M.components || []).length },
      { r: "forms", i: "▤", t: "Forms", c: (M.forms || []).length },
      { r: "flows", i: "➤", t: "Flows", c: (M.flows || []).length },
      { r: "states", i: "◐", t: "States", c: (M.states || []).length },
      { r: "hidden", i: "◈", t: "Hidden Elements", c: (M.hidden || []).length },
      { r: "apis", i: "⇄", t: "API Map", c: (M.apis || []).length },
      { r: "relationships", i: "⋔", t: "Relationships" },
      { r: "screenshots", i: "▣", t: "Screenshots" }
    ]},
    { group: "QA Handoff", items: [
      { r: "checklist", i: "☑", t: "QA Checklist" },
      { r: "manual-review", i: "⚑", t: "Manual Review", c: (M.manualReview || []).length },
      { r: "coverage", i: "▩", t: "Coverage Map" },
      { r: "timeline", i: "◷", t: "Discovery Timeline" },
      { r: "validation", i: "✔", t: "Discovery Validation" }
    ]},
    { group: "Tools", items: [
      { r: "assistant", i: "✦", t: "AI Assistant" },
      { r: "settings", i: "⚙", t: "Settings" }
    ]}
  ];

  // ---- shell ----
  function shell() {
    var nav = NAV.map(function (g) {
      return '<div class="nav-group">' + esc(g.group) + "</div>" + g.items.map(function (it) {
        return '<a href="#/' + it.r + '" data-r="' + it.r + '"><span class="ni">' + it.i + "</span>" + esc(it.t) + (it.c != null ? '<span class="count">' + it.c + "</span>" : "") + "</a>";
      }).join("");
    }).join("");
    document.body.innerHTML =
      '<div class="app">' +
        '<div class="brand"><div class="logo">Q</div><div><div class="btitle">QA Discovery</div><div class="bsub">' + esc(M.meta.appName) + "</div></div></div>" +
        '<div class="topbar">' +
          '<button class="hamburger" id="ham">☰</button>' +
          '<div class="searchbox"><span class="sicon">⌕</span><input id="q" placeholder="Search pages, components, features, flows…" autocomplete="off"><kbd>Ctrl K</kbd><div class="results" id="results"></div></div>' +
          '<div class="spacer"></div>' +
          '<span class="pill" title="Certainty of discovery">Confidence ' + pct(M.summary.discoveryConfidence) + "</span>" +
          '<button class="tbtn" id="exportBtn">⤓ Export</button>' +
          '<button class="tbtn" id="themeBtn" title="Toggle theme">◑</button>' +
        "</div>" +
        '<nav class="sidebar nav" id="sidebar">' + nav + "</nav>" +
        '<main class="main" id="view"></main>' +
      "</div>" +
      '<div class="scrim" id="scrim"></div>' +
      '<aside class="drawer" id="drawer"><div class="dh"><h3 id="drawerTitle"></h3><button class="x" id="drawerX">✕</button></div><div class="db" id="drawerBody"></div></aside>';

    $("#themeBtn").onclick = function () { applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); };
    $("#ham").onclick = function () { $("#sidebar").classList.toggle("open"); };
    $("#scrim").onclick = closeDrawer;
    $("#drawerX").onclick = closeDrawer;
    $("#exportBtn").onclick = function () { go("settings"); };
    wireSearch();
  }

  // ---- drawer ----
  function openDrawer(title, html) {
    $("#drawerTitle").innerHTML = title; $("#drawerBody").innerHTML = html;
    $("#drawer").classList.add("open"); $("#scrim").classList.add("open");
  }
  function closeDrawer() { $("#drawer").classList.remove("open"); $("#scrim").classList.remove("open"); }

  // ---- router ----
  var views = {};
  function go(r, param) { location.hash = "#/" + r + (param ? "/" + encodeURIComponent(param) : ""); }
  function route() {
    var h = location.hash.replace(/^#\//, "") || "dashboard";
    var parts = h.split("/"); var r = parts[0]; var param = parts[1] ? decodeURIComponent(parts[1]) : null;
    $$("#sidebar a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-r") === r); });
    $("#sidebar").classList.remove("open");
    var v = views[r] || views.dashboard;
    $("#view").innerHTML = v(param) || "";
    $("#view").scrollTop = 0;
    if (v.after) v.after(param);
  }
  window.addEventListener("hashchange", route);

  // ---- helpers for rendering ----
  function head(title, sub) { return '<div class="page-head"><div><h1>' + esc(title) + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + "</div></div>"; }
  function crumb(items) { return '<div class="crumbs">' + items.join(" › ") + "</div>"; }
  function kpi(v, l, cls) { return '<div class="card kpi ' + (cls || "") + '"><div class="kv">' + v + '</div><div class="kl">' + esc(l) + "</div></div>"; }
  function link(id, text, r) { return '<a href="#/' + r + '/' + encodeURIComponent(id) + '">' + esc(text) + "</a>"; }
  function chip(id, text, r) { return '<span class="chip click" onclick="location.hash=\'#/' + r + "/" + encodeURIComponent(id) + "'\">" + esc(text) + "</span>"; }

  // ============ DASHBOARD ============
  views.dashboard = function () {
    var k = M.kpis || {};
    var cards = [
      ["Pages", k.totalPages], ["Business Modules", (M.modules || []).length], ["Features", (M.overview.businessFlows ? 0 : 0) + featureLeafCount()], ["Flows", k.businessFlows],
      ["Components", k.totalComponents], ["Forms", k.forms], ["Hidden Elements", (M.hidden || []).length], ["States", k.states],
      ["API Correlations", k.apiCalls], ["Roles", k.roles], ["Manual Review", (M.manualReview || []).length], ["Tables", k.tables]
    ].map(function (x) { return '<div class="card kpi click" onclick="location.hash=\'#/' + kpiRoute(x[0]) + '\'"><div class="kv">' + (x[1] == null ? 0 : x[1]) + '</div><div class="kl">' + x[0] + "</div></div>"; }).join("");
    var heatPreview = (M.coverageMap || []).filter(function (h) { return h.kind === "module"; }).map(heatCell).join("");
    return head("Dashboard", "Everything discovered in <b>" + esc(M.meta.appName) + "</b> — one place to understand what a manual tester needs to look at.") +
      '<div class="grid" style="grid-template-columns:1.4fr 1fr;align-items:stretch;margin-bottom:1rem">' +
        '<div class="card"><div class="between" style="margin-bottom:.6rem"><b>' + esc(M.meta.appName) + '</b><span class="tag">' + esc(M.meta.runId) + '</span></div>' +
          '<div class="kv-list"><dt>Website</dt><dd><a href="' + esc(M.meta.appUrl) + '" target="_blank" rel="noopener">' + esc(M.meta.appUrl) + '</a></dd>' +
          '<dt>Discovery Time</dt><dd>' + esc(M.meta.generatedAt) + '</dd>' +
          '<dt>Roles</dt><dd>' + M.meta.roles.map(tc).join(", ") + '</dd>' +
          '<dt>Schema</dt><dd class="mono">' + esc(M.meta.schemaVersion) + '</dd></div></div>' +
        '<div class="card"><div class="row" style="justify-content:space-around">' +
          ring(M.summary.discoveryConfidence, "Discovery Confidence") +
          ring(M.validation.overallDiscoveryCompleteness, "Completeness") +
        "</div></div>" +
      "</div>" +
      '<div class="grid kpis" style="margin-bottom:1.4rem">' + cards + "</div>" +
      '<h2 class="sec">Coverage map · business modules</h2>' +
      '<div class="heat">' + heatPreview + "</div>" +
      legend() +
      '<h2 class="sec">Where a human must look</h2>' +
      (M.manualReview.length ? '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">' + M.manualReview.slice(0, 6).map(function (e) {
        return '<div class="card"><div class="row" style="margin-bottom:.3rem"><span class="badge r">⚑ ' + esc(tc((e.blockerType || "").replace(/_/g, " "))) + '</span></div><div class="dim" style="font-size:12.5px">' + esc(e.reason) + "</div></div>";
      }).join("") + "</div>" : '<div class="empty">No blocked areas — auto-discovery reached everything it attempted.</div>');
  };
  function kpiRoute(name) {
    var map = { "Pages": "pages", "Business Modules": "modules", "Features": "feature-tree", "Flows": "flows", "Components": "components", "Forms": "forms", "Hidden Elements": "hidden", "States": "states", "API Correlations": "apis", "Roles": "settings", "Manual Review": "manual-review", "Tables": "components" };
    return map[name] || "dashboard";
  }
  function featureLeafCount() { var n = 0; (M.featureTree.root.children || []).forEach(function (c) { n += (c.children || []).length || 1; }); return n; }
  function ring(v, l) {
    v = v == null ? 0 : v;
    return '<div style="text-align:center"><div class="ringwrap"><div class="ring" style="--p:' + v + '"><b>' + Math.round(v) + "%</b></div></div><div class=\"kl\" style=\"margin-top:.4rem\">" + esc(l) + "</div></div>";
  }
  function legend() {
    return '<div class="legend"><span><span class="dot g"></span> Discovered</span><span><span class="dot y"></span> Partial</span><span><span class="dot r"></span> Blocked (manual review)</span><span><span class="dot n"></span> Low certainty</span></div>';
  }
  function heatCell(h) {
    return '<div class="hc ' + h.status + '" onclick="location.hash=\'#/' + (h.kind === "module" ? "modules" : "pages") + "/" + encodeURIComponent(h.id) + "'\" title=\"" + esc(h.label) + '"><span>' + esc(h.label) + "</span><small>" + tc(h.status.replace("_", " ")) + " · " + Math.round(h.confidence) + "%</small></div>";
  }

  // ============ APPLICATION OVERVIEW ============
  views.overview = function () {
    var ov = M.overview; var caps = (M.modules || []).map(function (m) { return m.name; });
    var langs = (M.components || []).filter(function (c) { return /language|english|hindi|hinglish|locale/i.test(c.label); }).map(function (c) { return c.label; });
    var hasAuth = (M.modules || []).some(function (m) { return /auth/i.test(m.name); });
    var hasPay = (M.modules || []).some(function (m) { return /payment/i.test(m.name); });
    var domain = guessDomain();
    return head("Application Overview", "A senior QA's read of what this application is — inferred from the crawl.") +
      '<div class="split">' +
        '<div class="panel"><div class="ph">❖ What this application is</div><div class="pb">' +
          '<div class="kv-list">' +
          '<dt>Application</dt><dd>' + esc(M.meta.appName) + '</dd>' +
          '<dt>URL</dt><dd><a href="' + esc(M.meta.appUrl) + '" target="_blank" rel="noopener">' + esc(M.meta.appUrl) + '</a></dd>' +
          '<dt>Domain</dt><dd>' + esc(domain) + '</dd>' +
          '<dt>Target users</dt><dd>Guest visitors' + (hasAuth ? " and authenticated users" : "") + '</dd>' +
          '<dt>Authentication</dt><dd>' + (hasAuth ? "Present (login surface discovered)" : "Not observed on public surface") + '</dd>' +
          '<dt>Payments</dt><dd>' + (hasPay ? "Present — checkout hands off to an external gateway (see Manual Review)" : "Not observed") + '</dd>' +
          '<dt>Notifications</dt><dd>' + ((M.modules || []).some(function (m) { return /notif/i.test(m.name); }) ? "Present" : "Not observed") + '</dd>' +
          '<dt>Languages</dt><dd>' + (langs.length ? uniq(langs).slice(0, 6).map(esc).join(", ") : "Not observed") + '</dd>' +
          "</div></div></div>" +
        '<div class="panel"><div class="ph">▦ Primary business capabilities</div><div class="pb"><div class="chips">' +
          caps.map(function (n, i) { return '<span class="chip click" onclick="location.hash=\'#/modules/' + encodeURIComponent(M.modules[i].id) + '\'">' + esc(n) + "</span>"; }).join("") +
          "</div>" +
          '<h2 class="sec" style="margin-top:1rem">High-level navigation</h2><div class="chips">' +
          (M.navigation || []).slice(0, 12).map(function (n) { return '<span class="chip">' + esc(n.label || n.type) + "</span>"; }).join("") +
          "</div></div></div>" +
      "</div>" +
      '<div class="panel" style="margin-top:.85rem"><div class="ph">Pages found (' + M.pages.length + ")</div><div class=\"pb\"><div class=\"chips\">" +
      M.pages.map(function (p) { return '<span class="chip click" onclick="location.hash=\'#/pages/' + encodeURIComponent(p.id) + '\'">' + esc(p.label) + "</span>"; }).join("") +
      "</div></div></div>" +
      '<div class="panel" style="margin-top:.85rem"><div class="ph">Summary</div><div class="pb dim" style="font-size:13.5px">' + esc(narrative()) + "</div></div>";
  };
  function guessDomain() {
    var names = (M.modules || []).map(function (m) { return m.name.toLowerCase(); }).join(" ");
    if (/course|exam|study material|test series|coaching/.test(names)) return "Education / e-learning";
    if (/checkout|payment|cart|catalog|product/.test(names)) return "E-commerce";
    if (/booking|seat|showtime/.test(names)) return "Booking / ticketing";
    return "Web application";
  }
  function narrative() {
    return M.meta.appName + " exposes " + M.pages.length + " page archetype(s) organised into " + M.modules.length +
      " business module(s): " + M.modules.map(function (m) { return m.name; }).join(", ") + ". " +
      M.components.length + " components, " + M.forms.length + " form(s) and " + M.apis.length +
      " observed API correlation(s) were discovered as " + M.meta.roles.map(tc).join("/") + ". Discovery confidence is " +
      Math.round(M.summary.discoveryConfidence) + "% — " + (M.summary.discoveryConfidence >= 70 ? "a broad pass." : "a partial pass; areas behind authentication, robots.txt, or external gateways are listed under Manual Review.");
  }

  // ============ BUSINESS MODULES ============
  views.modules = function (param) {
    var mods = M.modules.map(function (m) {
      var open = m.id === param ? " open" : "";
      return '<div class="mod' + open + '" id="mod_' + safe(m.id) + '">' +
        '<div class="mh" onclick="this.parentNode.classList.toggle(\'open\')"><div class="mi">' + moduleIcon(m.name) + "</div>" +
          "<div style=\"flex:1\"><div class=\"mn\">" + esc(m.name) + "</div><div class=\"mmeta\">" + m.features.length + " features · " + m.pageIds.length + " pages · " + m.componentIds.length + " components</div></div>" +
          conf(m.confidence) + (m.manualReview ? ' <span class="badge r">⚑</span>' : "") +
        "</div>" +
        '<div class="mb">' +
          (m.features.length ? '<div class="chips">' + m.features.map(function (f) { return '<span class="chip">' + esc(f.label) + (f.children.length ? " (" + f.children.map(esc).join(", ") + ")" : "") + "</span>"; }).join("") + "</div>" : "") +
          modRow("Pages", m.pageIds, "pages") +
          modRow("Components", m.componentIds.slice(0, 40), "components") +
          modRow("Forms", m.formIds, "forms") +
          modRow("Flows", m.flowIds, "flows") +
          modRow("Hidden UI", m.hiddenIds, "hidden") +
          confReason(m) +
        "</div></div>";
    }).join("");
    return head("Business Modules", "The capabilities this application offers — expand a module to see its features, pages, components and flows.") +
      '<div class="mods">' + mods + "</div>";
  };
  function modRow(name, ids, r) {
    if (!ids || !ids.length) return "";
    return '<div class="mrow"><span>' + name + "</span><span>" + ids.slice(0, 30).map(function (id) { return chip(id, label(id), r); }).join(" ") + (ids.length > 30 ? ' <span class="muted">+' + (ids.length - 30) + "</span>" : "") + "</span></div>";
  }
  function moduleIcon(n) { n = n.toLowerCase();
    if (/auth/.test(n)) return "🔐"; if (/course|coach/.test(n)) return "🎓"; if (/study|material/.test(n)) return "📚";
    if (/test|assess/.test(n)) return "📝"; if (/exam/.test(n)) return "📋"; if (/pay/.test(n)) return "💳";
    if (/search/.test(n)) return "🔎"; if (/media/.test(n)) return "🎬"; if (/notif/.test(n)) return "🔔";
    if (/profile|account/.test(n)) return "👤"; if (/report/.test(n)) return "📊"; if (/local/.test(n)) return "🌐";
    if (/booking/.test(n)) return "🎫"; return "▦"; }

  // ============ FEATURE TREE ============
  views["feature-tree"] = function () {
    return head("Business Feature Tree", "Business hierarchy — what the app does, grouped the way a QA thinks (not the DOM).") +
      '<div class="panel"><div class="pb tree">' + treeHtml(M.featureTree.root, true) + "</div></div>";
  };
  function treeHtml(node, isFeat) {
    var kids = node.children || [];
    var hasKids = kids.length > 0;
    var clickable = node.memberIds && node.memberIds.length ? " clk" : "";
    var onclk = node.memberIds && node.memberIds.length ? ' onclick="portalShowMembers(\'' + safe(node.id) + '\')"' : "";
    var row = '<div class="tnode' + clickable + '">' +
      (hasKids ? '<span class="tw" onclick="portalToggle(this)">▾</span>' : '<span class="tw"></span>') +
      '<span class="tl"' + onclk + ">" + esc(node.label) + "</span>" +
      (node.confidence != null ? " " + conf(node.confidence) : "") + "</div>";
    return "<li>" + row + (hasKids ? "<ul>" + kids.map(function (c) { return treeHtml(c, isFeat); }).join("") + "</ul>" : "") + "</li>";
  }
  window.portalToggle = function (el) {
    var li = el.closest("li"); var ul = li.querySelector("ul"); if (!ul) return;
    var hidden = ul.style.display === "none";
    ul.style.display = hidden ? "" : "none"; el.textContent = hidden ? "▾" : "▸";
  };
  window.portalShowMembers = function (nodeId) {
    var node = findNode(M.featureTree.root, nodeId); if (!node) return;
    var ids = node.memberIds || [];
    var groups = { PAGE: [], "CMP": [], FORM: [], FLOW: [], API: [], HID: [] };
    ids.forEach(function (id) { var pre = id.split(":")[0]; if (groups[pre]) groups[pre].push(id); });
    var routeMap = { PAGE: "pages", CMP: "components", FORM: "forms", FLOW: "flows", API: "apis", HID: "hidden" };
    var body = Object.keys(groups).filter(function (g) { return groups[g].length; }).map(function (g) {
      return "<h2 class=\"sec\">" + ({ PAGE: "Pages", CMP: "Components", FORM: "Forms", FLOW: "Flows", API: "APIs", HID: "Hidden" }[g]) + "</h2><div class=\"chips\">" +
        groups[g].map(function (id) { return chip(id, label(id), routeMap[g]); }).join("") + "</div>";
    }).join("") || '<div class="muted">No linked discovery items.</div>';
    openDrawer(esc(node.label) + " " + (node.confidence != null ? conf(node.confidence) : ""), body);
  };
  function findNode(n, id) { if (n.id === id) return n; var kids = n.children || []; for (var i = 0; i < kids.length; i++) { var r = findNode(kids[i], id); if (r) return r; } return null; }

  // ============ APPLICATION STRUCTURE ============
  views.structure = function () {
    var root = { label: M.meta.appName + " (Application)", children: M.modules.map(function (m) {
      return { label: m.name, tag: "module", children: (m.pageIds.length ? m.pageIds : []).map(function (pid) {
        var p = idx.page[pid]; if (!p) return { label: pid, tag: "page" };
        return { label: p.label, tag: "page", ref: pid, refR: "pages", children: (p.componentIds || []).slice(0, 25).map(function (cid) {
          var c = idx.component[cid]; return { label: c ? (c.label || c.type) : cid, tag: c ? c.type : "component", ref: cid, refR: "components" };
        }) };
      }) };
    }) };
    return head("Application Structure", "Application › Module › Page › Component — expand to drill down.") +
      '<div class="panel"><div class="pb tree">' + structTree(root) + "</div></div>";
  };
  function structTree(node) {
    var kids = node.children || []; var hasKids = kids.length > 0;
    var onclk = node.ref ? ' onclick="location.hash=\'#/' + node.refR + "/" + encodeURIComponent(node.ref) + "'\"" : "";
    var row = '<div class="tnode' + (node.ref ? " clk" : "") + '">' +
      (hasKids ? '<span class="tw" onclick="portalToggle(this)">▾</span>' : '<span class="tw"></span>') +
      '<span class="tl"' + onclk + ">" + esc(node.label) + "</span>" + (node.tag ? '<span class="tt">' + esc(node.tag) + "</span>" : "") + "</div>";
    return "<li>" + row + (hasKids ? '<ul>' + kids.map(structTree).join("") + "</ul>" : "") + "</li>";
  }

  // ============ PAGES ============
  views.pages = function (param) {
    if (param && idx.page[param]) return pageDetail(idx.page[param]);
    var rows = M.pages.map(function (p) {
      return '<tr onclick="location.hash=\'#/pages/' + encodeURIComponent(p.id) + '\'" style="cursor:pointer">' +
        "<td><b>" + esc(p.label) + '</b><div class="mono muted">' + esc(p.url) + "</div></td>" +
        "<td>" + (p.componentIds.length) + "</td><td>" + (p.formIds.length) + "</td><td>" + (p.stateIds.length) + "</td>" +
        "<td>" + p.roles.map(tc).join(", ") + "</td><td>" + conf(p.confidence) + (p.authRequired ? ' <span class="badge y">auth</span>' : "") + "</td></tr>";
    }).join("");
    return head("Pages", M.pages.length + " page archetype(s) discovered. Click a page for its full detail and screenshot overlay.") +
      tableWrap(["Page", "Components", "Forms", "States", "Roles", "Confidence"], rows);
  };
  function pageDetail(p) {
    var comps = (p.componentIds || []).map(function (id) { return idx.component[id]; }).filter(Boolean);
    return crumb(['<a href="#/pages">Pages</a>', esc(p.label)]) +
      head(p.label, esc(p.purpose)) +
      '<div class="split">' +
        '<div>' + screenshotBlock(p) + "</div>" +
        '<div class="panel"><div class="ph">Page facts</div><div class="pb"><div class="kv-list">' +
          '<dt>URL pattern</dt><dd class="mono">' + esc(p.url) + "</dd>" +
          "<dt>Archetype</dt><dd>" + esc(p.archetype) + "</dd>" +
          "<dt>HTTP observed</dt><dd>" + (p.httpStatus || "—") + "</dd>" +
          "<dt>Roles</dt><dd>" + p.roles.map(tc).join(", ") + "</dd>" +
          "<dt>Auth required</dt><dd>" + (p.authRequired ? "Yes" : "No") + "</dd>" +
          "<dt>Confidence</dt><dd>" + conf(p.confidence) + "</dd>" +
          "<dt>Modules</dt><dd>" + (p.moduleIds.length ? p.moduleIds.map(function (id) { return chip(id, label(id), "modules"); }).join(" ") : '<span class="muted">—</span>') + "</dd>" +
        "</div>" + confReason(p) + "</div></div>" +
      "</div>" +
      '<h2 class="sec">Components on this page (' + comps.length + ")</h2>" +
      (comps.length ? '<div class="chips">' + comps.map(function (c) { return chip(c.id, (c.label || c.type), "components"); }).join("") + "</div>" : '<div class="muted">No page-local components.</div>') +
      (p.formIds.length ? '<h2 class="sec">Forms</h2><div class="chips">' + p.formIds.map(function (id) { return chip(id, label(id), "forms"); }).join("") + "</div>" : "") +
      (p.stateIds.length ? '<h2 class="sec">States</h2><div class="chips">' + p.stateIds.map(function (id) { return chip(id, label(id), "states"); }).join("") + "</div>" : "");
  };
  function screenshotBlock(p) {
    var set = (M.screenshots || {})[p.screenshotKey];
    if (!set || !(set.desktop || set.tablet || set.mobile)) {
      return '<div class="noshot">📷<div style="margin-top:.5rem">No screenshot captured for this page.<br><span class="muted">Enable screenshot capture in the crawl to see an annotated page overlay here.</span></div></div>';
    }
    var boxes = set.boxes || [];
    var seg = '<div class="seg" style="margin-bottom:.5rem" id="segShot">' +
      ["desktop", "tablet", "mobile"].filter(function (v) { return set[v]; }).map(function (v, i) { return '<button data-v="' + v + '"' + (i === 0 ? ' class="on"' : "") + ">" + tc(v) + "</button>"; }).join("") + "</div>";
    var first = set.desktop || set.tablet || set.mobile;
    var hots = boxes.map(function (b, i) {
      var pctL = set.width ? (b.x / set.width * 100) : 0, pctT = set.height ? (b.y / set.height * 100) : 0,
        pctW = set.width ? (b.w / set.width * 100) : 0, pctH = set.height ? (b.h / set.height * 100) : 0;
      return '<div class="hot" style="left:' + pctL + "%;top:" + pctT + "%;width:" + pctW + "%;height:" + pctH + '%" title="' + esc(b.label || b.type) + '" onclick="location.hash=\'#/components/' + encodeURIComponent(b.id) + '\'"><span class="num">' + (i + 1) + "</span></div>";
    }).join("");
    return '<div class="panel"><div class="ph">Screenshot overlay <span class="muted" style="font-weight:400">· hover a hotspot, click to open the component</span></div><div class="pb">' +
      seg + '<div class="shot" id="shotWrap"><img id="shotImg" src="' + esc(first) + '" alt="page screenshot">' + hots + "</div></div></div>";
  }

  // ============ COMPONENTS (virtualized) ============
  views.components = function (param) {
    if (param && idx.component[param]) return componentDetail(idx.component[param]);
    var types = uniq(M.components.map(function (c) { return c.type; })).sort();
    return head("Components", M.components.length + " components discovered across " + M.pages.length + " pages. Filter, sort, and open any component for full detail.") +
      '<div class="toolbar"><input class="input" id="cFilter" placeholder="Filter by label / function…" style="min-width:240px">' +
      '<select class="input" id="cType"><option value="">All types (' + M.components.length + ")</option>" + types.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + " (" + M.components.filter(function (c) { return c.type === t; }).length + ")</option>"; }).join("") + "</select>" +
      '<label class="row" style="font-size:12.5px"><input type="checkbox" id="cGlobal"> global only</label>' +
      '<span class="spacer"></span><a class="tbtn" href="#/screenshots">▣ Component gallery</a></div>' +
      '<div id="cResult"></div>';
  };
  views.components.after = function () {
    var f = $("#cFilter"), tSel = $("#cType"), gl = $("#cGlobal"), out = $("#cResult");
    if (!out) return;
    function render() {
      var q = (f.value || "").toLowerCase(), t = tSel.value, g = gl.checked;
      var list = M.components.filter(function (c) {
        if (t && c.type !== t) return false; if (g && c.scope !== "global") return false;
        if (q && (c.label + " " + (c.businessFunction || "") + " " + (c.inferredPurpose || "") + " " + c.type).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      out.innerHTML = '<div class="between" style="margin-bottom:.5rem"><span class="dim">' + list.length + " components</span></div>" +
        virtualList(list, 46, function (c) {
          return '<div class="vrow" onclick="location.hash=\'#/components/' + encodeURIComponent(c.id) + '\'">' +
            '<span class="tag">' + esc(c.type) + "</span>" +
            '<span style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.label || c.type) + "</b>" +
            '<span class="muted" style="font-size:12px">' + esc(c.businessFunction || "") + (c.behavior ? " · " + esc(c.behavior) : "") + "</span></span>" +
            (c.scope === "global" ? '<span class="badge a">global</span>' : "") + (c.manualReview ? ' <span class="badge r">⚑</span>' : "") + conf(c.confidence) + "</div>";
        });
    }
    f.oninput = render; tSel.onchange = render; gl.onchange = render; render();
  };
  function componentDetail(c) {
    var apis = (c.triggersApi || []).map(function (id) { return chip(id, label(id), "apis"); }).join(" ");
    var leads = (c.leadsTo || []).map(function (id) { return chip(id, label(id), id.indexOf("PAGE:") === 0 ? "pages" : "components"); }).join(" ");
    return crumb(['<a href="#/components">Components</a>', esc(c.label || c.type)]) +
      head(c.label || c.type, esc(c.inferredPurpose || "")) +
      '<div class="panel"><div class="pb"><div class="kv-list">' +
        '<dt>Type</dt><dd><span class="tag">' + esc(c.type) + "</span></dd>" +
        "<dt>Business function</dt><dd>" + esc(c.businessFunction || "—") + "</dd>" +
        "<dt>Purpose</dt><dd>" + esc(c.inferredPurpose || "—") + "</dd>" +
        (c.behavior ? "<dt>Observed behaviour</dt><dd>" + esc(c.behavior) + "</dd>" : "") +
        (leads ? "<dt>Leads to</dt><dd>" + leads + "</dd>" : "") +
        (c.partOfFlow ? "<dt>Part of flow</dt><dd>" + chip(c.partOfFlow, label(c.partOfFlow), "flows") + "</dd>" : "") +
        "<dt>Appears on</dt><dd>" + (c.scope === "global" ? "Global — " + (c.appearsOn || []).length + " pages" : chip(c.page, label(c.page), "pages")) + "</dd>" +
        (apis ? "<dt>Related APIs</dt><dd>" + apis + "</dd>" : "") +
        "<dt>Accessibility role</dt><dd>" + esc(c.ariaRole || "—") + "</dd>" +
        '<dt>Selector</dt><dd class="mono" style="word-break:break-all">' + esc(c.selector) + "</dd>" +
        "<dt>Confidence</dt><dd>" + conf(c.confidence) + "</dd>" +
        "<dt>Manual review</dt><dd>" + (c.manualReview ? '<span class="badge r">Required</span> ' + esc(c.manualReviewReason || "") : "Not required") + "</dd>" +
      "</div>" + confReason(c) + "</div></div>";
  }

  // ============ SIMPLE TABLE VIEWS ============
  views.navigation = function () {
    return head("Navigation", (M.navigation || []).length + " navigation structures discovered.") +
      tableWrap(["Label", "Type", "Scope", "Links"], (M.navigation || []).map(function (n) {
        return "<tr><td><b>" + esc(n.label || n.type) + "</b></td><td>" + esc(n.type) + "</td><td>" + esc(n.scope) + "</td><td>" + (n.items ? n.items.length : 0) + "</td></tr>";
      }).join(""));
  };
  views.forms = function (param) {
    if (param && idx.form[param]) return formDetail(idx.form[param]);
    return head("Forms", (M.forms || []).length + " form(s) discovered. Fields and observed client-side validation attributes are catalogued — forms are never submitted.") +
      tableWrap(["Form", "Page", "Fields", "Required", "Validation attrs"], (M.forms || []).map(function (f) {
        return '<tr onclick="location.hash=\'#/forms/' + encodeURIComponent(f.id) + '\'" style="cursor:pointer"><td><b>' + esc(f.name) + "</b></td><td>" + esc(label(f.page)) + "</td><td>" + f.fieldCount + "</td><td>" + (f.requiredFields || []).length + "</td><td>" + (f.validationAttributesObserved || []).map(function (v) { return '<span class="tag">' + esc(v) + "</span>"; }).join(" ") + "</td></tr>";
      }).join(""));
  };
  function formDetail(f) {
    return crumb(['<a href="#/forms">Forms</a>', esc(f.name)]) + head(f.name, "Discovered on " + esc(label(f.page)) + " — " + f.fieldCount + " field(s). Not submitted.") +
      tableWrap(["Field", "Name", "Type", "Required", "Validation observed"], (f.fields || []).map(function (fl) {
        return "<tr><td>" + esc(fl.label || "—") + "</td><td class=\"mono\">" + esc(fl.name || "") + "</td><td>" + esc(fl.type) + "</td><td>" + (fl.required ? "yes" : "no") + "</td><td>" + (fl.validationAttributesObserved || []).map(function (v) { return '<span class="tag">' + esc(v) + "</span>"; }).join(" ") + "</td></tr>";
      }).join(""));
  }
  views.states = function () {
    return head("States", (M.states || []).length + " UI state(s) — observed through safe exploration or declared where not reached.") +
      tableWrap(["State", "Type", "Applies to", "Observed", "How"], (M.states || []).map(function (s) {
        return "<tr><td><b>" + esc(s.label) + "</b></td><td>" + esc(s.type) + "</td><td>" + esc(label(s.appliesTo)) + "</td><td>" + (s.observed ? '<span class="badge g">observed</span>' : '<span class="badge n">declared</span>') + "</td><td>" + esc(s.observationMethod || "") + "</td></tr>";
      }).join(""));
  };
  views.hidden = function () {
    return head("Hidden Elements", (M.hidden || []).length + " hidden/conditional element(s) revealed by active probing — each with the interaction that exposed it.") +
      tableWrap(["Type", "Reveal trigger", "Page", "Reproducible"], (M.hidden || []).map(function (h) {
        return "<tr><td><b>" + esc(tc(h.type.replace(/-/g, " "))) + "</b></td><td class=\"mono\">" + esc(h.revealTrigger) + "</td><td>" + esc(label(h.page)) + "</td><td>" + (h.reproducible ? "yes" : "no") + "</td></tr>";
      }).join(""));
  };
  views.apis = function () {
    return head("API Map", (M.apis || []).length + " UI→endpoint correlation(s). Map only — endpoints are never called, fuzzed, or validated.") +
      tableWrap(["Endpoint", "Trigger", "Transport", "Auth signal", "Status seen"], (M.apis || []).map(function (a) {
        return "<tr><td class=\"mono\">" + esc(a.endpointPattern) + "</td><td>" + esc(a.triggeringAction) + "</td><td>" + esc(a.transport) + "</td><td>" + esc(a.authSignalObserved) + "</td><td>" + (a.sampleStatus == null ? "—" : a.sampleStatus) + "</td></tr>";
      }).join(""));
  };

  // ============ FLOWS ============
  views.flows = function (param) {
    if (param && idx.flow[param]) return flowDetail(idx.flow[param]);
    if (!(M.flows || []).length) return head("Flows", "") + '<div class="empty">No multi-step user flows were inferred from the reachable surface.</div>';
    return head("Flows", (M.flows || []).length + " user journey(s) inferred as ordered step chains. Discovery only — not executed or verified.") +
      (M.flows || []).map(function (f) {
        return '<div class="panel" style="margin-bottom:.85rem"><div class="ph">' + esc(f.name) + " " + conf(f.confidence) + "</div><div class=\"pb\">" +
          flowGraph(f) + confReason(f) + "</div></div>";
      }).join("");
  };
  function flowGraph(f) {
    var steps = (f.steps || []).map(function (s) { return { id: s.pageId || s.componentId || "", label: s.action + (s.pageId ? " (" + label(s.pageId) + ")" : "") }; });
    (f.terminalOutcomes || []).forEach(function (t) { steps.push({ id: "", label: t, terminal: true }); });
    return '<div class="row" style="gap:.4rem;flex-wrap:wrap">' + steps.map(function (s, i) {
      var clk = s.id ? ' onclick="location.hash=\'#/' + (s.id.indexOf("PAGE:") === 0 ? "pages" : "components") + "/" + encodeURIComponent(s.id) + "'\" style=\"cursor:pointer\"" : "";
      return '<span class="chip' + (s.terminal ? "" : " click") + '"' + clk + ">" + (i + 1) + ". " + esc(s.label) + "</span>" + (i < steps.length - 1 ? '<span class="muted">→</span>' : "");
    }).join("") + "</div>";
  }
  function flowDetail(f) { return crumb(['<a href="#/flows">Flows</a>', esc(f.name)]) + head(f.name, "") + '<div class="panel"><div class="pb">' + flowGraph(f) + "</div></div>"; }

  // ============ RELATIONSHIPS (svg graph) ============
  views.relationships = function () {
    return head("Feature Relationships", "Inferred feature-to-feature graph — how capabilities connect. Descriptive only.") +
      '<div class="graphwrap" id="relGraph" style="height:460px"></div>';
  };
  views.relationships.after = function () { drawGraph($("#relGraph"), (M.featureRel.nodes || []).map(function (id) { return { id: id, label: tc(id.replace(/^FEAT:|^FEATNODE:/, "").replace(/-/g, " ")) }; }), (M.featureRel.edges || []).map(function (e) { return { from: e.from, to: e.to, kind: e.kind }; })); };

  function drawGraph(wrap, nodes, edges) {
    if (!wrap) return;
    if (!nodes.length) { wrap.innerHTML = '<div class="empty" style="border:0">No relationships inferred.</div>'; return; }
    var W = wrap.clientWidth || 800, H = wrap.clientHeight || 440;
    // simple layered layout by longest-path depth
    var depth = {}; nodes.forEach(function (n) { depth[n.id] = 0; });
    for (var it = 0; it < nodes.length; it++) edges.forEach(function (e) { if (depth[e.to] <= depth[e.from]) depth[e.to] = depth[e.from] + 1; });
    var byDepth = {}; nodes.forEach(function (n) { (byDepth[depth[n.id]] = byDepth[depth[n.id]] || []).push(n); });
    var maxD = Math.max.apply(null, Object.keys(byDepth).map(Number)) || 0;
    var pos = {};
    Object.keys(byDepth).forEach(function (d) {
      var col = byDepth[d]; col.forEach(function (n, i) {
        pos[n.id] = { x: 40 + (maxD ? (d / maxD) * (W - 220) : (W - 160) / 2), y: (H / (col.length + 1)) * (i + 1) };
      });
    });
    var NW = 150, NH = 40;
    var svgEdges = edges.map(function (e) {
      var a = pos[e.from], b = pos[e.to]; if (!a || !b) return "";
      var x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      return '<path class="gedge" d="M' + x1 + " " + y1 + " C" + mx + " " + y1 + " " + mx + " " + y2 + " " + x2 + " " + y2 + '"></path>';
    }).join("");
    var svgNodes = nodes.map(function (n) {
      var p = pos[n.id];
      return '<g class="gnode" onclick="location.hash=\'#/modules\'"><rect x="' + p.x + '" y="' + p.y + '" width="' + NW + '" height="' + NH + '" rx="8"></rect><text x="' + (p.x + NW / 2) + '" y="' + (p.y + NH / 2 + 4) + '" text-anchor="middle">' + esc(n.label.slice(0, 20)) + "</text></g>";
    }).join("");
    wrap.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--border-strong)"></path></marker></defs>' + svgEdges + svgNodes + "</svg>";
  }

  // ============ SCREENSHOTS / GALLERY ============
  views.screenshots = function () {
    var pagesWith = M.pages.filter(function (p) { var s = (M.screenshots || {})[p.screenshotKey]; return s && (s.desktop || s.tablet || s.mobile); });
    var gallery = groupBy(M.components, function (c) { return c.type; });
    var galHtml = Object.keys(gallery).sort().map(function (t) {
      return '<h2 class="sec">' + esc(t) + " <span class=\"muted\" style=\"font-weight:400\">(" + gallery[t].length + ")</span></h2><div class=\"chips\">" +
        gallery[t].slice(0, 40).map(function (c) { return chip(c.id, c.label || c.type, "components"); }).join("") + (gallery[t].length > 40 ? ' <span class="muted">+' + (gallery[t].length - 40) + "</span>" : "") + "</div>";
    }).join("");
    return head("Screenshots & Component Gallery", "Annotated page screenshots (where captured) and every component grouped by type.") +
      (pagesWith.length ? '<h2 class="sec">Annotated pages</h2><div class="chips">' + pagesWith.map(function (p) { return '<span class="chip click" onclick="location.hash=\'#/pages/' + encodeURIComponent(p.id) + '\'">▣ ' + esc(p.label) + "</span>"; }).join("") + "</div>"
        : '<div class="noshot" style="min-height:120px">📷 No page screenshots were captured in this run.<br><span class="muted">Component gallery below is built from the discovery model.</span></div>') +
      '<h2 class="sec">Component gallery</h2>' + galHtml;
  };

  // ============ QA CHECKLIST ============
  views.checklist = function () {
    var CK = M.checklist; var groups = [{ label: "Global", items: CK.global }].concat((CK.pageWise || []).map(function (pw) { return { label: pw.pageLabel, items: pw.items }; }));
    var total = groups.reduce(function (a, g) { return a + g.items.length; }, 0);
    return head("QA Checklist", "Tick-off items — bare labels naming a discovered surface. Not instructions, steps, or verdicts. Your ticks persist in this browser.") +
      '<div class="between"><div class="dim" id="ckCount"></div><button class="tbtn" id="ckReset">Reset ticks</button></div>' +
      '<div class="progressbar"><i id="ckBar" style="width:0"></i></div>' +
      '<div id="ckGroups">' + groups.map(function (g, gi) {
        return '<div class="ck-group"><h3>' + esc(g.label) + '</h3><div class="ck-items">' + g.items.map(function (it) {
          return '<span class="ck" data-id="' + esc(it.id) + '"><span class="box">✓</span>' + esc(it.label) + "</span>";
        }).join("") + "</div></div>";
      }).join("") + "</div>";
  };
  views.checklist.after = function () {
    var KEY = "qadisc:ck:" + M.meta.runId; var state = {}; try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
    function refresh() {
      var all = $$("#ckGroups .ck"), done = 0;
      all.forEach(function (el) { var on = !!state[el.getAttribute("data-id")]; el.classList.toggle("done", on); if (on) done++; });
      $("#ckCount").textContent = done + " of " + all.length + " ticked (" + (all.length ? Math.round(done / all.length * 100) : 0) + "%)";
      $("#ckBar").style.width = (all.length ? done / all.length * 100 : 0) + "%";
    }
    $$("#ckGroups .ck").forEach(function (el) { el.onclick = function () { var id = el.getAttribute("data-id"); state[id] = !state[id]; save(); refresh(); }; });
    $("#ckReset").onclick = function () { state = {}; save(); refresh(); };
    refresh();
  };

  // ============ MANUAL REVIEW ============
  views["manual-review"] = function () {
    if (!(M.manualReview || []).length) return head("Manual Review Required", "") + '<div class="empty">Nothing was blocked — auto-discovery reached everything it attempted.</div>';
    return head("Manual Review Required", "Where automated discovery was blocked and a human must go explore. Not a to-test list — a hand-off pointer.") +
      tableWrap(["Item", "Blocked by", "Why", "Where a human looks next", "Related"], (M.manualReview || []).map(function (e) {
        return "<tr><td><span class=\"badge r\">⚑ " + esc(tc((e.blockerType || "").replace(/_/g, " "))) + "</span></td><td>" + esc(e.blockerType) + "</td><td>" + esc(e.reason) + "</td><td>" + esc(e.humanShouldLookAt) + "</td><td>" + (e.relatedIds || []).slice(0, 4).map(function (id) { return '<span class="tag">' + esc(id) + "</span>"; }).join(" ") + "</td></tr>";
      }).join(""));
  };

  // ============ COVERAGE MAP ============
  views.coverage = function () {
    var mods = (M.coverageMap || []).filter(function (h) { return h.kind === "module"; });
    var pages = (M.coverageMap || []).filter(function (h) { return h.kind === "page"; });
    return head("Coverage Map", "Discovery status per module and page (the requested visual coverage view). Green = discovered, yellow = partial, red = blocked (manual review), gray = low certainty. This maps discovery only.") +
      legend() + '<h2 class="sec">Business modules</h2><div class="heat">' + mods.map(heatCell).join("") + "</div>" +
      '<h2 class="sec">Pages</h2><div class="heat">' + pages.map(heatCell).join("") + "</div>";
  };

  // ============ TIMELINE ============
  views.timeline = function () {
    return head("Discovery Timeline", "Replay how the crawl explored the application, step by step.") +
      '<div class="tlctl"><button class="tbtn" id="tlPlay">▶ Replay</button><button class="tbtn" id="tlAll">Show all</button><span class="dim" id="tlStat"></span></div>' +
      '<div class="tl" id="tl">' + (M.timeline || []).map(function (e) {
        return '<div class="ev ' + e.kind + '" data-seq="' + e.seq + '"><div class="el">' + esc(e.label) + "</div><div class=\"ed\">" + esc(e.detail || "") + "</div></div>";
      }).join("") + "</div>";
  };
  views.timeline.after = function () {
    var evs = $$("#tl .ev"); var stat = $("#tlStat");
    $("#tlAll").onclick = function () { evs.forEach(function (e) { e.classList.remove("dim"); }); stat.textContent = evs.length + " events"; };
    $("#tlPlay").onclick = function () {
      evs.forEach(function (e) { e.classList.add("dim"); }); var i = 0;
      (function step() { if (i >= evs.length) { stat.textContent = "done"; return; } evs[i].classList.remove("dim"); evs[i].scrollIntoView({ block: "center", behavior: "smooth" }); stat.textContent = "step " + (i + 1) + " / " + evs.length; i++; setTimeout(step, 420); })();
    };
    $("#tlAll").onclick();
  };

  // ============ VALIDATION ============
  views.validation = function () {
    var v = M.validation; var s = M.summary;
    return head("Discovery Validation", "A self-audit of how thoroughly the crawl explored — process completeness, never application testing.") +
      '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:1rem">' +
        kpi(pct(s.discoveryConfidence), "Discovery Confidence") + kpi(pct(v.overallDiscoveryCompleteness), "Completeness") +
        kpi(s.pagesVisited, "Pages Visited") + kpi(s.pagesSkipped.length, "Skipped") +
        kpi(s.pagesNotReachable, "Not Reachable") + kpi(s.hiddenRevealed, "Hidden Revealed") +
        kpi(s.formsFound, "Forms Found") + kpi(s.authenticationProtected, "Auth Protected") +
      "</div>" +
      '<div class="panel"><div class="ph">Exploration technique checks</div><div class="pb">' +
        (v.checks || []).map(function (c) {
          var mark = c.status === "pass" ? '<span class="badge g">✔ pass</span>' : c.status === "blocked" ? '<span class="badge r">⛔ blocked</span>' : '<span class="badge y">⚠ ' + esc(c.status) + "</span>";
          return '<div class="between" style="padding:.4rem 0;border-bottom:1px solid var(--border)"><span>' + esc(tc(c.check.replace(/-/g, " "))) + '</span><span class="row">' + mark + '<span class="muted" style="font-size:12px;max-width:46ch;text-align:right">' + esc(c.detail) + "</span></span></div>";
        }).join("") + "</div></div>" +
      '<h2 class="sec">States observed vs not observed</h2><div class="row">' +
        (s.statesObserved || []).map(function (x) { return '<span class="badge g">' + esc(tc(x)) + "</span>"; }).join(" ") + " " +
        (s.statesNotObserved || []).map(function (x) { return '<span class="badge n">' + esc(tc(x.replace(/_/g, " "))) + "</span>"; }).join(" ") + "</div>";
  };

  // ============ ASSISTANT (deterministic query over the model) ============
  views.assistant = function () {
    var suggests = ["Show payment components", "Show pages containing exam", "Show hidden menus", "Show all forms", "Show components in Study Material", "Show everything behind authentication", "Show flows", "Show manual review"];
    return head("AI Assistant", "Ask about what was discovered. Answers come only from the discovery model — nothing is invented.") +
      '<div class="suggest">' + suggests.map(function (s) { return '<button onclick="portalAsk(this.textContent)">' + esc(s) + "</button>"; }).join("") + "</div>" +
      '<div class="panel chat"><div class="msgs" id="msgs"><div class="msg a">Hi — I answer from the discovery model of <b>' + esc(M.meta.appName) + "</b>. Try a suggestion above, or ask e.g. “show all tables” or “pages related to csir”. I only report what was discovered; I never evaluate or judge behaviour.</div></div>" +
      '<div class="compose"><input id="askInput" placeholder="Ask about pages, components, features, forms…" autocomplete="off"><button id="askBtn">Ask</button></div></div>';
  };
  views.assistant.after = function () {
    var inp = $("#askInput"); if (!inp) return;
    $("#askBtn").onclick = function () { portalAsk(inp.value); inp.value = ""; };
    inp.onkeydown = function (e) { if (e.key === "Enter") { portalAsk(inp.value); inp.value = ""; } };
  };
  window.portalAsk = function (q) {
    q = (q || "").trim(); if (!q) return;
    if (location.hash.replace(/^#\//, "").split("/")[0] !== "assistant") { go("assistant"); setTimeout(function () { window.portalAsk(q); }, 60); return; }
    var msgs = $("#msgs"); if (!msgs) return;
    msgs.innerHTML += '<div class="msg u">' + esc(q) + "</div>";
    var ans = answer(q);
    msgs.innerHTML += '<div class="msg a">' + ans + "</div>";
    msgs.scrollTop = msgs.scrollHeight;
  };
  function answer(q) {
    var ql = q.toLowerCase();
    function chips(list, r) { return list.length ? '<div class="res">' + list.slice(0, 40).map(function (x) { return chip(x.id, x.label || x.name || x.endpointPattern || x.type, r); }).join("") + "</div>" + (list.length > 40 ? '<div class="muted" style="font-size:12px">+' + (list.length - 40) + " more</div>" : "") : "";
    }
    // intent: behind authentication
    if (/behind (auth|login)|protected|require.*login|authenticated/.test(ql)) {
      var authPages = M.pages.filter(function (p) { return p.authRequired; });
      var mr = M.manualReview.filter(function (e) { return e.blockerType === "auth_gated"; });
      if (!authPages.length && !mr.length) return "No authentication-gated surface was reached as a guest. Auth-gated areas, if any, would appear under Manual Review.";
      return "Authentication-gated surface: " + chips(authPages, "pages") + (mr.length ? '<div class="muted" style="font-size:12px;margin-top:.4rem">' + mr.length + " auth block(s) in Manual Review.</div>" : "");
    }
    if (/hidden/.test(ql)) { return "Hidden elements discovered: " + (M.hidden.length ? chips(M.hidden.map(function (h) { return { id: h.id, label: tc(h.type.replace(/-/g, " ")) + " · " + h.revealTrigger }; }), "hidden") : "none."); }
    if (/all forms|^forms|show forms/.test(ql) || (/form/.test(ql) && !/component/.test(ql))) { return M.forms.length ? "Forms discovered: " + chips(M.forms, "forms") : "No forms were discovered."; }
    if (/flows?/.test(ql)) { return M.flows.length ? "User flows inferred: " + chips(M.flows, "flows") : "No flows were inferred."; }
    if (/manual review|blocked/.test(ql)) { return M.manualReview.length ? "Manual review items: " + M.manualReview.map(function (e) { return '<span class="chip">' + esc(tc((e.blockerType || "").replace(/_/g, " "))) + "</span>"; }).join(" ") : "Nothing needs manual review."; }
    // "components in <module/feature>"
    var inMatch = ql.match(/(?:in|inside|within|of)\s+([a-z0-9 &]+)$/);
    if (/component/.test(ql) && inMatch) {
      var term = inMatch[1].trim();
      var mod = M.modules.find(function (m) { return m.name.toLowerCase().indexOf(term) >= 0 || term.indexOf(m.name.toLowerCase()) >= 0; });
      if (mod) { var comps = mod.componentIds.map(function (id) { return idx.component[id]; }).filter(Boolean); return comps.length ? "Components in <b>" + esc(mod.name) + "</b>: " + chips(comps, "components") : "No components linked to " + esc(mod.name) + "."; }
    }
    // "pages containing/related X"
    var pMatch = ql.match(/pages?\s+(?:containing|with|related to|about|for|matching)\s+([a-z0-9 &-]+)$/);
    if (pMatch) { var t = pMatch[1].trim(); var ps = M.pages.filter(function (p) { return (p.label + " " + p.archetype + " " + p.url).toLowerCase().indexOf(t) >= 0; }); return ps.length ? "Pages matching “" + esc(t) + "”: " + chips(ps, "pages") : "No pages match “" + esc(t) + "”."; }
    // generic keyword search across the index
    var terms = ql.replace(/^(show|find|list|all|the|me|give)\s+/g, "").replace(/\bcomponents?\b|\bpages?\b/g, "").trim();
    var kw = terms || ql;
    var hits = M.searchIndex.filter(function (e) { return e.keywords.indexOf(kw) >= 0; });
    // narrow by explicit kind
    if (/component/.test(ql)) hits = hits.filter(function (e) { return e.kind === "component"; });
    else if (/page/.test(ql)) hits = hits.filter(function (e) { return e.kind === "page"; });
    else if (/table/.test(ql)) hits = M.components.filter(function (c) { return c.type === "table"; }).map(function (c) { return { id: c.id, label: c.label, kind: "component", view: "components" }; });
    else if (/button/.test(ql)) hits = M.components.filter(function (c) { return c.type === "button"; }).map(function (c) { return { id: c.id, label: c.label, kind: "component", view: "components" }; });
    else if (/chart/.test(ql)) hits = M.components.filter(function (c) { return c.type === "chart"; }).map(function (c) { return { id: c.id, label: c.label, kind: "component", view: "components" }; });
    if (!hits.length) return "I found nothing matching “" + esc(q) + "” in the discovery model. Try a page name, a component type (button, table, form), or a module (e.g. Payment).";
    var byKind = groupBy(hits, function (h) { return h.kind; });
    return "Found " + hits.length + " match(es):" + Object.keys(byKind).map(function (k) {
      return '<div style="margin-top:.4rem"><b>' + tc(k) + "s</b> <div class=\"res\">" + byKind[k].slice(0, 24).map(function (h) { return chip(h.id, h.label, h.view); }).join("") + "</div></div>";
    }).join("");
  }

  // ============ SETTINGS / EXPORTS ============
  views.settings = function () {
    return head("Settings & Exports", "Everything below is derived from the same discovery model.") +
      '<div class="split"><div class="panel"><div class="ph">⤓ Exports</div><div class="pb">' +
        '<div class="chips" style="gap:.5rem">' +
        '<button class="tbtn" onclick="portalExport(\'json\')">JSON (model)</button>' +
        '<button class="tbtn" onclick="portalExport(\'md\')">Markdown</button>' +
        '<button class="tbtn" onclick="portalExport(\'components-csv\')">Components CSV</button>' +
        '<button class="tbtn" onclick="portalExport(\'pages-csv\')">Pages CSV</button>' +
        '<button class="tbtn" onclick="portalExport(\'checklist-csv\')">Checklist CSV</button>' +
        '<button class="tbtn" onclick="window.print()">PDF / Print</button>' +
        "</div><p class=\"muted\" style=\"font-size:12.5px;margin-top:.7rem\">This portal is itself the interactive HTML export. JSON/CSV/Markdown download the same discovered data. PDF uses your browser’s print dialog.</p></div></div>" +
        '<div class="panel"><div class="ph">⚙ Preferences</div><div class="pb"><div class="kv-list">' +
          "<dt>Theme</dt><dd><button class=\"tbtn\" onclick=\"document.getElementById('themeBtn').click()\">Toggle dark / light</button></dd>" +
          "<dt>Roles crawled</dt><dd>" + M.meta.roles.map(tc).join(", ") + "</dd>" +
          "<dt>Run ID</dt><dd class=\"mono\">" + esc(M.meta.runId) + "</dd>" +
          "<dt>Generated</dt><dd>" + esc(M.meta.generatedAt) + "</dd>" +
        "</div></div></div></div>" +
      '<div class="panel" style="margin-top:.85rem"><div class="ph">Scope</div><div class="pb dim" style="font-size:13px">Discovery only — this portal presents what exists in the application for a human tester to explore. It does not evaluate behaviour, produce verdicts, or exercise any API.</div></div>';
  };
  window.portalExport = function (kind) {
    var name, data, mime = "text/plain";
    if (kind === "json") { name = M.meta.runId.replace(/[^\w]/g, "_") + "-model.json"; data = JSON.stringify(M, null, 2); mime = "application/json"; }
    else if (kind === "md") { name = "discovery.md"; data = toMarkdown(); mime = "text/markdown"; }
    else if (kind === "components-csv") { name = "components.csv"; data = csv(["id", "type", "label", "page", "scope", "businessFunction", "confidence"], M.components.map(function (c) { return [c.id, c.type, c.label, c.page, c.scope, c.businessFunction || "", c.confidence]; })); mime = "text/csv"; }
    else if (kind === "pages-csv") { name = "pages.csv"; data = csv(["id", "label", "url", "components", "forms", "confidence"], M.pages.map(function (p) { return [p.id, p.label, p.url, p.componentIds.length, p.formIds.length, p.confidence]; })); mime = "text/csv"; }
    else if (kind === "checklist-csv") { name = "checklist.csv"; var rows = []; (M.checklist.global || []).forEach(function (i) { rows.push(["Global", i.label]); }); (M.checklist.pageWise || []).forEach(function (pw) { pw.items.forEach(function (i) { rows.push([pw.pageLabel, i.label]); }); }); data = csv(["scope", "item"], rows); mime = "text/csv"; }
    var blob = new Blob([data], { type: mime }); var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
  function csv(headers, rows) { function q(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; } return headers.join(",") + "\n" + rows.map(function (r) { return r.map(q).join(","); }).join("\n"); }
  function toMarkdown() {
    var L = ["# QA Discovery — " + M.meta.appName, "", "URL: " + M.meta.appUrl, "Run: " + M.meta.runId, "Roles: " + M.meta.roles.map(tc).join(", "), "", "> Discovery only — what exists, never how to test it.", "", "## Inventory"];
    Object.keys(M.kpis).forEach(function (k) { L.push("- " + k + ": " + M.kpis[k]); });
    L.push("", "## Business Modules");
    M.modules.forEach(function (m) { L.push("- " + m.name + " (" + m.features.map(function (f) { return f.label; }).join(", ") + ")"); });
    L.push("", "## Pages");
    M.pages.forEach(function (p) { L.push("- " + p.label + " — " + p.url); });
    L.push("", "## Manual Review Required");
    M.manualReview.forEach(function (e) { L.push("- " + tc((e.blockerType || "").replace(/_/g, " ")) + ": " + e.reason); });
    return L.join("\n") + "\n";
  }

  // ============ SEARCH ============
  function wireSearch() {
    var input = $("#q"), box = $("#results"); var sel = -1, cur = [];
    function render(list) {
      cur = list; sel = -1;
      box.innerHTML = list.length ? list.map(function (e, i) {
        return '<div class="r" data-i="' + i + '"><span class="rk">' + e.kind + '</span><span class="rl">' + esc(e.label) + '</span><span class="rh">' + esc(e.hint) + "</span></div>";
      }).join("") : '<div class="r"><span class="rl muted">No matches</span></div>';
      box.classList.add("open");
      $$(".r", box).forEach(function (r) { r.onclick = function () { var i = +r.getAttribute("data-i"); if (cur[i]) { go(cur[i].view, cur[i].id); close(); } }; });
    }
    function search(q) { q = q.toLowerCase().trim(); if (!q) { close(); return; } var list = M.searchIndex.filter(function (e) { return e.keywords.indexOf(q) >= 0; }).slice(0, 40); render(list); }
    function close() { box.classList.remove("open"); }
    input.oninput = function () { search(input.value); };
    input.onkeydown = function (e) {
      var rows = $$(".r", box);
      if (e.key === "ArrowDown") { sel = Math.min(sel + 1, rows.length - 1); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); e.preventDefault(); }
      else if (e.key === "Enter") { if (cur[sel]) { go(cur[sel].view, cur[sel].id); close(); input.blur(); } return; }
      else if (e.key === "Escape") { close(); input.blur(); return; }
      rows.forEach(function (r, i) { r.classList.toggle("sel", i === sel); });
      if (rows[sel]) rows[sel].scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("click", function (e) { if (!e.target.closest(".searchbox")) close(); });
    document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.focus(); input.select(); } });
  }

  // ============ VIRTUAL LIST ============
  var vseq = 0;
  function virtualList(items, rowH, renderRow) {
    var id = "vl" + (vseq++); var H = Math.min(items.length * rowH, 620);
    setTimeout(function () {
      var wrap = document.getElementById(id); if (!wrap) return;
      var inner = wrap.firstChild;
      function paint() {
        var top = wrap.scrollTop, vh = wrap.clientHeight;
        var start = Math.max(0, Math.floor(top / rowH) - 6), end = Math.min(items.length, Math.ceil((top + vh) / rowH) + 6);
        var html = ""; for (var i = start; i < end; i++) html += '<div style="position:absolute;top:' + (i * rowH) + "px;left:0;right:0;height:" + rowH + 'px">' + renderRow(items[i]) + "</div>";
        inner.innerHTML = html;
      }
      wrap.onscroll = paint; paint();
    }, 0);
    return '<div class="vlist" id="' + id + '" style="height:' + H + 'px"><div style="position:relative;height:' + (items.length * rowH) + 'px">' + "</div></div>";
  }

  // ============ misc utils ============
  function tableWrap(headers, rowsHtml) {
    return '<div class="tblwrap"><table class="tbl"><thead><tr>' + headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" + (rowsHtml || '<tr><td colspan="' + headers.length + '" class="empty" style="border:0">Nothing discovered.</td></tr>') + "</tbody></table></div>";
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function groupBy(a, fn) { var o = {}; a.forEach(function (x) { var k = fn(x); (o[k] = o[k] || []).push(x); }); return o; }
  function safe(s) { return String(s).replace(/[^\w]/g, "_"); }

  // wire screenshot segmented control (delegated)
  document.addEventListener("click", function (e) {
    var b = e.target.closest("#segShot button"); if (!b) return;
    var v = b.getAttribute("data-v"); var set = (M.screenshots || {})[curPageKey()]; if (!set) return;
    $$("#segShot button").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on");
    var img = $("#shotImg"); if (img && set[v]) img.src = set[v];
  });
  function curPageKey() { var h = location.hash.split("/"); var p = idx.page[decodeURIComponent(h[2] || "")]; return p ? p.screenshotKey : ""; }

  // ---- boot ----
  shell();
  if (!location.hash) location.hash = "#/dashboard";
  route();
})();
