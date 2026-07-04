import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import type { StageProgress } from "../lib/types";
import { cx } from "../lib/util";

const STAGES = [
  "Opening browser",
  "Discovering pages",
  "Finding components",
  "Generating screenshots",
  "Generating discovery model",
  "Building business tree",
  "Rendering report",
  "Saving discovery",
];

export default function Progress() {
  const { id } = useParams();
  const nav = useNavigate();
  const [prog, setProg] = useState<StageProgress>({ stage: "Queued", pct: 0 });
  const [status, setStatus] = useState<string>("running");
  const [err, setErr] = useState("");
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!id) return;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const finish = () => { if (!closed) { closed = true; setTimeout(() => nav(`/discoveries/${id}`), 700); } };

    try {
      es = new EventSource(api.eventsUrl(id));
      es.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        if (ev.type === "progress" || ev.type === "status") { if (ev.progress) setProg(ev.progress); if (ev.status) setStatus(ev.status); }
        else if (ev.type === "done") { setStatus("done"); setProg({ stage: "Saving discovery", pct: 100 }); es?.close(); finish(); }
        else if (ev.type === "error") { setStatus("error"); setErr(ev.error || "Discovery failed"); es?.close(); }
      };
      es.onerror = () => { es?.close(); es = null; startPolling(); };
    } catch { startPolling(); }

    function startPolling() {
      if (poll) return;
      poll = setInterval(async () => {
        try {
          const s = await api.getStatus(id!);
          setStatus(s.status); if (s.progress) setProg(s.progress);
          if (s.status === "done") { clearInterval(poll!); finish(); }
          if (s.status === "error") { clearInterval(poll!); setErr(s.error || "Discovery failed"); }
        } catch {}
      }, 1500);
    }

    return () => { closed = true; es?.close(); if (poll) clearInterval(poll); };
  }, [id, nav]);

  const curIdx = Math.max(0, STAGES.findIndex((s) => s.toLowerCase() === prog.stage.toLowerCase()));
  const elapsed = Math.floor((Date.now() - startRef.current) / 1000);

  return (
    <div className="landing">
      <div className="lnav"><Link className="brandmark" to="/" style={{ color: "inherit" }}><span className="logo">Q</span> Intelli QA Discover</Link></div>
      <div className="progress-wrap">
        <h1>{status === "error" ? "Discovery failed" : "Discovering website…"}</h1>
        <p className="dim">{status === "error" ? "" : "Opening a real browser and mapping everything a tester needs to look at. This is read-only — nothing is submitted or purchased."}</p>

        {status === "error" ? (
          <div className="card" style={{ borderColor: "var(--red)", marginTop: "1rem" }}>
            <b style={{ color: "var(--red)" }}>Error:</b> {err}
            <div style={{ marginTop: ".8rem" }}><Link className="btn" to="/">← Try another URL</Link></div>
          </div>
        ) : (
          <>
            <div className="pbar"><i style={{ width: `${prog.pct}%` }} /></div>
            <div className="between"><span className="dim">{prog.stage} · {Math.round(prog.pct)}%</span><span className="muted">{elapsed}s elapsed</span></div>

            <div className="livegrid">
              <div className="livestat"><b>{prog.pagesVisited ?? 0}</b><span>Pages explored</span></div>
              <div className="livestat"><b>{prog.componentsFound ?? 0}</b><span>Components found</span></div>
              <div className="livestat"><b>{prog.blocked ?? 0}</b><span>Blocked / external</span></div>
            </div>
            {prog.currentTitle && (
              <div className="livenow">Now exploring: <b>{prog.currentTitle}</b> <span className="mono">{prog.currentUrl}</span></div>
            )}

            <div className="stage-list">
              {STAGES.map((s, i) => {
                const state = prog.pct >= 100 || i < curIdx ? "done" : i === curIdx ? "active" : "";
                return (
                  <div key={s} className={cx("stage", state)}>
                    <span className="si">{state === "done" ? "✓" : ""}</span>{s}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
