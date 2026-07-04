import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useM, Head, Ring, rlink, IdChip } from "./ui";
import { tc } from "../lib/util";
import { api } from "../lib/api";

/* ============ RELATIONSHIPS (SVG graph) ============ */
export function Relationships() {
  const { model } = useM();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => { if (wrapRef.current) setW(wrapRef.current.clientWidth); }, []);
  const H = 460;
  const nodes = (model.featureRel.nodes || []).map((id) => ({ id, label: tc(id.replace(/^FEAT:|^FEATNODE:/, "").replace(/-/g, " ")) }));
  const edges = model.featureRel.edges || [];
  const layout = useMemo(() => {
    const depth: Record<string, number> = {}; nodes.forEach((n) => (depth[n.id] = 0));
    for (let i = 0; i < nodes.length; i++) edges.forEach((e) => { if (depth[e.to] <= depth[e.from]) depth[e.to] = depth[e.from] + 1; });
    const byDepth: Record<number, typeof nodes> = {}; nodes.forEach((n) => (byDepth[depth[n.id]] = byDepth[depth[n.id]] || []).push(n));
    const maxD = Math.max(0, ...Object.keys(byDepth).map(Number));
    const pos: Record<string, { x: number; y: number }> = {};
    Object.keys(byDepth).forEach((d) => byDepth[+d].forEach((n, i) => {
      pos[n.id] = { x: 40 + (maxD ? (+d / maxD) * (W - 220) : (W - 160) / 2), y: (H / (byDepth[+d].length + 1)) * (i + 1) };
    }));
    return pos;
  }, [nodes.length, edges.length, W]);
  const NW = 150, NH = 40;
  return (
    <>
      <Head title="Feature Relationships" sub="Inferred feature-to-feature graph — how capabilities connect. Descriptive only." />
      <div className="graphwrap" ref={wrapRef} style={{ height: H }}>
        {nodes.length === 0 ? <div className="empty" style={{ border: 0 }}>No relationships inferred.</div> : (
          <svg viewBox={`0 0 ${W} ${H}`}>
            <defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--border-strong)" /></marker></defs>
            {edges.map((e, i) => { const a = layout[e.from], b = layout[e.to]; if (!a || !b) return null;
              const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
              return <path key={i} className="gedge" d={`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`} />; })}
            {nodes.map((n) => { const p = layout[n.id]; if (!p) return null;
              return <g key={n.id} className="gnode"><rect x={p.x} y={p.y} width={NW} height={NH} rx="8" /><text x={p.x + NW / 2} y={p.y + NH / 2 + 4} textAnchor="middle">{n.label.slice(0, 20)}</text></g>; })}
          </svg>
        )}
      </div>
    </>
  );
}

/* ============ SCREENSHOTS / GALLERY ============ */
export function Screenshots() {
  const { id, model } = useM();
  const withShots = model.pages.filter((p) => { const s = (model.screenshots || {})[p.screenshotKey]; return s && (s.desktop || s.tablet || s.mobile); });
  const groups = useMemo(() => { const g: Record<string, any[]> = {}; model.components.forEach((c) => (g[c.type] = g[c.type] || []).push(c)); return g; }, [model]);
  return (
    <>
      <Head title="Screenshots & Component Gallery" sub="Annotated page screenshots (where captured) and every component grouped by type." />
      {withShots.length ? (
        <><h2 className="sec">Annotated pages</h2><div className="chips">{withShots.map((p) => <Link key={p.id} className="chip" to={rlink(id, "pages", p.id)}>▣ {p.label}</Link>)}</div></>
      ) : <div className="noshot" style={{ minHeight: 120 }}>📷 No page screenshots in this run.</div>}
      <h2 className="sec">Component gallery</h2>
      {Object.keys(groups).sort().map((t) => (
        <div key={t}><h2 className="sec">{t} <span className="muted" style={{ fontWeight: 400 }}>({groups[t].length})</span></h2>
          <div className="chips">{groups[t].slice(0, 40).map((c) => <IdChip key={c.id} refId={c.id} text={c.label || c.type} />)}{groups[t].length > 40 ? <span className="muted"> +{groups[t].length - 40}</span> : null}</div>
        </div>
      ))}
    </>
  );
}

/* ============ COVERAGE ============ */
export function Coverage() {
  const { id, model } = useM();
  const mods = (model.coverageMap || []).filter((h) => h.kind === "module");
  const pages = (model.coverageMap || []).filter((h) => h.kind === "page");
  const cell = (h: any, view: string) => <Link key={h.id} className={"hc " + h.status} to={rlink(id, view, h.id)} style={{ color: "#fff", textDecoration: "none" }}><span>{h.label}</span><small>{tc(h.status.replace("_", " "))} · {Math.round(h.confidence)}%</small></Link>;
  return (
    <>
      <Head title="Coverage Map" sub="Discovery status per module and page (the requested visual coverage view). Green = discovered, yellow = partial, red = blocked, gray = low certainty. This maps discovery only." />
      <div className="legend"><span><span className="dot g" /> Discovered</span><span><span className="dot y" /> Partial</span><span><span className="dot r" /> Blocked</span><span><span className="dot n" /> Low certainty</span></div>
      <h2 className="sec">Business modules</h2><div className="heat">{mods.map((h) => cell(h, "modules"))}</div>
      <h2 className="sec">Pages</h2><div className="heat">{pages.map((h) => cell(h, "pages"))}</div>
    </>
  );
}

/* ============ TIMELINE ============ */
export function Timeline() {
  const { model } = useM();
  const [upTo, setUpTo] = useState(model.timeline.length);
  function replay() { setUpTo(0); let i = 0; const t = setInterval(() => { i++; setUpTo(i); if (i >= model.timeline.length) clearInterval(t); }, 380); }
  return (
    <>
      <Head title="Discovery Timeline" sub="Replay how the crawl explored the application, step by step." />
      <div className="row" style={{ marginBottom: ".8rem" }}><button className="btn" onClick={replay}>▶ Replay</button><button className="btn" onClick={() => setUpTo(model.timeline.length)}>Show all</button><span className="dim">{Math.min(upTo, model.timeline.length)} / {model.timeline.length} events</span></div>
      <div className="tl">{model.timeline.map((e, i) => (<div key={e.seq} className={"ev " + e.kind + (i >= upTo ? " dim" : "")}><div className="el">{e.label}</div><div className="ed">{e.detail}</div></div>))}</div>
    </>
  );
}

/* ============ VALIDATION ============ */
export function Validation() {
  const { model } = useM();
  const v = model.validation, s = model.summary;
  const kpi = (val: React.ReactNode, l: string) => <div className="card kpi"><div className="kv">{val}</div><div className="kl">{l}</div></div>;
  return (
    <>
      <Head title="Discovery Validation" sub="A self-audit of how thoroughly the crawl explored — process completeness, never application testing." />
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", marginBottom: "1rem" }}>
        {kpi((s.discoveryConfidence ?? 0) + "%", "Discovery Confidence")}{kpi((v.overallDiscoveryCompleteness ?? 0) + "%", "Completeness")}
        {kpi(s.pagesVisited, "Pages Visited")}{kpi((s.pagesSkipped || []).length, "Skipped")}
        {kpi(s.pagesNotReachable, "Not Reachable")}{kpi(s.hiddenRevealed, "Hidden Revealed")}
        {kpi(s.formsFound, "Forms Found")}{kpi(s.authenticationProtected, "Auth Protected")}
      </div>
      <div className="panel"><div className="ph">Exploration technique checks</div><div className="pb">
        {(v.checks || []).map((c: any, i: number) => (
          <div key={i} className="between" style={{ padding: ".4rem 0", borderBottom: "1px solid var(--border)" }}>
            <span>{tc(c.check.replace(/-/g, " "))}</span>
            <span className="row">{c.status === "pass" ? <span className="badge g">✔ pass</span> : c.status === "blocked" ? <span className="badge r">⛔ blocked</span> : <span className="badge y">⚠ {c.status}</span>}<span className="muted" style={{ fontSize: 12, maxWidth: "46ch", textAlign: "right" }}>{c.detail}</span></span>
          </div>
        ))}
      </div></div>
      <h2 className="sec">States observed vs not observed</h2>
      <div className="row">{(s.statesObserved || []).map((x: string) => <span key={x} className="badge g">{tc(x)}</span>)}{(s.statesNotObserved || []).map((x: string) => <span key={x} className="badge n">{tc(x.replace(/_/g, " "))}</span>)}</div>
    </>
  );
}

/* ============ MANUAL REVIEW ============ */
export function ManualReview() {
  const { model } = useM();
  if (!model.manualReview.length) return <><Head title="Manual Review Required" /><div className="empty">Nothing was blocked — auto-discovery reached everything it attempted.</div></>;
  return (
    <>
      <Head title="Manual Review Required" sub="Where automated discovery was blocked and a human must go explore. Not a to-test list — a hand-off pointer." />
      <div className="tblwrap"><table className="tbl">
        <thead><tr><th>Item</th><th>Blocked by</th><th>Why</th><th>Where a human looks next</th></tr></thead>
        <tbody>{model.manualReview.map((e: any, i: number) => (
          <tr key={i}><td><span className="badge r">⚑ {tc((e.blockerType || "").replace(/_/g, " "))}</span></td><td>{e.blockerType}</td><td>{e.reason}</td><td>{e.humanShouldLookAt}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

/* ============ CHECKLIST ============ */
export function Checklist() {
  const { id, model } = useM();
  const KEY = "iqad:ck:" + id;
  const [state, setState] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } });
  const save = (s: Record<string, boolean>) => { setState(s); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  const groups = [{ label: "Global", items: model.checklist.global }, ...model.checklist.pageWise.map((pw) => ({ label: pw.pageLabel, items: pw.items }))];
  const all = groups.flatMap((g) => g.items);
  const done = all.filter((i) => state[i.id]).length;
  return (
    <>
      <Head title="QA Checklist" sub="Tick-off items — bare labels naming a discovered surface. Not test cases, no steps, no verdicts. Ticks persist in this browser." />
      <div className="between"><div className="dim">{done} of {all.length} ticked ({all.length ? Math.round(done / all.length * 100) : 0}%)</div><button className="btn sm" onClick={() => save({})}>Reset ticks</button></div>
      <div className="progressbar"><i style={{ width: (all.length ? done / all.length * 100 : 0) + "%" }} /></div>
      {groups.map((g) => (
        <div key={g.label} className="ck-group"><h3>{g.label}</h3><div className="ck-items">
          {g.items.map((it) => (
            <span key={it.id} className={"ck" + (state[it.id] ? " done" : "")} onClick={() => save({ ...state, [it.id]: !state[it.id] })}><span className="box">✓</span>{it.label}</span>
          ))}
        </div></div>
      ))}
    </>
  );
}

/* ============ ASSISTANT (deterministic) ============ */
export function Assistant() {
  const M = useM();
  const [msgs, setMsgs] = useState<{ role: "u" | "a"; html: React.ReactNode }[]>([
    { role: "a", html: <>Hi — I answer from the discovery model of <b>{M.model.meta.appName}</b>. Try a suggestion, or ask e.g. "show all tables" or "pages related to login". I only report what was discovered.</> },
  ]);
  const [input, setInput] = useState("");
  const suggests = ["Show payment components", "Show pages containing login", "Show hidden menus", "Show all forms", "Show components in Authentication", "Show everything behind authentication", "Show flows", "Show manual review"];
  function ask(qRaw: string) {
    const q = qRaw.trim(); if (!q) return;
    setMsgs((m) => [...m, { role: "u", html: q }, { role: "a", html: answer(M, q) }]);
    setInput("");
  }
  return (
    <>
      <Head title="AI Assistant" sub="Ask about what was discovered. Answers come only from the discovery model — nothing is invented." />
      <div className="suggest">{suggests.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
      <div className="panel chat">
        <div className="msgs">{msgs.map((m, i) => <div key={i} className={"msg " + m.role}>{m.html}</div>)}</div>
        <div className="compose">
          <input value={input} placeholder="Ask about pages, components, features, forms…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(input); }} />
          <button className="btn primary" onClick={() => ask(input)}>Ask</button>
        </div>
      </div>
    </>
  );
}
function answer(M: ReturnType<typeof useM>, q: string): React.ReactNode {
  const { id, model, idx } = M;
  const ql = q.toLowerCase();
  const chips = (items: any[], view: string) => <div className="res">{items.slice(0, 40).map((x) => <IdChip key={x.id} refId={x.id} text={x.label || x.name || x.endpointPattern || x.type} />)}{items.length > 40 ? <span className="muted">+{items.length - 40} more</span> : null}</div>;
  if (/behind (auth|login)|protected|authenticated/.test(ql)) {
    const ap = model.pages.filter((p) => p.authRequired); const mr = model.manualReview.filter((e: any) => e.blockerType === "auth_gated");
    if (!ap.length && !mr.length) return "No authentication-gated surface was reached as a guest. Auth-gated areas would appear under Manual Review.";
    return <>Authentication-gated surface: {chips(ap, "pages")}{mr.length ? <div className="muted" style={{ fontSize: 12 }}>{mr.length} auth block(s) in Manual Review.</div> : null}</>;
  }
  if (/hidden/.test(ql)) return model.hidden.length ? <>Hidden elements: {chips(model.hidden.map((h: any) => ({ id: h.id, label: tc(h.type.replace(/-/g, " ")) + " · " + h.revealTrigger })), "hidden")}</> : "No hidden elements discovered.";
  if (/all forms|show forms/.test(ql) || (/form/.test(ql) && !/component/.test(ql))) return model.forms.length ? <>Forms: {chips(model.forms, "forms")}</> : "No forms discovered.";
  if (/flows?/.test(ql)) return model.flows.length ? <>Flows: {chips(model.flows, "flows")}</> : "No flows inferred.";
  if (/manual review|blocked/.test(ql)) return model.manualReview.length ? <>Manual review: {model.manualReview.map((e: any, i: number) => <span key={i} className="chip" style={{ cursor: "default" }}>{tc((e.blockerType || "").replace(/_/g, " "))}</span>)}</> : "Nothing needs manual review.";
  const inMatch = ql.match(/(?:in|inside|within|of)\s+([a-z0-9 &]+)$/);
  if (/component/.test(ql) && inMatch) {
    const term = inMatch[1].trim(); const mod = model.modules.find((m) => m.name.toLowerCase().includes(term) || term.includes(m.name.toLowerCase()));
    if (mod) { const comps = mod.componentIds.map((cid) => idx.component[cid]).filter(Boolean); return comps.length ? <>Components in <b>{mod.name}</b>: {chips(comps, "components")}</> : `No components linked to ${mod.name}.`; }
  }
  const pMatch = ql.match(/pages?\s+(?:containing|with|related to|about|for|matching)\s+([a-z0-9 &-]+)$/);
  if (pMatch) { const t = pMatch[1].trim(); const ps = model.pages.filter((p) => (p.label + " " + p.archetype + " " + p.url).toLowerCase().includes(t)); return ps.length ? <>Pages matching "{t}": {chips(ps, "pages")}</> : `No pages match "${t}".`; }
  let hits: any[] = [];
  if (/\btable/.test(ql)) hits = model.components.filter((c) => c.type === "table");
  else if (/\bbutton/.test(ql)) hits = model.components.filter((c) => c.type === "button");
  else if (/\bchart/.test(ql)) hits = model.components.filter((c) => c.type === "chart");
  else if (/\bsearch bar|search box/.test(ql)) hits = model.components.filter((c) => c.type === "search");
  else if (/\bupload/.test(ql)) hits = model.components.filter((c) => c.type === "upload");
  if (hits.length) return <>Found {hits.length}: {chips(hits, "components")}</>;
  const kw = ql.replace(/^(show|find|list|all|the|me|give)\s+/g, "").replace(/\bcomponents?\b|\bpages?\b/g, "").trim() || ql;
  let idxHits = model.searchIndex.filter((e) => e.keywords.includes(kw));
  if (/component/.test(ql)) idxHits = idxHits.filter((e) => e.kind === "component");
  else if (/page/.test(ql)) idxHits = idxHits.filter((e) => e.kind === "page");
  if (!idxHits.length) return `I found nothing matching "${q}" in the discovery model. Try a page name, a component type (button, table, form), or a module (e.g. Payment).`;
  const byKind: Record<string, any[]> = {}; idxHits.forEach((h) => (byKind[h.kind] = byKind[h.kind] || []).push(h));
  return <>Found {idxHits.length} match(es):{Object.keys(byKind).map((k) => (
    <div key={k} style={{ marginTop: ".4rem" }}><b>{tc(k)}s</b> <div className="res">{byKind[k].slice(0, 24).map((h) => <Link key={h.id} className="chip" to={rlink(id, h.view, h.id)}>{h.label}</Link>)}</div></div>
  ))}</>;
}

/* ============ SETTINGS / EXPORTS ============ */
export function Settings() {
  const { id, model } = useM();
  function download(name: string, data: string, mime: string) {
    const blob = new Blob([data], { type: mime }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const csv = (headers: string[], rows: any[][]) => { const q = (v: any) => { v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; return headers.join(",") + "\n" + rows.map((r) => r.map(q).join(",")).join("\n"); };
  const md = () => { const L = [`# QA Discovery — ${model.meta.appName}`, "", `URL: ${model.meta.appUrl}`, `Run: ${model.meta.runId}`, "", "## Business Modules"]; model.modules.forEach((m) => L.push(`- ${m.name} (${m.features.map((f) => f.label).join(", ")})`)); L.push("", "## Pages"); model.pages.forEach((p) => L.push(`- ${p.label} — ${p.url}`)); L.push("", "## Manual Review"); model.manualReview.forEach((e: any) => L.push(`- ${tc((e.blockerType || "").replace(/_/g, " "))}: ${e.reason}`)); return L.join("\n") + "\n"; };
  return (
    <>
      <Head title="Settings & Exports" sub="Everything below is derived from the same discovery model." />
      <div className="split">
        <div className="panel"><div className="ph">⤓ Exports</div><div className="pb"><div className="chips" style={{ gap: ".5rem" }}>
          <a className="btn sm" href={api.modelExportUrl(id)}>Discovery Model JSON</a>
          <button className="btn sm" onClick={() => download("portal-model.json", JSON.stringify(model, null, 2), "application/json")}>Portal Model JSON</button>
          <button className="btn sm" onClick={() => download("discovery.md", md(), "text/markdown")}>Markdown</button>
          <button className="btn sm" onClick={() => download("components.csv", csv(["id", "type", "label", "page", "scope", "businessFunction", "confidence"], model.components.map((c) => [c.id, c.type, c.label, c.page, c.scope, c.businessFunction || "", c.confidence])), "text/csv")}>Components CSV</button>
          <button className="btn sm" onClick={() => download("pages.csv", csv(["id", "label", "url", "components", "forms", "confidence"], model.pages.map((p) => [p.id, p.label, p.url, p.componentIds.length, p.formIds.length, p.confidence])), "text/csv")}>Pages CSV</button>
          <button className="btn sm" onClick={() => window.print()}>PDF / Print</button>
        </div><p className="muted" style={{ fontSize: 12.5, marginTop: ".7rem" }}>JSON / CSV / Markdown download the same discovered data. PDF uses your browser's print dialog.</p></div></div>
        <div className="panel"><div className="ph">⚙ Run info</div><div className="pb"><dl className="kv-list">
          <dt>Roles crawled</dt><dd>{model.meta.roles.map(tc).join(", ")}</dd>
          <dt>Run ID</dt><dd className="mono">{model.meta.runId}</dd>
          <dt>Generated</dt><dd>{model.meta.generatedAt}</dd>
          <dt>Schema</dt><dd className="mono">{model.meta.schemaVersion}</dd>
        </dl></div></div>
      </div>
      <div className="panel" style={{ marginTop: ".85rem" }}><div className="ph">Scope</div><div className="pb dim" style={{ fontSize: 13 }}>Discovery only — this presents what exists for a human tester to explore. It does not evaluate behaviour, produce verdicts, or exercise any API.</div></div>
    </>
  );
}
