import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { DiscoveryRecord } from "../lib/types";
import { Conf, timeAgo, useTheme } from "../lib/util";

export default function History() {
  const [recs, setRecs] = useState<DiscoveryRecord[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"date" | "confidence" | "components">("date");
  const [filter, setFilter] = useState<"all" | "done" | "running" | "error">("all");
  const nav = useNavigate();
  const { theme, toggle } = useTheme();

  const load = () => api.listDiscoveries().then(setRecs).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  const view = useMemo(() => {
    let r = recs;
    if (filter !== "all") r = r.filter((x) => x.status === filter);
    if (q.trim()) { const t = q.toLowerCase(); r = r.filter((x) => (x.url + " " + x.appName).toLowerCase().includes(t)); }
    r = [...r].sort((a, b) =>
      sort === "confidence" ? (b.confidence || 0) - (a.confidence || 0)
      : sort === "components" ? (b.counts?.components || 0) - (a.counts?.components || 0)
      : (a.createdAt < b.createdAt ? 1 : -1));
    return r;
  }, [recs, q, sort, filter]);

  async function del(id: string) { if (confirm("Delete this discovery?")) { await api.remove(id); load(); } }
  async function rerun(url: string) { const { id } = await api.discover(url); nav(`/discover/${id}`); }

  return (
    <div style={{ minHeight: "100%" }}>
      <div className="lnav">
        <Link className="brandmark" to="/" style={{ color: "inherit" }}><span className="logo">Q</span> Intelli QA Discover</Link>
        <div className="spacer" />
        <Link className="btn primary sm" to="/">+ New Discovery</Link>
        <button className="btn sm" onClick={toggle}>{theme === "dark" ? "◑" : "◐"}</button>
      </div>
      <div className="hwrap">
        <div className="hhead"><h1 style={{ margin: 0, fontSize: 22 }}>Discovery History</h1><span className="pill">{recs.length} total</span></div>
        <div className="htoolbar">
          <input className="input" placeholder="Search by website or name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            <option value="all">All statuses</option><option value="done">Done</option><option value="running">Running</option><option value="error">Error</option>
          </select>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="date">Newest</option><option value="confidence">Confidence</option><option value="components">Components</option>
          </select>
        </div>

        {view.length === 0 ? (
          <div className="empty">No discoveries yet. <Link to="/">Start one →</Link></div>
        ) : (
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th>Website</th><th>Status</th><th>Confidence</th><th>Pages</th><th>Components</th><th>Manual Review</th><th>When</th><th></th></tr></thead>
              <tbody>
                {view.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.status === "done"
                        ? <Link to={`/discoveries/${r.id}`}><b>{r.appName || r.url}</b></Link>
                        : <Link to={`/discover/${r.id}`}><b>{r.appName || r.url}</b></Link>}
                      <div className="mono muted" style={{ fontSize: 12 }}>{r.url}</div>
                    </td>
                    <td><span className={`badge ${r.status === "done" ? "g" : r.status === "error" ? "r" : "a"}`}>{r.status}</span></td>
                    <td>{r.status === "done" ? <Conf v={r.confidence} /> : "—"}</td>
                    <td>{r.counts?.pages ?? "—"}</td>
                    <td>{r.counts?.components ?? "—"}</td>
                    <td>{r.counts?.manualReview ?? "—"}</td>
                    <td className="muted">{timeAgo(r.createdAt)}</td>
                    <td>
                      <div className="row">
                        {r.status === "done" && <Link className="btn sm" to={`/discoveries/${r.id}`}>Open</Link>}
                        <button className="btn sm" onClick={() => rerun(r.url)} title="Re-run">↻</button>
                        <button className="btn sm danger" onClick={() => del(r.id)} title="Delete">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
