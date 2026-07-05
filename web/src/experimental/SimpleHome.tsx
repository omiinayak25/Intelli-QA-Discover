import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useTheme, timeAgo } from "../lib/util";
import { setFlag, track } from "./flags";

/**
 * Experimental "Simple Home" — Apple-minimal. One URL box, one action, four
 * intents, recent projects. Nothing else. Fully behind the experimentalUX flag.
 */
export default function SimpleHome() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const nav = useNavigate();
  const { theme, toggle } = useTheme();

  useEffect(() => { api.listProjects().then(setProjects).catch(() => {}); }, []);
  const latestDone = projects.find((p) => p.lastRunAt);

  async function discover() {
    const u = url.trim(); if (!u) return;
    const withProto = /^https?:\/\//i.test(u) ? u : "https://" + u;
    setBusy(true); setErr("");
    try { track("discoveries"); const { id } = await api.discover(withProto); nav(`/discover/${id}?ux=exp`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  async function intent(kind: string) {
    if (!latestDone) { setErr("Discover a website first, then I'll take you there."); document.querySelector<HTMLInputElement>(".discoverbox input")?.focus(); return; }
    const runs = await api.getProjectRuns(latestDone.id).catch(() => []);
    const run = runs.find((r: any) => r.status === "done");
    if (!run) { nav(`/projects/${latestDone.id}`); return; }
    if (kind === "explore") nav(`/x/discoveries/${run.id}`);
    else if (kind === "find") nav(`/x/discoveries/${run.id}?intent=find`);
    else if (kind === "test") nav(`/discoveries/${run.id}/checklist`);
    else if (kind === "advanced") nav(`/discoveries/${run.id}`);
  }

  const INTENTS = [
    { k: "explore", icon: "🧭", title: "Explore Application", sub: "Understand what this app does in 5 minutes" },
    { k: "find", icon: "🔎", title: "Find a Feature", sub: "Ask for anything — login, payment, upload…" },
    { k: "test", icon: "✅", title: "Start Manual Testing", sub: "Open the tick-off checklist of what exists" },
    { k: "advanced", icon: "⚙️", title: "Advanced Workspace", sub: "The full explorer — every view & metric" },
  ];

  return (
    <div className="simple-home">
      <div className="sh-nav">
        <div className="brandmark"><span className="logo">Q</span> Intelli QA Discover</div>
        <div className="spacer" />
        <button className="btn sm" onClick={() => { setFlag("experimentalUX", false); nav("/"); }} title="Return to the classic experience">Back to classic</button>
        <button className="btn sm" onClick={toggle}>{theme === "dark" ? "◑" : "◐"}</button>
      </div>

      <div className="sh-hero">
        <h1>Intelli QA Discover</h1>
        <div className="sh-tagline">Discover Everything Before You Test Anything</div>
        <div className="discoverbox sh-box">
          <input autoFocus placeholder="Paste a website URL" value={url} disabled={busy}
            onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") discover(); }} />
          <button className="btn primary" onClick={discover} disabled={busy || !url.trim()}>{busy ? "Starting…" : "Discover Website"}</button>
        </div>
        {err && <div className="sh-err">{err}</div>}

        <div className="sh-q">What would you like to do?</div>
        <div className="sh-intents">
          {INTENTS.map((i) => (
            <button key={i.k} className="sh-intent" onClick={() => intent(i.k)}>
              <span className="ico">{i.icon}</span>
              <span className="t">{i.title}</span>
              <span className="s">{i.sub}</span>
            </button>
          ))}
        </div>

        {projects.length > 0 && (
          <div className="sh-recent">
            <div className="sh-recent-h">Recent projects</div>
            <div className="sh-recent-list">
              {projects.slice(0, 5).map((p) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="sh-recent-item">
                  <b>{p.name}</b><span className="muted">{p.runCount} run{p.runCount === 1 ? "" : "s"} · {p.lastRunAt ? timeAgo(p.lastRunAt) : "—"}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
