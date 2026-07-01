/**
 * Output, Reports & Interactive Tree UI (Phase 8).
 *
 * Renders the SEVEN deliverables (+ Feature Relationships, Discovery Validation,
 * confidence badges, semantics) as report.md + a self-contained report.html +
 * bundle.json. Pure, deterministic. Discovery only — no test cases anywhere.
 */

import { titleCase } from "../core/ids.js";
import { makeEnvelope, type Envelope } from "../core/envelope.js";
import type { DiscoveryModel } from "../core/types.js";
import type { ApplicationOverview, QaInventory } from "./inventory.js";
import type { FeatureRelationships, FeatureTree, FeatureNode } from "./feature-tree.js";
import type { QaMap } from "./qa-map.js";
import type { QaChecklist } from "./checklist.js";
import type { DiscoverySummary, DiscoveryValidation, ManualReview } from "./summary.js";

export interface ReportInputs {
  model: DiscoveryModel;
  overview: ApplicationOverview;
  inventory: QaInventory;
  featureTree: FeatureTree;
  featureRel: FeatureRelationships;
  qaMap: QaMap;
  checklist: QaChecklist;
  summary: DiscoverySummary;
  manualReview: ManualReview;
  validation: DiscoveryValidation;
}

export interface Bundle extends Envelope {
  artifact: "report_bundle";
  deliverables: {
    application_overview: ApplicationOverview;
    qa_inventory: QaInventory;
    business_feature_tree: FeatureTree;
    feature_relationships: FeatureRelationships;
    hierarchical_qa_map: QaMap;
    qa_checklist: QaChecklist;
    discovery_summary: DiscoverySummary;
    manual_review_required: ManualReview;
    discovery_validation: DiscoveryValidation;
  };
}

export function buildBundle(inp: ReportInputs, generatedAt: string): Bundle {
  const envelope = makeEnvelope({
    artifact: "report_bundle",
    artifactId: inp.model.runId + ":bundle",
    runId: inp.model.runId,
    appUrl: inp.model.appUrl,
    roles: inp.model.roles.map((r) => r.name),
    sourceArtifacts: ["discovery-model.json", "qa-map.json", "qa-checklist.json"],
    generatedAt,
  });
  return {
    ...envelope,
    artifact: "report_bundle",
    deliverables: {
      application_overview: inp.overview,
      qa_inventory: inp.inventory,
      business_feature_tree: inp.featureTree,
      feature_relationships: inp.featureRel,
      hierarchical_qa_map: inp.qaMap,
      qa_checklist: inp.checklist,
      discovery_summary: inp.summary,
      manual_review_required: inp.manualReview,
      discovery_validation: inp.validation,
    },
  };
}

export function renderReportMd(inp: ReportInputs): string {
  const L: string[] = [];
  L.push(`# QA Discovery Report — ${inp.model.appUrl}`);
  L.push("");
  L.push(`Run: ${inp.model.runId} · Generated: ${inp.model.generatedAt} · Roles: ${inp.model.roles.map((r) => titleCase(r.name)).join(", ")}`);
  L.push("");
  L.push(`> **Discovery only** — this report catalogs *what exists*, never whether it works. The agent discovers and organizes; the human does the testing.`);
  L.push("");
  L.push(`## Contents`);
  L.push(`1. [Application Overview](application-overview.md)`);
  L.push(`2. [QA Inventory](qa-inventory.md)`);
  L.push(`3. [Business Feature Tree](feature-tree.md) · [Feature Relationships](feature-relationships.md)`);
  L.push(`4. [Hierarchical QA Map](qa-map.md) · [Interactive tree](report.html)`);
  L.push(`5. [QA Checklist](qa-checklist.md)`);
  L.push(`6. [Discovery Summary](discovery-summary.md) · [Discovery Validation](discovery-validation.md)`);
  L.push(`7. [Manual Review Required](manual-review.md)`);
  L.push(`- [Discovery Model](discovery-model.md)`);
  L.push("");
  L.push(`## At a glance`);
  const c = inp.inventory.counts;
  L.push(`- Pages: ${c.totalPages} · Components: ${c.totalComponents} · Flows: ${c.businessFlows} · Forms: ${c.forms} · APIs (mapped): ${c.apiCalls}`);
  L.push(`- Discovery Confidence: ${inp.summary.discoveryConfidence}% · Discovery Completeness: ${inp.validation.overallDiscoveryCompleteness}%`);
  L.push(`- Manual Review items: ${inp.manualReview.entries.length}`);
  L.push("");
  return L.join("\n") + "\n";
}

function badge(conf?: number, reason?: string | null): string {
  if (conf == null) return "";
  if (conf < 80) return ` <span class="badge low">Confidence ${conf}% — ${escapeHtml(reason || "low")}</span>`;
  return ` <span class="badge">Confidence ${conf}%</span>`;
}
function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function featureNodeHtml(n: FeatureNode): string {
  const kids = n.children.length
    ? `<ul>${n.children.map(featureNodeHtml).join("")}</ul>`
    : "";
  return `<li><span class="lbl">${escapeHtml(n.label)}${badge(n.confidence, n.confidenceReason)} <small class="rid">${n.id}</small></span>${kids}</li>`;
}

export function renderReportHtml(inp: ReportInputs): string {
  const m = inp.model;
  const c = inp.inventory.counts;
  const cards = [
    ["Pages", c.totalPages], ["Components", c.totalComponents], ["Flows", c.businessFlows],
    ["Forms", c.forms], ["Buttons", c.buttons], ["Dropdowns", c.dropdowns],
    ["Tables", c.tables], ["Charts", c.charts], ["API Calls", c.apiCalls],
    ["Dialogs", c.dialogs], ["Hidden Menus", c.hiddenMenus], ["States", c.states], ["Roles", c.roles],
  ].map(([k, v]) => `<div class="card"><b>${v}</b><span>${k}</span></div>`).join("");

  // semantics lookup for map/overview items
  const semById = new Map(m.components.map((x) => [x.id, x]));
  const semLine = (refId?: string) => {
    if (!refId) return "";
    const it = semById.get(refId);
    if (!it || it.businessFunction === "unknown") return "";
    const parts = [it.businessFunction, it.behavior || it.inferredPurpose, it.partOfFlow ? "part of " + it.partOfFlow : ""].filter(Boolean);
    return ` <span class="sem">— ${escapeHtml(parts.join(" · "))}</span>`;
  };

  const overviewHtml = `
   <p><b>Pages Found:</b> ${inp.overview.pagesFound.map((p) => escapeHtml(p.label)).join(", ")}</p>
   <p><b>Global Components:</b> ${inp.overview.globalComponents.map((g) => escapeHtml(g.label)).join(", ")}</p>
   ${inp.overview.pageComponents.filter((pc) => pc.components.length).map((pc) => `<p><b>${escapeHtml(pc.pageLabel)} — Components Found:</b> ${pc.components.map((x) => escapeHtml(x.label)).join(", ")}</p>`).join("")}
   ${inp.overview.businessFlows.map((f) => `<p><b>${escapeHtml(f.label)} — Steps:</b> ${f.steps.map((s) => escapeHtml(s.label)).join(" → ")}</p>`).join("")}`;

  const relChains = (() => {
    const byFrom = new Map(inp.featureRel.edges.map((e) => [e.from, e.to]));
    const starts = inp.featureRel.nodes.filter((n) => !inp.featureRel.edges.some((e) => e.to === n));
    return starts.map((s) => {
      const chain = [s]; let cur = s; const seen = new Set([s]);
      while (byFrom.has(cur)) { const nx = byFrom.get(cur)!; if (seen.has(nx)) break; chain.push(nx); seen.add(nx); cur = nx; }
      return chain.map((x) => titleCase(x.replace("FEAT:", "").replace(/-/g, " "))).join(" → ");
    }).map((chain) => `<p>${escapeHtml(chain)}</p>`).join("");
  })();

  const checklistHtml = `
    <h3>Global Checklist</h3>
    <p>${inp.checklist.global.map((i) => `<label class="chk"><input type="checkbox">${escapeHtml(i.label)}</label>`).join(" ")}</p>
    <h3>Page-wise Checklist</h3>
    ${inp.checklist.pageWise.map((pw) => `<p><b>${escapeHtml(pw.pageLabel)}:</b> ${pw.items.map((i) => `<label class="chk"><input type="checkbox">${escapeHtml(i.label)}</label>`).join(" ")}</p>`).join("")}`;

  const summaryHtml = `
    <p>URL Crawled: ${escapeHtml(inp.summary.urlCrawled)}</p>
    <p>Pages Visited: ${inp.summary.pagesVisited} | Pages Skipped: ${inp.summary.pagesSkipped.length}</p>
    <p>Roles Crawled: ${inp.summary.rolesCrawled.map((r) => `[x] ${titleCase(r)}`).join("  ")}</p>
    <p>States Observed: ${inp.summary.statesObserved.map((s) => `[x] ${titleCase(s)}`).join("  ")}</p>
    <p>States Not Observed: ${inp.summary.statesNotObserved.map((s) => titleCase(s.replace(/_/g, " "))).join(", ") || "—"}</p>
    <p>Hidden Revealed: ${inp.summary.hiddenRevealed} | Lazy Sections: ${inp.summary.lazySections} | Forms Found: ${inp.summary.formsFound}</p>
    <p>Loops Prevented: ${inp.summary.loopsPrevented} | Max Crawl Depth: ${inp.summary.maxDepth}</p>
    <p><b>Discovery Confidence: ${inp.summary.discoveryConfidence}%</b></p>`;

  const valHtml = inp.validation.checks.map((ck) => `<p>${ck.status === "pass" ? "✔" : "⚠"} ${escapeHtml(titleCase(ck.check.replace(/-/g, " ")))} — ${escapeHtml(ck.detail)}</p>`).join("") +
    `<p><b>Overall Discovery Completeness: ${inp.validation.overallDiscoveryCompleteness}%</b></p>`;

  const mrHtml = `<table><tr><th>Item</th><th>Why Blocked</th><th>Where To Look</th></tr>${inp.manualReview.entries.map((e) => `<tr><td>${escapeHtml(mrLabel(e.blockerType))}</td><td>${escapeHtml(e.reason)}</td><td>${escapeHtml(e.humanShouldLookAt)}</td></tr>`).join("")}</table>`;

  const featureTreeHtml = `<ul>${inp.featureTree.root.children.map(featureNodeHtml).join("")}</ul>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>QA Discovery Report — ${escapeHtml(m.appUrl)}</title>
<style>
 body{font:14px/1.55 system-ui,sans-serif;margin:0;color:#1c1c1c;background:#fafafa}
 header{background:#0d1b2a;color:#fff;padding:1.2rem 1.5rem}
 header h1{margin:0;font-size:1.3rem} header .meta{color:#9fb3c8;font-size:.85rem;margin-top:.3rem}
 .disc{background:#fff8e1;border-left:4px solid #f0b429;padding:.6rem 1rem;margin:1rem 1.5rem;font-size:.9rem}
 nav.tabs{display:flex;flex-wrap:wrap;gap:.3rem;padding:0 1.5rem;background:#fff;border-bottom:1px solid #e2e2e2;position:sticky;top:0;z-index:5}
 nav.tabs button{border:0;background:none;padding:.7rem .9rem;cursor:pointer;font-size:.9rem;color:#456}
 nav.tabs button.active{border-bottom:2px solid #0d1b2a;color:#0d1b2a;font-weight:600}
 section.panel{display:none;padding:1.2rem 1.5rem;background:#fff;margin:1rem 1.5rem;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
 section.panel.active{display:block}
 .cards{display:flex;flex-wrap:wrap;gap:.6rem} .card{background:#eef2f7;border-radius:6px;padding:.7rem 1rem;min-width:90px;text-align:center}
 .card b{display:block;font-size:1.4rem} .card span{font-size:.75rem;color:#567}
 ul{list-style:none;padding-left:1.1rem} li{margin:.15rem 0}
 .lbl{cursor:default} .rid{color:#bbb;font-size:.72rem}
 .badge{font-size:.72rem;color:#0a7;background:#e6f7f0;border-radius:8px;padding:0 .4rem}
 .badge.low{color:#c60;background:#fff0e0}
 .sem{color:#8a6d3b;font-size:.82rem}
 .tw{cursor:pointer;width:1rem;display:inline-block;color:#888}
 .progress{font-weight:600;margin:.4rem 0;color:#0d1b2a}
 .chk{display:inline-block;margin:.15rem .4rem;font-size:.85rem}
 table{border-collapse:collapse;width:100%} td,th{border:1px solid #e2e2e2;padding:.4rem .6rem;text-align:left;font-size:.85rem;vertical-align:top}
 .tested>.row>.lbl{color:#0a0}.partial>.row>.lbl{color:#c90} .row{display:flex;gap:.4rem;align-items:center}
</style></head><body>
<header><h1>QA Discovery Report</h1><div class="meta">${escapeHtml(m.appUrl)} · ${m.runId} · roles: ${m.roles.map((r) => titleCase(r.name)).join(", ")} · ${m.generatedAt}</div></header>
<div class="disc"><b>Discovery only.</b> This report catalogs <i>what exists</i>, never whether it works. The agent discovers and organizes; the human does the testing.</div>
<nav class="tabs" id="tabs"></nav>
<section class="panel" data-tab="Overview"><h2>Application Overview</h2>${overviewHtml}</section>
<section class="panel" data-tab="Inventory"><h2>QA Inventory</h2><div class="cards">${cards}</div></section>
<section class="panel" data-tab="Feature Tree"><h2>Business Feature Tree</h2>${featureTreeHtml}<h3>Feature Relationships</h3>${relChains}</section>
<section class="panel" data-tab="QA Map"><h2>Hierarchical QA Map</h2><div class="progress" id="prog">0 of 0 ticked</div><div id="tree"></div></section>
<section class="panel" data-tab="Checklist"><h2>QA Checklist</h2>${checklistHtml}</section>
<section class="panel" data-tab="Discovery Summary"><h2>Discovery Summary</h2>${summaryHtml}<h3>Discovery Validation</h3>${valHtml}</section>
<section class="panel" data-tab="Manual Review"><h2>Manual Review Required</h2>${mrHtml}</section>
<script>
const MAP = ${JSON.stringify(inp.qaMap)};
const SEM = ${JSON.stringify(Object.fromEntries(m.components.map((x) => [x.id, { fn: x.businessFunction, b: x.behavior || x.inferredPurpose, flow: x.partOfFlow }])))};
const runId = MAP.runId; const K=(id)=>'qadisc:'+runId+':'+id;
function load(id){try{return localStorage.getItem(K(id))}catch(e){return null}}
function save(id,v){try{localStorage.setItem(K(id),v)}catch(e){}}
// tabs
const panels=[...document.querySelectorAll('.panel')]; const tabs=document.getElementById('tabs');
panels.forEach((p,i)=>{const b=document.createElement('button');b.textContent=p.dataset.tab;b.onclick=()=>{panels.forEach(x=>x.classList.remove('active'));[...tabs.children].forEach(x=>x.classList.remove('active'));p.classList.add('active');b.classList.add('active')};tabs.append(b);if(i===0){p.classList.add('active');b.classList.add('active')}});
// qa map interactive
function badge(n){if(n.confidence==null)return '';return n.confidence<80?' <span class="badge low">Confidence '+n.confidence+'% — '+(n.confidenceReason||'low')+'</span>':' <span class="badge">Confidence '+n.confidence+'%</span>';}
function semLine(n){const s=n.refId&&SEM[n.refId];if(!s||s.fn==='unknown')return '';const parts=[s.fn,s.b,s.flow?'part of '+s.flow:''].filter(Boolean);return ' <span class="sem">— '+parts.join(' · ')+'</span>';}
function render(node){const li=document.createElement('li');li.className=node.tickState;const row=document.createElement('div');row.className='row';const hk=node.children&&node.children.length;const tw=document.createElement('span');tw.className='tw';tw.textContent=hk?(node.collapsed?'▸':'▾'):'';const cb=document.createElement('input');cb.type='checkbox';const st=load(node.id);if(st)node.tickState=st;applyBox(cb,node.tickState);const lbl=document.createElement('span');lbl.className='lbl';lbl.innerHTML=node.label+badge(node)+semLine(node)+(node.refId?' <small class="rid">'+node.refId+'</small>':'');row.append(tw,cb,lbl);li.append(row);let ul=null;if(hk){ul=document.createElement('ul');ul.style.display=node.collapsed?'none':'block';node.children.forEach(c=>ul.append(render(c)));li.append(ul);tw.onclick=()=>{node.collapsed=!node.collapsed;ul.style.display=node.collapsed?'none':'block';tw.textContent=node.collapsed?'▸':'▾'}}cb.onclick=()=>{const nx=node.tickState==='tested'?'untested':'tested';node.tickState=nx;save(node.id,nx);if(ul)cascade(node,nx,ul);rollAll();progress()};return li;}
function applyBox(cb,st){cb.checked=st==='tested';cb.indeterminate=st==='partial';}
function cascade(node,st,ul){node.children.forEach((c,i)=>{c.tickState=st;save(c.id,st);const li=ul.children[i];applyBox(li.querySelector('input'),st);const sub=li.querySelector('ul');if(sub)cascade(c,st,sub)})}
function rollUp(n){if(!n.children||!n.children.length)return n.tickState;const cs=n.children.map(rollUp);n.tickState=cs.every(s=>s==='tested')?'tested':cs.every(s=>s==='untested')?'untested':'partial';return n.tickState}
function sync(n,li){if(!li)return;const cb=li.querySelector(':scope>.row>input');if(cb)applyBox(cb,n.tickState);const ul=li.querySelector(':scope>ul');if(ul&&n.children)n.children.forEach((c,i)=>sync(c,ul.children[i]))}
function rollAll(){rollUp(MAP.root);sync(MAP.root,document.getElementById('tree').firstChild.firstChild)}
function leaves(n,a){if(!n.children||!n.children.length){a.t++;if(n.tickState==='tested')a.d++;return}n.children.forEach(c=>leaves(c,a))}
function progress(){const a={t:0,d:0};leaves(MAP.root,a);document.getElementById('prog').textContent=a.d+' of '+a.t+' ticked ('+(a.t?Math.round(a.d/a.t*100):0)+'%)'}
const treeUl=document.createElement('ul');treeUl.append(render(MAP.root));document.getElementById('tree').append(treeUl);rollAll();progress();
</script></body></html>`;
}

function mrLabel(t: string): string {
  const map: Record<string, string> = {
    auth_gated: "Authentication-protected pages", payment_gateway: "Payment Gateway", otp: "OTP Screen",
    captcha: "CAPTCHA", external_redirect: "External Redirect", native_dialog: "Native Browser Dialog", third_party_widget: "Third-party Widget",
  };
  return map[t] ?? titleCase(t.replace(/_/g, " "));
}
