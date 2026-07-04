import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Conf, timeAgo, useTheme } from "../lib/util";

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const { theme, toggle } = useTheme();
  useEffect(() => { api.listProjects().then(setProjects).catch(() => {}); }, []);
  const view = projects.filter((p) => !q.trim() || (p.name + " " + p.baseUrl).toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ minHeight: "100%" }}>
      <div className="lnav">
        <Link className="brandmark" to="/" style={{ color: "inherit" }}><span className="logo">Q</span> Intelli QA Discover</Link>
        <div className="spacer" />
        <Link className="btn primary sm" to="/">+ New Discovery</Link>
        <Link className="btn sm" to="/discoveries">All Runs</Link>
        <button className="btn sm" onClick={toggle}>{theme === "dark" ? "◑" : "◐"}</button>
      </div>
      <div className="hwrap">
        <div className="hhead"><h1 style={{ margin: 0, fontSize: 22 }}>Projects</h1><span className="pill">{projects.length} project(s)</span></div>
        <div className="htoolbar"><input className="input" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} /></div>
        {view.length === 0 ? <div className="empty">No projects yet. <Link to="/">Discover a website →</Link></div> : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
            {view.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="card" style={{ color: "inherit", textDecoration: "none" }}>
                <div className="between" style={{ marginBottom: ".3rem" }}><b>{p.name}</b>{p.lastConfidence != null && <Conf v={p.lastConfidence} />}</div>
                <div className="mono muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.baseUrl}</div>
                <div className="row" style={{ marginTop: ".6rem", justifyContent: "space-between" }}>
                  <span className="tag">{p.runCount} run{p.runCount === 1 ? "" : "s"}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{p.lastRunAt ? timeAgo(p.lastRunAt) : "—"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
