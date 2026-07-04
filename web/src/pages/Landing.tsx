import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { Conf, timeAgo, useTheme } from "../lib/util";
import { NewsWidgets } from "../lib/NewsWidgets";

export default function Landing() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const nav = useNavigate();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {});
    api.stats().then(setStats).catch(() => {});
  }, []);

  async function discover(target?: string) {
    const u = (target ?? url).trim();
    if (!u) return;
    const withProto = /^https?:\/\//i.test(u) ? u : "https://" + u;
    setBusy(true); setErr("");
    try { const { id } = await api.discover(withProto); nav(`/discover/${id}`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="landing">
      <div className="lnav">
        <div className="brandmark"><span className="logo">Q</span> Intelli QA Discover</div>
        <div className="spacer" />
        <Link className="btn sm" to="/projects">Projects</Link>
        <Link className="btn sm" to="/discoveries">History</Link>
        <button className="btn sm" onClick={toggle} title="Toggle theme">{theme === "dark" ? "◑" : "◐"}</button>
      </div>

      <div className="lhero">
        <div className="badge a" style={{ marginBottom: ".8rem" }}>Discovery platform · not a testing tool</div>
        <h1>Intelli QA Discover</h1>
        <div className="tagline">Discover Everything Before You Test Anything</div>

        <div className="discoverbox">
          <input autoFocus placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") discover(); }} disabled={busy} />
          <button className="btn primary" onClick={() => discover()} disabled={busy || !url.trim()}>{busy ? "Starting…" : "Discover Website →"}</button>
        </div>
        {err && <div className="lhint" style={{ color: "var(--red)" }}>{err}</div>}
        <div className="lhint">Paste any public website URL. A safe, read-only crawl maps what exists — no test cases, no pass/fail, no API testing.</div>

        <div className="lstats">
          <div className="lstat"><b>{stats?.projects ?? 0}</b><span>Projects</span></div>
          <div className="lstat"><b>{stats?.runs ?? 0}</b><span>Runs</span></div>
          <div className="lstat"><b>{(stats?.components ?? 0).toLocaleString()}</b><span>Components</span></div>
          <div className="lstat"><b>{stats?.pages ?? 0}</b><span>Pages</span></div>
          <div className="lstat"><b>{stats?.features ?? 0}</b><span>Features</span></div>
        </div>

        <div className="row" style={{ marginTop: "1.4rem", justifyContent: "center", gap: ".5rem" }}>
          <button className="btn" onClick={() => document.querySelector<HTMLInputElement>(".discoverbox input")?.focus()}>+ New Discovery</button>
          <Link className="btn" to="/projects">Projects</Link>
          <Link className="btn" to="/discoveries">History</Link>
          <Link className="btn" to="/projects">Compare Runs</Link>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto 3rem", padding: "0 1.5rem", width: "100%" }}>
        {projects.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".6rem" }}>Projects</h3>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", marginBottom: "2rem" }}>
              {projects.slice(0, 8).map((p) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="card" style={{ color: "inherit", textDecoration: "none" }}>
                  <div className="between"><b>{p.name}</b>{p.lastConfidence != null && <Conf v={p.lastConfidence} />}</div>
                  <div className="mono muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 4 }}>{p.baseUrl}</div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>{p.runCount} run{p.runCount === 1 ? "" : "s"} · {p.lastRunAt ? timeAgo(p.lastRunAt) : "—"}</div>
                </Link>
              ))}
            </div>
          </>
        )}
        <h3 style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".6rem" }}>Latest news</h3>
        <NewsWidgets />
      </div>
    </div>
  );
}
