import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import type { DiscoveryRecord } from "../lib/types";
import { Conf, tc, timeAgo, useTheme } from "../lib/util";

export default function Landing() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [recent, setRecent] = useState<DiscoveryRecord[]>([]);
  const nav = useNavigate();
  const { theme, toggle } = useTheme();

  useEffect(() => { api.listDiscoveries().then(setRecent).catch(() => {}); }, []);

  async function discover(target?: string) {
    const u = (target ?? url).trim();
    if (!u) return;
    const withProto = /^https?:\/\//i.test(u) ? u : "https://" + u;
    setBusy(true); setErr("");
    try {
      const { id } = await api.discover(withProto);
      nav(`/discover/${id}`);
    } catch (e) {
      setErr((e as Error).message); setBusy(false);
    }
  }

  const done = recent.filter((r) => r.status === "done");
  const totalPages = done.reduce((a, r) => a + (r.counts?.pages || 0), 0);
  const totalComps = done.reduce((a, r) => a + (r.counts?.components || 0), 0);

  return (
    <div className="landing">
      <div className="lnav">
        <div className="brandmark"><span className="logo">Q</span> Intelli QA Discover</div>
        <div className="spacer" />
        <Link className="btn sm" to="/discoveries">History</Link>
        <button className="btn sm" onClick={toggle} title="Toggle theme">{theme === "dark" ? "◑" : "◐"}</button>
      </div>

      <div className="lhero">
        <div className="badge a" style={{ marginBottom: ".8rem" }}>Discovery platform · not a testing tool</div>
        <h1>Intelli QA Discover</h1>
        <div className="tagline">Discover Everything Before You Test Anything</div>

        <div className="discoverbox">
          <input
            autoFocus placeholder="https://example.com" value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") discover(); }}
            disabled={busy}
          />
          <button className="btn primary" onClick={() => discover()} disabled={busy || !url.trim()}>
            {busy ? "Starting…" : "Discover Website →"}
          </button>
        </div>
        {err && <div className="lhint" style={{ color: "var(--red)" }}>{err}</div>}
        <div className="lhint">Paste any public website URL. A safe, read-only crawl maps what exists — no test cases, no pass/fail, no API testing.</div>

        <div className="lstats">
          <div className="lstat"><b>{done.length}</b><span>Discoveries</span></div>
          <div className="lstat"><b>{totalPages}</b><span>Pages mapped</span></div>
          <div className="lstat"><b>{totalComps.toLocaleString()}</b><span>Components found</span></div>
        </div>

        {recent.length > 0 && (
          <div className="lrecent">
            <h3>Recent discoveries</h3>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
              {recent.slice(0, 6).map((r) => (
                <Link key={r.id} to={r.status === "done" ? `/discoveries/${r.id}` : `/discover/${r.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="between"><b>{r.appName || r.url}</b>{r.status === "done" ? <Conf v={r.confidence} /> : <span className="badge n">{r.status}</span>}</div>
                  <div className="mono muted" style={{ fontSize: 12, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.url}</div>
                  {r.counts && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>{r.counts.pages} pages · {r.counts.components} components · {timeAgo(r.createdAt)}</div>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
