import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useM } from "./ui";

/**
 * Live Browser Mode inspector — opens the real website in a backend Playwright
 * session, navigates to the component's page, scrolls to it, highlights it, and
 * shows the live view + a DevTools-style inspector. Read-only.
 */
export function LiveInspector({ component }: { component: any }) {
  const { id } = useM();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const live = useRef(false);
  const pollRef = useRef<any>(null);

  async function open() {
    setState("loading"); setErr("");
    try {
      const r = await api.liveOpen(id, component.id);
      setResult(r); setState("ready");
    } catch (e) { setErr((e as Error).message); setState("error"); }
  }
  function toggleLive() {
    live.current = !live.current;
    if (live.current) {
      pollRef.current = setInterval(async () => {
        try { const f = await api.liveFrame(id); if (f.screenshot) setResult((r: any) => ({ ...r, screenshot: f.screenshot })); } catch {}
      }, 1600);
    } else if (pollRef.current) clearInterval(pollRef.current);
    setResult((r: any) => ({ ...r, _live: live.current }));
  }
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); api.liveClose(id).catch(() => {}); }, [id]);

  function copy(v: string, k: string) { navigator.clipboard?.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(""), 1200); }); }
  const insp = result?.inspect || {};
  const bb = insp.boundingBox;

  return (
    <div className="panel">
      <div className="ph">
        🔴 Live Browser Mode
        <span className="spacer" />
        {state === "ready" && result?.currentUrl && <a className="btn sm" href={result.currentUrl} target="_blank" rel="noopener">Open actual page ↗</a>}
      </div>
      <div className="pb">
        {state === "idle" && (
          <div style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
            <div className="muted" style={{ marginBottom: ".8rem", fontSize: 13 }}>Open the real website, scroll to this component, and highlight it — like Chrome DevTools. Read-only.</div>
            <button className="btn primary" onClick={open}>▶ Open Live &amp; Highlight</button>
          </div>
        )}
        {state === "loading" && <div style={{ textAlign: "center", padding: "2rem" }}><div className="spin-lg" /><div className="muted">Driving a live browser to the component…</div></div>}
        {state === "error" && <div className="card" style={{ borderColor: "var(--red)" }}><b style={{ color: "var(--red)" }}>Live browser error:</b> {err}<div style={{ marginTop: ".6rem" }}><button className="btn sm" onClick={open}>Retry</button></div></div>}
        {state === "ready" && result && (
          <>
            <div className="row" style={{ marginBottom: ".6rem" }}>
              <span className={"badge " + (result.found ? "g" : "n")}>{result.found ? "✔ located · " + result.strategy : "not located"}</span>
              <span className="muted mono" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{result.currentUrl}</span>
              <button className="btn sm" onClick={open} title="Re-locate">↻</button>
              <button className={"btn sm" + (result._live ? " primary" : "")} onClick={toggleLive} title="Live refresh">{result._live ? "● Live" : "○ Live"}</button>
            </div>
            {result.screenshot ? (
              <div className="shot" style={{ maxHeight: 420, overflow: "auto" }}><img src={result.screenshot} alt="live browser" /></div>
            ) : <div className="noshot" style={{ minHeight: 120 }}>No live frame.</div>}
            <h2 className="sec">Inspector</h2>
            <dl className="kv-list">
              {insp.tag && <><dt>Tag</dt><dd className="mono">&lt;{insp.tag}&gt;</dd></>}
              <dt>CSS selector</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{component.selector} <button className="btn sm" onClick={() => copy(component.selector, "sel")}>{copied === "sel" ? "✓" : "Copy"}</button></dd>
              {insp.xpath && <><dt>XPath</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{insp.xpath} <button className="btn sm" onClick={() => copy(insp.xpath, "xp")}>{copied === "xp" ? "✓" : "Copy"}</button></dd></>}
              {(insp.ariaRole || insp.ariaLabel) && <><dt>ARIA</dt><dd className="mono">{insp.ariaRole || ""} {insp.ariaLabel ? `"${insp.ariaLabel}"` : ""}</dd></>}
              {bb && <><dt>Bounding box</dt><dd className="mono">x{bb.x} y{bb.y} · {bb.w}×{bb.h}</dd></>}
              <dt>URL</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{result.url} <button className="btn sm" onClick={() => copy(result.url, "url")}>{copied === "url" ? "✓" : "Copy"}</button></dd>
              {insp.styles && <><dt>Styles</dt><dd className="mono" style={{ fontSize: 11 }}>{insp.styles.color} · {insp.styles.background} · {insp.styles.fontSize}</dd></>}
            </dl>
            {insp.note && <div className="muted" style={{ fontSize: 12, marginTop: ".4rem" }}>{insp.note}</div>}
          </>
        )}
      </div>
    </div>
  );
}
