import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useTheme } from "../lib/util";
import { useFlags, setFlag, resetFlags, resetMetrics, metrics, type Flags } from "../experimental/flags";

export default function Settings() {
  const { theme, toggle } = useTheme();
  const flags = useFlags();
  const nav = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => { api.stats().then(setStats).catch(() => {}); }, [busy]);

  async function clearAll() {
    if (confirm !== "DELETE") { setMsg('Type DELETE to confirm.'); return; }
    setBusy(true); setMsg("");
    try {
      const r = await api.resetAll();
      // also clear local browser data (checklist ticks, flags, metrics, theme kept)
      clearLocal(false);
      setMsg(`Cleared ${r.cleared.projects} project(s), ${r.cleared.runs} run(s), ${r.cleared.knowledge} knowledge record(s).`);
      setConfirm("");
    } catch (e) { setMsg("Error: " + (e as Error).message); } finally { setBusy(false); }
  }

  function clearLocal(notify = true) {
    // remove per-browser data: checklist ticks, tick-state, experiment flags + metrics
    try {
      for (const k of Object.keys(localStorage)) if (/^(qadisc:|iqad:ck:|iqad:metrics)/.test(k)) localStorage.removeItem(k);
    } catch {}
    resetMetrics(); resetFlags();
    if (notify) setMsg("Local browser data cleared (checklist ticks, tick state, experiment settings, metrics).");
  }

  const flagList: { key: keyof Flags; label: string; desc: string }[] = [
    { key: "experimentalUX", label: "Experimental UX (Simple Home)", desc: "Opt into the simplified, Apple-style experience." },
    { key: "guidedDiscovery", label: "Guided Discovery", desc: "5-minute guided walkthrough in the simplified report." },
    { key: "aiFirst", label: "AI-first navigation", desc: "Show the ask bar as the primary control." },
    { key: "progressiveDisclosure", label: "Progressive disclosure", desc: "Reveal technical depth only on demand." },
    { key: "smartLocation", label: "Smart component location", desc: "Closest-match highlighting with confidence." },
  ];
  const m = metrics();

  return (
    <div style={{ minHeight: "100%" }}>
      <div className="lnav">
        <Link className="brandmark" to="/" style={{ color: "inherit" }}><span className="logo">Q</span> Intelli QA Discover</Link>
        <div className="spacer" />
        <Link className="btn sm" to="/projects">Projects</Link>
        <button className="btn sm" onClick={toggle}>{theme === "dark" ? "◑" : "◐"}</button>
      </div>
      <div className="hwrap" style={{ maxWidth: 820 }}>
        <div className="hhead"><h1 style={{ margin: 0, fontSize: 22 }}>Settings</h1></div>

        <div className="panel" style={{ marginBottom: ".85rem" }}><div className="ph">Appearance</div><div className="pb">
          <div className="between"><span>Theme</span><button className="btn sm" onClick={toggle}>{theme === "dark" ? "Dark" : "Light"} — toggle</button></div>
        </div></div>

        <div className="panel" style={{ marginBottom: ".85rem" }}><div className="ph">Experimental features</div><div className="pb">
          {flagList.map((f) => (
            <label key={f.key} className="between" style={{ padding: ".5rem 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
              <span><b style={{ fontWeight: 550 }}>{f.label}</b><div className="muted" style={{ fontSize: 12 }}>{f.desc}</div></span>
              <input type="checkbox" checked={flags[f.key]} onChange={(e) => setFlag(f.key, e.target.checked)} />
            </label>
          ))}
        </div></div>

        <div className="panel" style={{ marginBottom: ".85rem" }}><div className="ph">Usage metrics (this browser)</div><div className="pb">
          <div className="chips">
            <span className="chip" style={{ cursor: "default" }}>Discoveries: {m.discoveries}</span>
            <span className="chip" style={{ cursor: "default" }}>Feature clicks: {m.featureClicks}</span>
            <span className="chip" style={{ cursor: "default" }}>Component clicks: {m.componentClicks}</span>
            <span className="chip" style={{ cursor: "default" }}>Assistant uses: {m.assistantUses}</span>
            <span className="chip" style={{ cursor: "default" }}>Highlights — exact {m.highlightExact} · closest {m.highlightClosest} · region {m.highlightRegion} · miss {m.highlightMiss}</span>
          </div>
          <div style={{ marginTop: ".6rem" }}><button className="btn sm" onClick={() => clearLocal()}>Clear local browser data</button></div>
        </div></div>

        <div className="panel" style={{ borderColor: "var(--red)" }}>
          <div className="ph" style={{ color: "var(--red)" }}>⚠ Danger zone — clear all data</div>
          <div className="pb">
            <p className="dim" style={{ marginTop: 0 }}>Permanently delete <b>every project, discovery run, screenshot, knowledge record and export</b>{stats ? <> — currently {stats.projects} project(s), {stats.runs} run(s), {(stats.components || 0).toLocaleString()} components indexed</> : ""}. This cannot be undone.</p>
            <div className="row">
              <input className="input" placeholder='Type DELETE to confirm' value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ minWidth: 200 }} />
              <button className="btn danger" onClick={clearAll} disabled={busy || confirm !== "DELETE"} style={{ borderColor: "var(--red)", color: "var(--red)" }}>{busy ? "Clearing…" : "Clear ALL data"}</button>
            </div>
            {msg && <div style={{ marginTop: ".6rem", color: msg.startsWith("Error") ? "var(--red)" : "var(--green)", fontSize: 13 }}>{msg} {msg.includes("Cleared") && <Link to="/">Go home →</Link>}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
