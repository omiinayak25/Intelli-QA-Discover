import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Conf, tc, timeAgo, useTheme } from "../lib/util";

export default function Project() {
  const { pid } = useParams();
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const [project, setProject] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [diff, setDiff] = useState<any>(null);
  const [cmpBusy, setCmpBusy] = useState(false);
  const [dna, setDna] = useState<any>(null);

  const load = () => api.getProject(pid!).then((p) => { setProject(p); setRuns(p.runs || []); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [pid]);
  useEffect(() => { api.projectDna(pid!).then(setDna).catch(() => setDna(null)); }, [pid]);

  async function rediscover() { if (!project) return; const { id } = await api.discover(project.baseUrl); nav(`/discover/${id}`); }
  async function del(id: string) { if (confirm("Delete this run?")) { await api.remove(id); load(); } }
  async function compare() {
    if (!from || !to || from === to) return;
    setCmpBusy(true); setDiff(null);
    try { const res = await api.compare(pid!, from, to); setDiff(res.diff); } finally { setCmpBusy(false); }
  }
  const done = runs.filter((r) => r.status === "done");

  if (!project) return <div className="center"><div className="spin-lg" /></div>;
  return (
    <div style={{ minHeight: "100%" }}>
      <div className="lnav">
        <Link className="brandmark" to="/projects" style={{ color: "inherit" }}><span className="logo">Q</span> Intelli QA Discover</Link>
        <div className="spacer" />
        <button className="btn primary sm" onClick={rediscover}>↻ New run for this project</button>
        <button className="btn sm" onClick={toggle}>{theme === "dark" ? "◑" : "◐"}</button>
      </div>
      <div className="hwrap">
        <div className="crumbs"><Link to="/projects">Projects</Link> › {project.name}</div>
        <div className="hhead">
          <div><h1 style={{ margin: 0, fontSize: 22 }}>{project.name}</h1><div className="mono muted">{project.baseUrl}</div></div>
          <span className="pill">{runs.length} run(s)</span>
        </div>

        <div className="grid kpis" style={{ marginBottom: "1.2rem" }}>
          <div className="card kpi"><div className="kv">{runs.length}</div><div className="kl">Runs</div></div>
          <div className="card kpi"><div className="kv">{done[0]?.counts?.pages ?? "—"}</div><div className="kl">Pages (latest)</div></div>
          <div className="card kpi"><div className="kv">{done[0]?.counts?.components ?? "—"}</div><div className="kl">Components (latest)</div></div>
          <div className="card kpi"><div className="kv">{done[0]?.confidence != null ? Math.round(done[0].confidence) + "%" : "—"}</div><div className="kl">Confidence (latest)</div></div>
        </div>

        {dna && !dna.error && (
          <>
            <h2 className="sec">🧬 Application DNA <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· evidence-based, from accumulated knowledge</span></h2>
            <div className="split">
              <div className="panel"><div className="ph">Fingerprint</div><div className="pb"><dl className="kv-list">
                <dt>Business domain</dt><dd>{dna.domain} <Conf v={dna.domainConfidence} /><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>evidence: {(dna.domainEvidence || []).slice(0, 6).join(", ") || "—"}</div></dd>
                <dt>Technology</dt><dd>{(dna.tech || []).length ? dna.tech.map((t: any) => <span key={t.name} className="tag" title={"evidence: " + t.evidence}>{t.name}</span>) : <span className="muted">not detected</span>}</dd>
                <dt>Business modules</dt><dd><div className="chips">{(dna.modules || []).map((m: string) => <span key={m} className="chip" style={{ cursor: "default" }}>{m}</span>)}</div></dd>
              </dl></div></div>
              <div className="panel"><div className="ph">Similar applications</div><div className="pb">
                {(dna.similar || []).length === 0 ? <div className="muted">No comparable applications discovered yet — discover more websites to grow the knowledge.</div> : dna.similar.map((s: any) => (
                  <Link key={s.runId} to={`/projects/${s.projectId}`} className="between" style={{ padding: ".4rem 0", borderBottom: "1px solid var(--border)", color: "inherit", textDecoration: "none" }}>
                    <span><b>{s.appName}</b> <span className="muted" style={{ fontSize: 12 }}>· {s.domain}</span><div className="muted" style={{ fontSize: 11 }}>{(s.reasons || []).join(" · ") || "few shared signals"}</div></span>
                    <span className={"badge " + (s.score >= 60 ? "g" : s.score >= 35 ? "y" : "n")}>{s.score}%</span>
                  </Link>
                ))}
              </div></div>
            </div>
          </>
        )}

        <h2 className="sec">Discovery Runs</h2>
        <div className="tblwrap"><table className="tbl">
          <thead><tr><th>Run</th><th>Status</th><th>Confidence</th><th>Pages</th><th>Components</th><th>Features</th><th>When</th><th></th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.runId}</td>
              <td><span className={`badge ${r.status === "done" ? "g" : r.status === "error" ? "r" : "a"}`}>{r.status}</span></td>
              <td>{r.status === "done" ? <Conf v={r.confidence} /> : "—"}</td>
              <td>{r.counts?.pages ?? "—"}</td><td>{r.counts?.components ?? "—"}</td><td>{r.counts?.features ?? "—"}</td>
              <td className="muted">{timeAgo(r.createdAt)}</td>
              <td><div className="row">
                {r.status === "done" && <Link className="btn sm" to={`/discoveries/${r.id}`}>Open</Link>}
                {r.status === "running" && <Link className="btn sm" to={`/discover/${r.id}`}>Progress</Link>}
                <button className="btn sm danger" onClick={() => del(r.id)}>✕</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>

        {done.length >= 2 && (
          <>
            <h2 className="sec">Compare Runs</h2>
            <div className="panel"><div className="pb">
              <div className="row" style={{ marginBottom: ".7rem" }}>
                <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">From run…</option>{done.map((r) => <option key={r.id} value={r.id}>{r.runId} · {timeAgo(r.createdAt)}</option>)}</select>
                <span className="muted">→</span>
                <select className="input" value={to} onChange={(e) => setTo(e.target.value)}><option value="">To run…</option>{done.map((r) => <option key={r.id} value={r.id}>{r.runId} · {timeAgo(r.createdAt)}</option>)}</select>
                <button className="btn primary sm" onClick={compare} disabled={!from || !to || from === to || cmpBusy}>{cmpBusy ? "Comparing…" : "Compare"}</button>
              </div>
              {diff && <CompareResult diff={diff} />}
            </div></div>
          </>
        )}

        <h2 className="sec">Project Settings</h2>
        <div className="panel"><div className="pb"><dl className="kv-list">
          <dt>Project ID</dt><dd className="mono">{project.id}</dd>
          <dt>Base URL</dt><dd className="mono">{project.baseUrl}</dd>
          <dt>Slug</dt><dd className="mono">{project.slug}</dd>
          <dt>Created</dt><dd>{project.createdAt}</dd>
        </dl></div></div>
      </div>
    </div>
  );
}

function CompareResult({ diff }: { diff: any }) {
  const grp = (s: string) => diff.entries.filter((e: any) => e.status === s);
  return (
    <>
      <div className="tblwrap" style={{ marginBottom: ".8rem" }}><table className="tbl">
        <thead><tr><th>Category</th><th>New</th><th>Removed</th><th>Changed</th><th>Unchanged</th></tr></thead>
        <tbody>{Object.entries(diff.byCategory).map(([cat, c]: any) => (
          <tr key={cat}><td>{tc(cat.replace(/_/g, " "))}</td>
            <td>{c.new ? <span className="badge g">+{c.new}</span> : 0}</td>
            <td>{c.removed ? <span className="badge r">−{c.removed}</span> : 0}</td>
            <td>{c.changed ? <span className="badge y">~{c.changed}</span> : 0}</td>
            <td className="muted">{c.unchanged}</td></tr>
        ))}</tbody>
      </table></div>
      {(["new", "removed", "changed"] as const).map((s) => grp(s).length ? (
        <div key={s} style={{ marginBottom: ".6rem" }}>
          <b style={{ color: s === "new" ? "var(--green)" : s === "removed" ? "var(--red)" : "var(--yellow)" }}>{s.toUpperCase()} ({grp(s).length})</b>
          <div className="chips" style={{ marginTop: ".3rem" }}>{grp(s).slice(0, 30).map((e: any) => <span key={e.id} className="chip" style={{ cursor: "default" }}>{e.label} <span className="muted">({e.category})</span></span>)}{grp(s).length > 30 ? <span className="muted">+{grp(s).length - 30}</span> : null}</div>
        </div>
      ) : null)}
    </>
  );
}
