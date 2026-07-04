import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useM, Head, Ring, Conf, ConfReason, Table, VirtualList, Tree, IdChip, ScreenshotOverlay, rlink, type TreeItem } from "./ui";
import { LiveInspector } from "./LiveInspector";
import { tc } from "../lib/util";
import type { FeatureNode } from "../lib/types";

function legend() {
  return <div className="legend"><span><span className="dot g" /> Discovered</span><span><span className="dot y" /> Partial</span><span><span className="dot r" /> Blocked (manual review)</span><span><span className="dot n" /> Low certainty</span></div>;
}
function moduleIcon(n: string) {
  n = n.toLowerCase();
  if (/auth/.test(n)) return "🔐"; if (/course|coach/.test(n)) return "🎓"; if (/study|material/.test(n)) return "📚";
  if (/test|assess/.test(n)) return "📝"; if (/exam/.test(n)) return "📋"; if (/pay/.test(n)) return "💳";
  if (/search/.test(n)) return "🔎"; if (/media/.test(n)) return "🎬"; if (/notif/.test(n)) return "🔔";
  if (/profile|account/.test(n)) return "👤"; if (/report/.test(n)) return "📊"; if (/local/.test(n)) return "🌐";
  if (/booking/.test(n)) return "🎫"; return "▦";
}

/* ============ DASHBOARD ============ */
export function Dashboard() {
  const { id, model } = useM();
  const k = model.kpis || {};
  const cards: [string, number, string][] = [
    ["Pages", k.totalPages, "pages"], ["Business Modules", model.modules.length, "modules"], ["Flows", k.businessFlows, "flows"],
    ["Components", k.totalComponents, "components"], ["Forms", k.forms, "forms"], ["Hidden Elements", model.hidden.length, "hidden"],
    ["States", k.states, "states"], ["API Correlations", k.apiCalls, "apis"], ["Tables", k.tables, "components"],
    ["Dialogs", k.dialogs, "components"], ["Roles", k.roles, "settings"], ["Manual Review", model.manualReview.length, "manual-review"],
  ];
  const mods = (model.coverageMap || []).filter((h) => h.kind === "module");
  return (
    <>
      <Head title="Dashboard" sub={<>Everything discovered in <b>{model.meta.appName}</b> — understand what a manual tester needs to look at.</>} />
      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", marginBottom: "1rem" }}>
        <div className="card">
          <div className="between" style={{ marginBottom: ".6rem" }}><b>{model.meta.appName}</b><span className="tag">{model.meta.runId}</span></div>
          <dl className="kv-list">
            <dt>Website</dt><dd><a href={model.meta.appUrl} target="_blank" rel="noopener">{model.meta.appUrl}</a></dd>
            <dt>Discovery Time</dt><dd>{model.meta.generatedAt}</dd>
            <dt>Roles</dt><dd>{model.meta.roles.map(tc).join(", ")}</dd>
            <dt>Schema</dt><dd className="mono">{model.meta.schemaVersion}</dd>
          </dl>
        </div>
        <div className="card"><div className="row" style={{ justifyContent: "space-around", height: "100%" }}>
          <Ring v={model.summary.discoveryConfidence} label="Discovery Confidence" />
          <Ring v={model.validation.overallDiscoveryCompleteness} label="Completeness" />
        </div></div>
      </div>
      <div className="grid kpis" style={{ marginBottom: "1.4rem" }}>
        {cards.map(([l, v, view]) => (
          <Link key={l} className="card kpi click" to={rlink(id, view)} style={{ color: "inherit", textDecoration: "none" }}>
            <div className="kv">{v ?? 0}</div><div className="kl">{l}</div>
          </Link>
        ))}
      </div>
      <h2 className="sec">Coverage map · business modules</h2>
      <div className="heat">{mods.map((h) => (
        <Link key={h.id} className={"hc " + h.status} to={rlink(id, "modules", h.id)} style={{ color: "#fff", textDecoration: "none" }}>
          <span>{h.label}</span><small>{tc(h.status.replace("_", " "))} · {Math.round(h.confidence)}%</small>
        </Link>
      ))}</div>
      {legend()}
      <h2 className="sec">Where a human must look</h2>
      {model.manualReview.length ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
          {model.manualReview.slice(0, 6).map((e: any, i: number) => (
            <div key={i} className="card"><span className="badge r">⚑ {tc((e.blockerType || "").replace(/_/g, " "))}</span><div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>{e.reason}</div></div>
          ))}
        </div>
      ) : <div className="empty">No blocked areas — auto-discovery reached everything it attempted.</div>}
    </>
  );
}

/* ============ OVERVIEW ============ */
export function Overview() {
  const { id, model } = useM();
  const caps = model.modules.map((m) => m.name);
  const langs = model.components.filter((c) => /language|english|hindi|hinglish|locale/i.test(c.label)).map((c) => c.label);
  const has = (re: RegExp) => model.modules.some((m) => re.test(m.name));
  const domain = (() => { const s = caps.join(" ").toLowerCase();
    if (/course|exam|study|test series|coaching/.test(s)) return "Education / e-learning";
    if (/checkout|payment|cart|catalog|product/.test(s)) return "E-commerce";
    if (/booking|seat|showtime/.test(s)) return "Booking / ticketing"; return "Web application"; })();
  return (
    <>
      <Head title="Application Overview" sub="A senior QA's read of what this application is — inferred from the crawl." />
      <div className="split">
        <div className="panel"><div className="ph">❖ What this application is</div><div className="pb"><dl className="kv-list">
          <dt>Application</dt><dd>{model.meta.appName}</dd>
          <dt>URL</dt><dd><a href={model.meta.appUrl} target="_blank" rel="noopener">{model.meta.appUrl}</a></dd>
          <dt>Domain</dt><dd>{domain}</dd>
          <dt>Target users</dt><dd>Guest visitors{has(/auth/i) ? " and authenticated users" : ""}</dd>
          <dt>Authentication</dt><dd>{has(/auth/i) ? "Present (login surface discovered)" : "Not observed on public surface"}</dd>
          <dt>Payments</dt><dd>{has(/payment/i) ? "Present — checkout hands off to an external gateway (see Manual Review)" : "Not observed"}</dd>
          <dt>Notifications</dt><dd>{has(/notif/i) ? "Present" : "Not observed"}</dd>
          <dt>Languages</dt><dd>{langs.length ? Array.from(new Set(langs)).slice(0, 6).join(", ") : "Not observed"}</dd>
        </dl></div></div>
        <div className="panel"><div className="ph">▦ Primary business capabilities</div><div className="pb">
          <div className="chips">{model.modules.map((m) => <Link key={m.id} className="chip" to={rlink(id, "modules", m.id)}>{m.name}</Link>)}</div>
          <h2 className="sec">High-level navigation</h2>
          <div className="chips">{model.navigation.slice(0, 12).map((n: any) => <span key={n.id} className="chip" style={{ cursor: "default" }}>{n.label || n.type}</span>)}</div>
        </div></div>
      </div>
      <div className="panel" style={{ marginTop: ".85rem" }}><div className="ph">Pages found ({model.pages.length})</div><div className="pb">
        <div className="chips">{model.pages.map((p) => <Link key={p.id} className="chip" to={rlink(id, "pages", p.id)}>{p.label}</Link>)}</div>
      </div></div>
      <div className="panel" style={{ marginTop: ".85rem" }}><div className="ph">Summary</div><div className="pb dim" style={{ fontSize: 13.5 }}>
        {model.meta.appName} exposes {model.pages.length} page archetype(s) in {model.modules.length} module(s): {model.modules.map((m) => m.name).join(", ")}. {model.components.length} components, {model.forms.length} form(s), and {model.apis.length} observed API correlation(s) were discovered as {model.meta.roles.map(tc).join("/")}. Discovery confidence is {Math.round(model.summary.discoveryConfidence)}% — {model.summary.discoveryConfidence >= 70 ? "a broad pass." : "a partial pass; areas behind authentication, robots.txt, or external gateways are listed under Manual Review."}
      </div></div>
    </>
  );
}

/* ============ MODULES ============ */
export function Modules() {
  const { id, model, idx, label } = useM();
  const { sub } = useParams();
  return (
    <>
      <Head title="Business Modules" sub="The capabilities this application offers — expand a module to see its features, pages, components and flows." />
      <div className="mods">{model.modules.map((m) => <ModuleCard key={m.id} m={m} openDefault={m.id === sub} idx={idx} id={id} label={label} />)}</div>
    </>
  );
}
function ModuleCard({ m, openDefault, idx, id, label }: any) {
  const [open, setOpen] = useState(openDefault);
  const row = (name: string, ids: string[], view: string) => ids.length ? (
    <div className="mrow"><span>{name}</span><span className="mrv">{ids.slice(0, 24).map((x: string) => <IdChip key={x} refId={x} text={label(x)} />)}{ids.length > 24 ? <span className="muted"> +{ids.length - 24}</span> : null}</span></div>
  ) : null;
  return (
    <div className="mod">
      <div className="mh" onClick={() => setOpen((o: boolean) => !o)}>
        <div className="mi">{moduleIcon(m.name)}</div>
        <div style={{ flex: 1 }}><div className="mn">{m.name}</div><div className="mmeta">{m.features.length} features · {m.pageIds.length} pages · {m.componentIds.length} components</div></div>
        <Conf v={m.confidence} />{m.manualReview && <span className="badge r">⚑</span>}
      </div>
      {open && <div className="mb">
        {m.features.length > 0 && <div className="chips" style={{ margin: ".4rem 0" }}>{m.features.map((f: any) => <span key={f.id} className="chip" style={{ cursor: "default" }}>{f.label}{f.children.length ? ` (${f.children.join(", ")})` : ""}</span>)}</div>}
        {row("Pages", m.pageIds, "pages")}
        {row("Components", m.componentIds.slice(0, 40), "components")}
        {row("Forms", m.formIds, "forms")}
        {row("Flows", m.flowIds, "flows")}
        {row("Hidden UI", m.hiddenIds, "hidden")}
        <ConfReason o={m} />
      </div>}
    </div>
  );
}

/* ============ FEATURE TREE ============ */
export function FeatureTree() {
  const { model } = useM();
  const toTree = (n: FeatureNode): TreeItem => ({ key: n.id, label: n.label, confidence: n.confidence, children: (n.children || []).map(toTree) });
  return (
    <>
      <Head title="Business Feature Tree" sub="Business hierarchy — what the app does, grouped the way a QA thinks (not the DOM)." />
      <div className="panel"><div className="pb"><Tree nodes={[toTree(model.featureTree.root)]} /></div></div>
    </>
  );
}

/* ============ STRUCTURE ============ */
export function Structure() {
  const { id, model, idx } = useM();
  const root: TreeItem = {
    key: "root", label: `${model.meta.appName} (Application)`,
    children: model.modules.map((m) => ({
      key: m.id, label: m.name, tag: "module",
      children: m.pageIds.map((pid: string) => {
        const p = idx.page[pid];
        return { key: pid, label: p ? p.label : pid, tag: "page", to: rlink(id, "pages", pid),
          children: (p?.componentIds || []).slice(0, 25).map((cid: string) => { const c = idx.component[cid]; return { key: cid, label: c ? (c.label || c.type) : cid, tag: c?.type, to: rlink(id, "components", cid) }; }) };
      }),
    })),
  };
  return (
    <>
      <Head title="Application Structure" sub="Application › Module › Page › Component — expand to drill down." />
      <div className="panel"><div className="pb"><Tree nodes={[root]} /></div></div>
    </>
  );
}

/* ============ PAGES ============ */
export function Pages() {
  const { id, model, idx } = useM();
  const { sub } = useParams();
  if (sub && idx.page[sub]) return <PageDetail p={idx.page[sub]} />;
  const nav = useNavigate();
  return (
    <>
      <Head title="Pages" sub={`${model.pages.length} page archetype(s). Click a page for its detail and screenshot overlay.`} />
      <Table headers={["Page", "Components", "Forms", "States", "Roles", "Confidence"]}>
        {model.pages.map((p) => (
          <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => nav(rlink(id, "pages", p.id))}>
            <td><b>{p.label}</b><div className="mono muted">{p.url}</div></td>
            <td>{p.componentIds.length}</td><td>{p.formIds.length}</td><td>{p.stateIds.length}</td>
            <td>{p.roles.map(tc).join(", ")}</td><td><Conf v={p.confidence} />{p.authRequired && <span className="badge y">auth</span>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
function PageDetail({ p }: { p: any }) {
  const { id, idx } = useM();
  const comps = (p.componentIds || []).map((cid: string) => idx.component[cid]).filter(Boolean);
  return (
    <>
      <Head title={p.label} sub={p.purpose} crumbs={<Link to={rlink(id, "pages")}>Pages</Link>} />
      <div className="split">
        <ScreenshotOverlay page={p} />
        <div className="panel"><div className="ph">Page facts</div><div className="pb"><dl className="kv-list">
          <dt>URL pattern</dt><dd className="mono">{p.url}</dd>
          <dt>Archetype</dt><dd>{p.archetype}</dd>
          <dt>HTTP observed</dt><dd>{p.httpStatus || "—"}</dd>
          <dt>Roles</dt><dd>{p.roles.map(tc).join(", ")}</dd>
          <dt>Auth required</dt><dd>{p.authRequired ? "Yes" : "No"}</dd>
          <dt>Confidence</dt><dd><Conf v={p.confidence} /></dd>
          <dt>Modules</dt><dd>{p.moduleIds.length ? p.moduleIds.map((mid: string) => <IdChip key={mid} refId={mid} />) : <span className="muted">—</span>}</dd>
        </dl><ConfReason o={p} /></div></div>
      </div>
      <h2 className="sec">Components on this page ({comps.length})</h2>
      {comps.length ? <div className="chips">{comps.map((c: any) => <IdChip key={c.id} refId={c.id} text={c.label || c.type} />)}</div> : <div className="muted">No page-local components.</div>}
      {p.formIds.length > 0 && <><h2 className="sec">Forms</h2><div className="chips">{p.formIds.map((f: string) => <IdChip key={f} refId={f} />)}</div></>}
      {p.stateIds.length > 0 && <><h2 className="sec">States</h2><div className="chips">{p.stateIds.map((s: string) => <IdChip key={s} refId={s} />)}</div></>}
    </>
  );
}

/* ============ COMPONENTS ============ */
export function Components() {
  const { id, model, idx, label } = useM();
  const { sub } = useParams();
  const nav = useNavigate();
  if (sub && idx.component[sub]) return <ComponentDetail c={idx.component[sub]} />;
  const [q, setQ] = useState(""); const [type, setType] = useState(""); const [globalOnly, setGlobalOnly] = useState(false);
  const types = useMemo(() => Array.from(new Set(model.components.map((c) => c.type))).sort(), [model]);
  const list = model.components.filter((c) => {
    if (type && c.type !== type) return false; if (globalOnly && c.scope !== "global") return false;
    if (q && `${c.label} ${c.businessFunction || ""} ${c.inferredPurpose || ""} ${c.type}`.toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
    return true;
  });
  return (
    <>
      <Head title="Components" sub={`${model.components.length} components across ${model.pages.length} pages. Filter, then open any for full detail.`} />
      <div className="row" style={{ marginBottom: ".8rem" }}>
        <input className="input" placeholder="Filter by label / function…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types ({model.components.length})</option>
          {types.map((t) => <option key={t} value={t}>{t} ({model.components.filter((c) => c.type === t).length})</option>)}
        </select>
        <label className="row" style={{ fontSize: 12.5 }}><input type="checkbox" checked={globalOnly} onChange={(e) => setGlobalOnly(e.target.checked)} /> global only</label>
        <span className="spacer" /><Link className="btn sm" to={rlink(id, "screenshots")}>▣ Gallery</Link>
      </div>
      <div className="dim" style={{ marginBottom: ".4rem" }}>{list.length} components</div>
      <VirtualList items={list} render={(c) => (
        <div className="vrow" onClick={() => nav(rlink(id, "components", c.id))}>
          <span className="tag">{c.type}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label || c.type}</b>
            <span className="muted" style={{ fontSize: 12 }}>{c.businessFunction}{c.behavior ? " · " + c.behavior : ""}</span>
          </span>
          {c.scope === "global" && <span className="badge a">global</span>}{c.manualReview && <span className="badge r">⚑</span>}<Conf v={c.confidence} />
        </div>
      )} />
    </>
  );
}
function ComponentDetail({ c }: { c: any }) {
  const { id, label } = useM();
  return (
    <>
      <Head title={c.label || c.type} sub={c.inferredPurpose} crumbs={<Link to={rlink(id, "components")}>Components</Link>} />
      <div className="split">
      <div className="panel"><div className="pb"><dl className="kv-list">
        <dt>Type</dt><dd><span className="tag">{c.type}</span></dd>
        <dt>Business function</dt><dd>{c.businessFunction || "—"}</dd>
        <dt>Purpose</dt><dd>{c.inferredPurpose || "—"}</dd>
        {c.behavior && <><dt>Observed behaviour</dt><dd>{c.behavior}</dd></>}
        {c.leadsTo?.length ? <><dt>Leads to</dt><dd>{c.leadsTo.map((x: string) => <IdChip key={x} refId={x} />)}</dd></> : null}
        {c.partOfFlow && <><dt>Part of flow</dt><dd><IdChip refId={c.partOfFlow} /></dd></>}
        <dt>Appears on</dt><dd>{c.scope === "global" ? `Global — ${(c.appearsOn || []).length} pages` : <IdChip refId={c.page} />}</dd>
        {c.triggersApi?.length ? <><dt>Related APIs</dt><dd>{c.triggersApi.map((x: string) => <IdChip key={x} refId={x} />)}</dd></> : null}
        <dt>Accessibility role</dt><dd>{c.ariaRole || "—"}</dd>
        <dt>Selector</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{c.selector}</dd>
        <dt>Confidence</dt><dd><Conf v={c.confidence} /></dd>
        <dt>Manual review</dt><dd>{c.manualReview ? <><span className="badge r">Required</span> {c.manualReviewReason}</> : "Not required"}</dd>
      </dl><ConfReason o={c} /></div></div>
      <LiveInspector component={c} />
      </div>
    </>
  );
}

/* ============ FORMS / FLOWS / STATES / HIDDEN / NAV / APIS ============ */
export function Forms() {
  const { id, model, idx, label } = useM();
  const { sub } = useParams();
  if (sub && idx.form[sub]) {
    const f = idx.form[sub];
    return (<>
      <Head title={f.name} sub={`Discovered on ${label(f.page)} — ${f.fieldCount} field(s). Not submitted.`} crumbs={<Link to={rlink(id, "forms")}>Forms</Link>} />
      <Table headers={["Field", "Name", "Type", "Required", "Validation observed"]}>
        {(f.fields || []).map((fl: any, i: number) => (
          <tr key={i}><td>{fl.label || "—"}</td><td className="mono">{fl.name}</td><td>{fl.type}</td><td>{fl.required ? "yes" : "no"}</td><td>{(fl.validationAttributesObserved || []).map((v: string) => <span key={v} className="tag">{v}</span>)}</td></tr>
        ))}
      </Table>
    </>);
  }
  const nav = useNavigate();
  return (<>
    <Head title="Forms" sub={`${model.forms.length} form(s). Fields + observed client-side validation attributes are catalogued — forms are never submitted.`} />
    <Table headers={["Form", "Page", "Fields", "Required", "Validation attrs"]}>
      {model.forms.map((f: any) => (
        <tr key={f.id} style={{ cursor: "pointer" }} onClick={() => nav(rlink(id, "forms", f.id))}>
          <td><b>{f.name}</b></td><td>{label(f.page)}</td><td>{f.fieldCount}</td><td>{(f.requiredFields || []).length}</td>
          <td>{(f.validationAttributesObserved || []).map((v: string) => <span key={v} className="tag">{v}</span>)}</td>
        </tr>
      ))}
    </Table>
  </>);
}
export function Flows() {
  const { label, model } = useM();
  if (!model.flows.length) return <><Head title="Flows" /><div className="empty">No multi-step user flows were inferred from the reachable surface.</div></>;
  return (<>
    <Head title="Flows" sub={`${model.flows.length} user journey(s) inferred as ordered step chains. Discovery only — not executed.`} />
    {model.flows.map((f: any) => (
      <div key={f.id} className="panel" style={{ marginBottom: ".85rem" }}><div className="ph">{f.name} <Conf v={f.confidence} /></div><div className="pb">
        <div className="row" style={{ gap: ".4rem" }}>
          {[...(f.steps || []).map((s: any) => ({ id: s.pageId || s.componentId, label: s.action + (s.pageId ? ` (${label(s.pageId)})` : "") })), ...(f.terminalOutcomes || []).map((t: string) => ({ id: "", label: t }))].map((s: any, i: number, arr: any[]) => (
            <React.Fragment key={i}>
              {s.id ? <IdChip refId={s.id} text={`${i + 1}. ${s.label}`} /> : <span className="chip" style={{ cursor: "default" }}>{i + 1}. {s.label}</span>}
              {i < arr.length - 1 && <span className="muted">→</span>}
            </React.Fragment>
          ))}
        </div>
        <ConfReason o={f} />
      </div></div>
    ))}
  </>);
}
export function States() {
  const { model, label } = useM();
  return (<>
    <Head title="States" sub={`${model.states.length} UI state(s) — observed through safe exploration or declared where not reached.`} />
    <Table headers={["State", "Type", "Applies to", "Observed", "How"]}>
      {model.states.map((s: any) => (
        <tr key={s.id}><td><b>{s.label}</b></td><td>{s.type}</td><td>{label(s.appliesTo)}</td><td>{s.observed ? <span className="badge g">observed</span> : <span className="badge n">declared</span>}</td><td>{s.observationMethod}</td></tr>
      ))}
    </Table>
  </>);
}
export function Hidden() {
  const { model, label } = useM();
  return (<>
    <Head title="Hidden Elements" sub={`${model.hidden.length} hidden/conditional element(s) revealed by active probing — with the interaction that exposed each.`} />
    <Table headers={["Type", "Reveal trigger", "Page", "Reproducible"]}>
      {model.hidden.map((h: any) => (<tr key={h.id}><td><b>{tc(h.type.replace(/-/g, " "))}</b></td><td className="mono">{h.revealTrigger}</td><td>{label(h.page)}</td><td>{h.reproducible ? "yes" : "no"}</td></tr>))}
    </Table>
  </>);
}
export function Navigation() {
  const { model } = useM();
  return (<>
    <Head title="Navigation" sub={`${model.navigation.length} navigation structures discovered.`} />
    <Table headers={["Label", "Type", "Scope", "Links"]}>
      {model.navigation.map((n: any) => (<tr key={n.id}><td><b>{n.label || n.type}</b></td><td>{n.type}</td><td>{n.scope}</td><td>{n.items ? n.items.length : 0}</td></tr>))}
    </Table>
  </>);
}
export function Apis() {
  const { model } = useM();
  return (<>
    <Head title="API Map" sub={`${model.apis.length} UI→endpoint correlation(s). Map only — endpoints are never called, fuzzed, or validated.`} />
    <Table headers={["Endpoint", "Trigger", "Transport", "Auth signal", "Status seen"]}>
      {model.apis.map((a: any) => (<tr key={a.id}><td className="mono">{a.endpointPattern}</td><td>{a.triggeringAction}</td><td>{a.transport}</td><td>{a.authSignalObserved}</td><td>{a.sampleStatus == null ? "—" : a.sampleStatus}</td></tr>))}
    </Table>
  </>);
}
