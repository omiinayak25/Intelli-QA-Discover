import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { PortalModel } from "../lib/types";
import { useTheme, tc } from "../lib/util";
import { useFlags, setFlag, track } from "./flags";
import "./experimental.css";

/** Estimated exploration time (minutes) — a friendly heuristic from the model. */
function estMinutes(m: PortalModel): number {
  const c = m.kpis || {};
  return Math.max(3, Math.round((c.totalPages || 0) * 0.7 + (m.modules.length) * 1 + (c.forms || 0) * 1.5 + (m.flows.length) * 1.5));
}

export default function GuidedReport() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const flags = useFlags();
  const [model, setModel] = useState<PortalModel | null>(null);
  const [err, setErr] = useState("");
  const [tour, setTour] = useState(false);
  const askRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    api.getModel(id).then(setModel).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { if (sp.get("intent") === "find") setTimeout(() => askRef.current?.focus(), 200); }, [sp]);

  if (err) return <div className="center"><div><h2>Could not open</h2><p className="dim">{err}</p><Link className="btn" to={`/discoveries/${id}`}>Open advanced workspace →</Link></div></div>;
  if (!model) return <div className="center"><div><div className="spin-lg" /><p className="dim">Preparing a guided walk-through…</p></div></div>;

  const journeys = model.flows.length ? model.flows : [];
  return (
    <div className="guided">
      <div className="guided-top">
        <Link className="brandmark" to="/x" style={{ color: "inherit" }}><span className="logo">Q</span> Intelli QA Discover</Link>
        <div className="spacer" />
        {flags.guidedDiscovery && <button className="btn sm" onClick={() => setTour(true)}>▶ 5-minute tour</button>}
        <Link className="btn sm" to={`/discoveries/${id}`}>Advanced Workspace →</Link>
        <button className="btn sm" onClick={() => { setFlag("experimentalUX", false); nav(`/discoveries/${id}`); }}>Classic</button>
        <button className="btn sm" onClick={toggle}>{theme === "dark" ? "◑" : "◐"}</button>
      </div>

      {/* Level 1 — what this application is */}
      <div className="guided-hero">
        <h1>{model.meta.appName}</h1>
        <p className="lead">
          This application offers <b>{model.modules.length}</b> main capabilit{model.modules.length === 1 ? "y" : "ies"}
          {model.modules.length ? <> — {model.modules.slice(0, 6).map((m) => m.name).join(", ")}{model.modules.length > 6 ? "…" : ""}</> : ""}.
          {journeys.length ? <> The main journey is <b>{journeys[0].name}</b>.</> : ""}
        </p>
        <div className="facts">
          <div className="fact"><b>{model.kpis.totalPages ?? model.pages.length}</b><span>Pages</span></div>
          <div className="fact"><b>{model.modules.length}</b><span>Business modules</span></div>
          <div className="fact"><b>{model.kpis.totalComponents ?? model.components.length}</b><span>Components</span></div>
          <div className="fact"><b>~{estMinutes(model)} min</b><span>Est. exploration</span></div>
          <div className="fact"><b>{Math.round(model.summary.discoveryConfidence)}%</b><span>Discovery confidence</span></div>
        </div>
      </div>

      {/* AI-first ask */}
      {flags.aiFirst && <AskBar model={model} id={id!} inputRef={askRef} />}

      {/* Level 2 — business modules (progressive) */}
      <Disclose title="Business modules" level="Level 2" defaultOpen icon="▦">
        {model.modules.map((m) => (
          <div key={m.id} className="gmod" onClick={() => { track("featureClicks"); nav(`/discoveries/${id}/modules/${encodeURIComponent(m.id)}`); }}>
            <span className="gi">{moduleIcon(m.name)}</span>
            <div style={{ flex: 1 }}><div className="gt">{m.name}</div><div className="gs">{m.features.length} features · {m.pageIds.length} pages · {m.componentIds.length} components</div></div>
            <span className="muted">→</span>
          </div>
        ))}
      </Disclose>

      {/* Level 3 — main journeys */}
      {journeys.length > 0 && (
        <Disclose title="Main user journeys" level="Level 3" icon="➤">
          {journeys.map((f: any) => (
            <div key={f.id} className="gmod" onClick={() => nav(`/discoveries/${id}/flows`)}>
              <span className="gi">➤</span>
              <div style={{ flex: 1 }}><div className="gt">{f.name}</div><div className="gs">{(f.steps || []).map((s: any) => s.action).join(" → ")}</div></div>
            </div>
          ))}
        </Disclose>
      )}

      {/* Level 4 — pages */}
      <Disclose title="Pages" level="Level 4" icon="▢">
        <div className="chips">{model.pages.map((p) => <Link key={p.id} className="chip" to={`/discoveries/${id}/pages/${encodeURIComponent(p.id)}`}>{p.label}</Link>)}</div>
      </Disclose>

      {/* Level 5 — components (only on demand; links into the virtualized classic view) */}
      <Disclose title="Components" level="Level 5" icon="◱">
        <p className="muted" style={{ marginTop: 0 }}>{model.components.length} components discovered. Open the full, filterable explorer:</p>
        <Link className="btn" to={`/discoveries/${id}/components`}>Open component explorer →</Link>
      </Disclose>

      {/* Level 6 — technical metadata */}
      <Disclose title="Technical metadata" level="Level 6" icon="⚙">
        <div className="chips" style={{ marginBottom: ".6rem" }}>
          <Link className="chip" to={`/discoveries/${id}/apis`}>API map ({model.apis.length})</Link>
          <Link className="chip" to={`/discoveries/${id}/forms`}>Forms ({model.forms.length})</Link>
          <Link className="chip" to={`/discoveries/${id}/states`}>States ({model.states.length})</Link>
          <Link className="chip" to={`/discoveries/${id}/hidden`}>Hidden ({model.hidden.length})</Link>
          <Link className="chip" to={`/discoveries/${id}/relationships`}>Relationships</Link>
          <Link className="chip" to={`/discoveries/${id}/validation`}>Discovery validation</Link>
          <Link className="chip" to={`/discoveries/${id}/manual-review`}>Manual review ({model.manualReview.length})</Link>
        </div>
        <div className="mono muted" style={{ fontSize: 12 }}>Run {model.meta.runId} · schema {model.meta.schemaVersion} · roles {model.meta.roles.join(", ")}</div>
      </Disclose>

      {tour && flags.guidedDiscovery && <GuidedTour model={model} id={id!} onClose={() => setTour(false)} nav={nav} />}
    </div>
  );
}

function Disclose({ title, level, icon, defaultOpen, children }: { title: string; level: string; icon: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="disclose" open={defaultOpen}>
      <summary><span className="chev">▸</span><span>{icon}</span> {title}<span className="lvl">{level}</span></summary>
      <div className="body">{children}</div>
    </details>
  );
}

function AskBar({ model, id, inputRef }: { model: PortalModel; id: string; inputRef: React.RefObject<HTMLInputElement> }) {
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const results = useMemo(() => q.trim() ? model.searchIndex.filter((e) => e.keywords.includes(q.toLowerCase())).slice(0, 8) : [], [q, model]);
  function open(hit: any) { track("assistantUses"); nav(`/discoveries/${id}/${hit.view}/${encodeURIComponent(hit.id)}`); }
  return (
    <div>
      <div className="gp-ask">
        <input ref={inputRef} value={q} placeholder="Ask for anything — “show login”, “where is payment”, “find upload”…"
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && results[0]) open(results[0]); }} />
      </div>
      {q.trim() && (
        <div className="gp-ask-res">
          {results.length === 0 ? <span className="muted">Nothing matches “{q}”.</span> : (
            <div className="chips">{results.map((r) => <button key={r.id} className="chip" onClick={() => open(r)}><span className="muted">{r.kind}:</span> {r.label}</button>)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function GuidedTour({ model, id, onClose, nav }: { model: PortalModel; id: string; onClose: () => void; nav: (p: string) => void }) {
  const steps = [{ name: "Overview", detail: `${model.meta.appName} — ${model.modules.length} modules, ${model.pages.length} pages.`, icon: "🧭" },
    ...model.modules.slice(0, 6).map((m) => ({ name: m.name, detail: m.features.length ? `Contains: ${m.features.map((f) => f.label).join(", ")}.` : `${m.componentIds.length} components across ${m.pageIds.length} page(s).`, icon: moduleIcon(m.name), moduleId: m.id })),
    { name: "You're ready", detail: "That's the whole application. Jump into any module, or open the Advanced Workspace for depth.", icon: "🎉" }];
  const [i, setI] = useState(0);
  const s = steps[i] as any;
  return (
    <div className="tour-scrim" onClick={onClose}>
      <div className="tour-card" onClick={(e) => e.stopPropagation()}>
        <div className="tour-step">Step {i + 1} of {steps.length}</div>
        <div style={{ fontSize: "2.4rem" }}>{s.icon}</div>
        <h2>{s.name}</h2>
        <div className="tour-body">{s.detail}</div>
        <div className="tour-dots">{steps.map((_, j) => <i key={j} className={j === i ? "on" : ""} />)}</div>
        <div className="row" style={{ justifyContent: "center" }}>
          {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>← Back</button>}
          {s.moduleId && <button className="btn sm" onClick={() => { onClose(); nav(`/discoveries/${id}/modules/${encodeURIComponent(s.moduleId)}`); }}>Open module</button>}
          {i < steps.length - 1 ? <button className="btn primary sm" onClick={() => setI(i + 1)}>Next →</button> : <button className="btn primary sm" onClick={onClose}>Done</button>}
        </div>
      </div>
    </div>
  );
}

function moduleIcon(n: string) {
  n = (n || "").toLowerCase();
  if (/auth/.test(n)) return "🔐"; if (/course|coach/.test(n)) return "🎓"; if (/study|material/.test(n)) return "📚";
  if (/test|assess/.test(n)) return "📝"; if (/exam/.test(n)) return "📋"; if (/pay/.test(n)) return "💳";
  if (/search/.test(n)) return "🔎"; if (/media/.test(n)) return "🎬"; if (/notif/.test(n)) return "🔔";
  if (/profile|account/.test(n)) return "👤"; if (/report/.test(n)) return "📊"; if (/local/.test(n)) return "🌐";
  if (/booking/.test(n)) return "🎫"; return "▦";
}
