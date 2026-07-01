/**
 * Hierarchical QA Map (Phase 5).
 *
 * Structural, tickable tree of the WHOLE application (App > Page > Section >
 * Component). Answers "Did I miss anything?". Three-state tick with roll-up.
 * A node names a thing that EXISTS; it is never a test case, never a verdict.
 */

import { hash, id, slug, titleCase } from "../core/ids.js";
import { makeEnvelope, type Envelope } from "../core/envelope.js";
import type { Category, MapNodeType, TickState } from "../core/constants.js";
import type { AnyItem, DiscoveryModel } from "../core/types.js";

export interface MapNode {
  id: string;
  refId?: string;
  label: string;
  type: MapNodeType;
  category?: Category;
  confidence?: number;
  confidenceReason?: string | null;
  tickState: TickState;
  collapsed: boolean;
  tickedBy?: string | null;
  tickedAt?: string | null;
  children: MapNode[];
}

export interface QaMap extends Envelope {
  artifact: "hierarchical_qa_map";
  root: MapNode;
  coverage: { totalSourceIds: number; mappedIds: number; unmappedIds: string[] };
}

function node(
  nid: string,
  label: string,
  type: MapNodeType,
  opts: Partial<MapNode> = {},
): MapNode {
  return {
    id: nid,
    label,
    type,
    tickState: "untested",
    collapsed: type !== "root" && type !== "feature",
    children: [],
    ...opts,
  };
}

export function buildQaMap(model: DiscoveryModel, generatedAt: string): QaMap {
  const assigned = new Set<string>();
  const use = (id: string) => {
    assigned.add(id);
    return id;
  };
  const areas: MapNode[] = [];

  // Feature areas (readable top-level grouping like the reference example)
  for (const feat of model.features) {
    const key = feat.id.replace("FEAT:", "");
    const areaNode = node(id("MAP", key), feat.name, "feature", {
      refId: use(feat.id),
      category: "business_feature",
      confidence: feat.confidence,
      confidenceReason: feat.confidenceReason ?? null,
    });
    // sub-nodes: its member components (assigned once)
    for (const cid of feat.components) {
      if (assigned.has(cid)) continue;
      const c = model.components.find((x) => x.id === cid);
      if (!c) continue;
      areaNode.children.push(
        node(id("MAP", key, slug(c.label || c.type)), c.label || c.type, "component", {
          refId: use(c.id),
          category: "component",
          confidence: c.confidence,
          confidenceReason: c.confidenceReason ?? null,
        }),
      );
    }
    for (const fid of feat.forms) {
      if (assigned.has(fid)) continue;
      const f = model.forms.find((x) => x.id === fid);
      if (!f) continue;
      areaNode.children.push(
        node(id("MAP", key, slug(f.name)), f.name, "form", { refId: use(f.id), category: "form", confidence: f.confidence }),
      );
    }
    for (const flid of feat.flows) {
      if (assigned.has(flid)) continue;
      const fl = model.flows.find((x) => x.id === flid);
      if (!fl) continue;
      areaNode.children.push(node(id("MAP", key, slug(fl.name)), fl.name, "flow_step", { refId: use(fl.id), category: "user_flow", confidence: fl.confidence }));
    }
    if (areaNode.children.length || areaNode.refId) areas.push(areaNode);
  }

  // Pages area: each page + its remaining page-local components/forms/states
  const pagesArea = node("MAP:pages", "Pages", "feature");
  for (const p of model.pages) {
    const pslug = p.archetype;
    const pageNode = node(id("MAP", "pages", pslug), p.label, "page", {
      refId: use(p.id),
      category: "page",
      confidence: p.confidence,
      confidenceReason: p.confidenceReason ?? null,
    });
    for (const cid of p.containsComponents) {
      if (assigned.has(cid)) continue;
      const c = model.components.find((x) => x.id === cid);
      if (!c || c.scope === "global") continue;
      pageNode.children.push(
        node(id("MAP", "pages", pslug, slug(c.label || c.type)), c.label || c.type, "component", {
          refId: use(c.id),
          category: "component",
          confidence: c.confidence,
          confidenceReason: c.confidenceReason ?? null,
        }),
      );
    }
    for (const fid of p.containsForms) {
      if (assigned.has(fid)) continue;
      const f = model.forms.find((x) => x.id === fid);
      if (!f) continue;
      pageNode.children.push(node(id("MAP", "pages", pslug, slug(f.name)), f.name, "form", { refId: use(f.id), category: "form", confidence: f.confidence }));
    }
    for (const sid of p.knownStates) {
      if (assigned.has(sid)) continue;
      const s = model.states.find((x) => x.id === sid);
      if (!s) continue;
      pageNode.children.push(node(id("MAP", "pages", pslug, "state", slug(s.type)), titleCase(s.type), "state", { refId: use(s.id), category: "state", confidence: s.confidence }));
    }
    pagesArea.children.push(pageNode);
  }
  if (pagesArea.children.length) areas.push(pagesArea);

  // Global components
  const globalArea = node("MAP:global", "Global Components", "feature");
  for (const cid of model.globalComponents) {
    if (assigned.has(cid)) continue;
    const c = model.components.find((x) => x.id === cid);
    if (!c) continue;
    globalArea.children.push(node(id("MAP", "global", slug(c.label || c.type)), c.label || c.type, "component", { refId: use(c.id), category: "component", confidence: c.confidence }));
  }
  if (globalArea.children.length) areas.push(globalArea);

  // Navigation
  areas.push(sectionFor("nav", "Navigation", model.navigation, "component", "navigation", use));
  // Hidden
  areas.push(sectionFor("hidden", "Hidden Things", model.hidden, "component", "hidden", use));
  // APIs
  areas.push(sectionFor("apis", "APIs", model.apis, "api", "api", use));
  // Roles
  areas.push(sectionFor("roles", "Roles", model.roles, "component", "role", use));
  // States (declared-not-observed and unassigned)
  areas.push(sectionFor("states", "States", model.states, "state", "state", use));
  // Flows (top-level)
  areas.push(sectionFor("flows", "Flows", model.flows, "flow_step", "user_flow", use));

  // Coverage sweep: any model id not yet assigned goes to a Misc area (no silent gaps)
  const allItems: AnyItem[] = [
    ...model.pages,
    ...model.navigation,
    ...model.components,
    ...model.features,
    ...model.flows,
    ...model.hidden,
    ...model.apis,
    ...model.forms,
    ...model.roles,
    ...model.states,
  ];
  const allIds = allItems.map((i) => i.id);
  const misc = node("MAP:misc", "Other Discovered Items", "feature");
  for (const it of allItems) {
    if (assigned.has(it.id)) continue;
    misc.children.push(node(id("MAP", "misc", slug(it.label || it.id)), it.label || it.id, "component", { refId: use(it.id), category: it.category }));
  }
  if (misc.children.length) areas.push(misc);

  const root = node("MAP:root", "Website", "root", { collapsed: false });
  root.children = areas.filter((a) => a.children.length || a.refId);
  rollUp(root);

  const mappedIds = new Set(collectRefIds(root));
  const unmapped = allIds.filter((x) => !mappedIds.has(x));

  const envelope = makeEnvelope({
    artifact: "hierarchical_qa_map",
    artifactId: id("MAP", hash(model.runId, "map")),
    runId: model.runId,
    appUrl: model.appUrl,
    roles: model.roles.map((r) => r.name),
    sourceArtifacts: ["discovery-model.json", "qa-inventory.json"],
    generatedAt,
  });

  return {
    ...envelope,
    artifact: "hierarchical_qa_map",
    root,
    coverage: { totalSourceIds: allIds.length, mappedIds: mappedIds.size, unmappedIds: unmapped },
  };
}

function sectionFor(
  areaKey: string,
  areaLabel: string,
  items: AnyItem[],
  nodeType: MapNodeType,
  category: Category,
  use: (id: string) => string,
): MapNode {
  const area = node(id("MAP", areaKey), areaLabel, "feature");
  for (const it of items) {
    if ((it as any)._assignedCheck) continue;
    area.children.push(
      node(id("MAP", areaKey, slug(it.label || it.id)), it.label || (it as any).name || it.id, nodeType, {
        refId: use(it.id),
        category,
        confidence: (it as any).confidence,
        confidenceReason: (it as any).confidenceReason ?? null,
      }),
    );
  }
  return area;
}

function collectRefIds(n: MapNode): string[] {
  const out: string[] = [];
  if (n.refId) out.push(n.refId);
  for (const c of n.children) out.push(...collectRefIds(c));
  return out;
}

export function rollUp(n: MapNode): TickState {
  if (n.children.length === 0) return n.tickState;
  const childStates = n.children.map(rollUp);
  const allTested = childStates.every((s) => s === "tested");
  const noneTested = childStates.every((s) => s === "untested");
  n.tickState = allTested ? "tested" : noneTested ? "untested" : "partial";
  return n.tickState;
}

// ---------- renderers ----------

export function renderQaMapMd(map: QaMap): string {
  const L: string[] = [];
  L.push(`# Hierarchical QA Map`);
  L.push("");
  L.push(`_Structural, tickable coverage tree. "Did I miss anything?"_`);
  L.push("");
  L.push(`[ ] ${map.root.label}`);
  for (const area of map.root.children) {
    const kids = area.children.map((c) => c.label).join(", ");
    L.push(` - [ ] ${area.label}${kids ? ` ( ${kids} )` : ""}`);
  }
  L.push("");
  L.push(`Coverage: ${map.coverage.mappedIds}/${map.coverage.totalSourceIds} source items mapped; unmapped: ${map.coverage.unmappedIds.length}`);
  L.push("");
  return L.join("\n") + "\n";
}

export function renderQaMapHtml(map: QaMap): string {
  const json = JSON.stringify(map);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Hierarchical QA Map — ${map.appUrl}</title>
<style>
 body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:1.5rem;color:#1a1a1a}
 h1{font-size:1.3rem} .meta{color:#666;font-size:.85rem;margin-bottom:1rem}
 .progress{position:sticky;top:0;background:#fff;padding:.5rem 0;border-bottom:1px solid #eee;font-weight:600}
 ul{list-style:none;margin:0;padding-left:1.2rem} li{margin:.15rem 0}
 .row{display:flex;align-items:center;gap:.4rem}
 .tw{cursor:pointer;width:1rem;display:inline-block;color:#888}
 .cb{cursor:pointer} .lbl{cursor:default}
 .badge{font-size:.7rem;color:#0a7;margin-left:.3rem}
 .low{color:#c60;font-weight:600}
 .tested>.row>.lbl{color:#0a0} .partial>.row>.lbl{color:#c90}
</style></head><body>
<h1>Hierarchical QA Map</h1>
<div class="meta">${map.appUrl} · ${map.runId} · roles: ${map.roles.join(", ")} · discovery only — a coverage tree of what exists</div>
<div class="progress" id="prog">0 of 0 ticked</div>
<div id="tree"></div>
<script>
const MAP = ${json};
const runId = MAP.runId;
const KEY = (id)=> 'qadisc:'+runId+':'+id;
function load(id){ try{return localStorage.getItem(KEY(id))||null}catch(e){return null} }
function save(id,v){ try{localStorage.setItem(KEY(id),v)}catch(e){} }
function render(node){
  const li=document.createElement('li'); li.className=node.tickState;
  const row=document.createElement('div'); row.className='row';
  const hasKids=node.children&&node.children.length;
  const tw=document.createElement('span'); tw.className='tw'; tw.textContent=hasKids?(node.collapsed?'▸':'▾'):'';
  const cb=document.createElement('input'); cb.type='checkbox'; cb.className='cb';
  const stored=load(node.id); if(stored) node.tickState=stored;
  applyBox(cb,node.tickState);
  const lbl=document.createElement('span'); lbl.className='lbl';
  let conf=''; if(node.confidence!=null){ conf = node.confidence<80 ? ' <span class="badge low">Confidence '+node.confidence+'% — '+(node.confidenceReason||'low')+'</span>' : ' <span class="badge">Confidence '+node.confidence+'%</span>'; }
  lbl.innerHTML=node.label+conf+(node.refId?' <small style="color:#aaa">'+node.refId+'</small>':'');
  row.append(tw,cb,lbl); li.append(row);
  let ul=null;
  if(hasKids){ ul=document.createElement('ul'); ul.style.display=node.collapsed?'none':'block';
    node.children.forEach(c=>ul.append(render(c))); li.append(ul);
    tw.onclick=()=>{ node.collapsed=!node.collapsed; ul.style.display=node.collapsed?'none':'block'; tw.textContent=node.collapsed?'▸':'▾'; };
  }
  cb.onclick=()=>{ const next = cycle(node.tickState); setState(node,next); save(node.id,next); if(ul) cascade(node,next,ul); rollAll(); progress(); };
  return li;
}
function applyBox(cb,st){ cb.checked=st==='tested'; cb.indeterminate=st==='partial'; }
function cycle(st){ return st==='untested'?'tested':st==='tested'?'untested':'tested'; }
function setState(node,st){ node.tickState=st; }
function cascade(node,st,ul){ node.children.forEach((c,i)=>{ setState(c,st); save(c.id,st); const li=ul.children[i]; const cb=li.querySelector('.cb'); applyBox(cb,st); const sub=li.querySelector('ul'); if(sub) cascade(c,st,sub); }); }
function rollUp(n){ if(!n.children||!n.children.length) return n.tickState; const cs=n.children.map(rollUp); const all=cs.every(s=>s==='tested'); const none=cs.every(s=>s==='untested'); n.tickState= all?'tested':none?'untested':'partial'; return n.tickState; }
function rollAll(){ rollUp(MAP.root); syncBoxes(MAP.root, document.getElementById('tree').firstChild); }
function syncBoxes(node,li){ if(!li)return; const cb=li.querySelector(':scope > .row > .cb'); if(cb)applyBox(cb,node.tickState); const ul=li.querySelector(':scope > ul'); if(ul&&node.children) node.children.forEach((c,i)=>syncBoxes(c,ul.children[i])); }
function countLeaves(n,acc){ if(!n.children||!n.children.length){acc.total++; if(n.tickState==='tested')acc.done++; return;} n.children.forEach(c=>countLeaves(c,acc)); }
function progress(){ const acc={total:0,done:0}; countLeaves(MAP.root,acc); document.getElementById('prog').textContent = acc.done+' of '+acc.total+' ticked ('+(acc.total?Math.round(acc.done/acc.total*100):0)+'%)'; }
const tree=document.getElementById('tree'); const ul=document.createElement('ul'); ul.append(render(MAP.root)); tree.append(ul);
rollAll(); progress();
</script></body></html>`;
}
