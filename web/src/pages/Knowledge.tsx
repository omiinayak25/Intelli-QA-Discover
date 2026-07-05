import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useTheme } from "../lib/util";

export default function Knowledge() {
  const { theme, toggle } = useTheme();
  const [ov, setOv] = useState<any>(null);
  useEffect(() => { api.knowledgeOverview().then(setOv).catch(() => {}); }, []);

  return (
    <div style={{ minHeight: "100%" }}>
      <div className="lnav">
        <Link className="brandmark" to="/" style={{ color: "inherit" }}><span className="logo">Q</span> Intelli QA Discover</Link>
        <div className="spacer" />
        <Link className="btn sm" to="/projects">Projects</Link>
        <Link className="btn primary sm" to="/">+ New Discovery</Link>
        <button className="btn sm" onClick={toggle}>{theme === "dark" ? "◑" : "◐"}</button>
      </div>
      <div className="hwrap">
        <div className="crumbs">Collective Intelligence</div>
        <div className="hhead">
          <div><h1 style={{ margin: 0, fontSize: 22 }}>Knowledge Base</h1><p className="dim" style={{ margin: ".2rem 0 0" }}>What the platform has learned across <b>{ov?.applications ?? 0}</b> discovered application(s). Answers are evidence-based — never invented.</p></div>
        </div>

        <div className="grid kpis" style={{ marginBottom: "1.4rem" }}>
          <div className="card kpi"><div className="kv">{ov?.applications ?? 0}</div><div className="kl">Applications</div></div>
          <div className="card kpi"><div className="kv">{ov?.runsIndexed ?? 0}</div><div className="kl">Runs indexed</div></div>
          <div className="card kpi"><div className="kv">{(ov?.totals?.components ?? 0).toLocaleString()}</div><div className="kl">Components</div></div>
          <div className="card kpi"><div className="kv">{ov?.totals?.pages ?? 0}</div><div className="kl">Pages</div></div>
          <div className="card kpi"><div className="kv">{ov?.domains?.length ?? 0}</div><div className="kl">Business domains</div></div>
          <div className="card kpi"><div className="kv">{ov?.technologies?.length ?? 0}</div><div className="kl">Technologies</div></div>
        </div>

        <KnowledgeAssistant />

        <div className="split" style={{ marginTop: "1.4rem" }}>
          <EnterpriseSearch />
          <div>
            <Dist title="Business domains" items={ov?.domains} route="" />
            <div style={{ height: ".85rem" }} />
            <Dist title="Technologies detected" items={ov?.technologies} />
          </div>
        </div>

        <div className="split" style={{ marginTop: ".85rem" }}>
          <Dist title="Most common business modules" items={ov?.topModules} />
          <Dist title="Component types across all apps" items={ov?.componentTypes} />
        </div>
      </div>
    </div>
  );
}

function Dist({ title, items }: { title: string; items?: { name: string; count: number }[]; route?: string }) {
  const max = Math.max(1, ...(items || []).map((i) => i.count));
  return (
    <div className="panel"><div className="ph">{title}</div><div className="pb">
      {!items || items.length === 0 ? <div className="muted">No data yet.</div> : items.slice(0, 12).map((i) => (
        <div key={i.name} style={{ marginBottom: ".45rem" }}>
          <div className="between" style={{ fontSize: 13 }}><span>{i.name}</span><span className="muted mono">{i.count}</span></div>
          <div className="progressbar" style={{ margin: ".15rem 0 0" }}><i style={{ width: (i.count / max) * 100 + "%" }} /></div>
        </div>
      ))}
    </div></div>
  );
}

function EnterpriseSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  async function run() { if (!q.trim()) return; setBusy(true); try { setRes(await api.knowledgeSearch(q)); } finally { setBusy(false); } }
  return (
    <div className="panel"><div className="ph">🔎 Enterprise search — across all projects</div><div className="pb">
      <div className="row" style={{ marginBottom: ".6rem" }}>
        <input className="input" style={{ flex: 1 }} placeholder="e.g. login, payment, upload, chart, Material UI…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
        <button className="btn primary sm" onClick={run} disabled={busy}>{busy ? "…" : "Search"}</button>
      </div>
      {res && (res.results.length === 0 ? <div className="muted">No application matches “{res.query}”.</div> : (
        <div>{res.results.map((r: any) => (
          <Link key={r.runId} to={`/discoveries/${r.runId}`} className="card" style={{ display: "block", marginBottom: ".5rem", color: "inherit", textDecoration: "none" }}>
            <div className="between"><b>{r.appName}</b><span className="tag">{r.count} hit(s)</span></div>
            <div className="muted" style={{ fontSize: 12 }}>{r.domain} · {r.url}</div>
            <div className="chips" style={{ marginTop: ".4rem" }}>{r.hits.map((h: any, i: number) => <span key={i} className="chip" style={{ cursor: "default" }}><span className="muted">{h.kind}:</span> {h.value.slice(0, 40)}</span>)}</div>
          </Link>
        ))}</div>
      ))}
    </div></div>
  );
}

function KnowledgeAssistant() {
  const [msgs, setMsgs] = useState<{ role: "u" | "a"; node: React.ReactNode }[]>([
    { role: "a", node: <>I reason across every application discovered so far — strictly from stored evidence. Try the suggestions, or ask e.g. “which applications use Material UI?” or “compare Ifasonline vs Rynoxgear”.</> },
  ]);
  const [input, setInput] = useState("");
  const suggests = ["Which applications have Payment?", "Find education platforms", "Which applications use charts?", "Which applications use React?", "Find applications similar to Ifasonline", "Which applications support multiple languages?"];
  async function ask(qRaw: string) {
    const q = qRaw.trim(); if (!q) return;
    setMsgs((m) => [...m, { role: "u", node: q }]); setInput("");
    const a = await api.knowledgeAsk(q);
    setMsgs((m) => [...m, { role: "a", node: renderAnswer(a) }]);
  }
  return (
    <div>
      <div className="suggest">{suggests.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
      <div className="panel chat" style={{ maxHeight: 420 }}>
        <div className="msgs">{msgs.map((m, i) => <div key={i} className={"msg " + m.role}>{m.node}</div>)}</div>
        <div className="compose">
          <input value={input} placeholder="Ask across all discovered applications…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(input); }} />
          <button className="btn primary" onClick={() => ask(input)}>Ask</button>
        </div>
      </div>
    </div>
  );
}

function renderAnswer(a: any): React.ReactNode {
  if (a.kind === "compare" && a.similarity) {
    return <><b>{a.answer}</b><div style={{ marginTop: ".4rem" }} className="muted">{a.similarity.reasons.join(" · ") || "few shared signals"}</div>
      {a.similarity.sharedModules?.length ? <div className="res">{a.similarity.sharedModules.map((m: string, i: number) => <span key={i} className="chip" style={{ cursor: "default" }}>{m}</span>)}</div> : null}</>;
  }
  if (a.kind === "similar") {
    return <><b>{a.answer}</b><div className="res">{(a.results || []).map((r: any, i: number) => <Link key={i} className="chip" to={`/projects/${r.projectId}`}>{r.appName} · {r.score}%</Link>)}</div></>;
  }
  const results = a.results || [];
  return (
    <><b>{a.answer}</b>
      {results.length > 0 && <div style={{ marginTop: ".4rem" }}>{results.map((r: any, i: number) => (
        <div key={i} style={{ marginTop: ".35rem" }}>
          <Link to={r.runId ? `/discoveries/${r.runId}` : `/projects/${r.projectId}`}><b>{r.appName}</b></Link>{r.domain ? <span className="muted"> · {r.domain}</span> : null}
          {(r.evidence || r.hits) && <div className="chips" style={{ marginTop: ".2rem" }}>{(r.evidence || (r.hits || []).map((h: any) => `${h.kind}: ${h.value}`)).slice(0, 5).map((e: string, j: number) => <span key={j} className="chip" style={{ cursor: "default", fontSize: 11 }}>{String(e).slice(0, 48)}</span>)}</div>}
        </div>
      ))}</div>}
    </>
  );
}
