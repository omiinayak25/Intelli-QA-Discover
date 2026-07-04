import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { PortalModel } from "../lib/types";
import { cx, pct, useTheme } from "../lib/util";
import { ModelProvider, rlink } from "../report/ui";
import { Dashboard, Overview, Modules, FeatureTree, Structure, Pages, Components, Forms, Flows, States, Hidden, Navigation, Apis } from "../report/views";
import { Relationships, Screenshots, Coverage, Timeline, Validation, ManualReview, Checklist, Assistant, Settings } from "../report/views2";

const VIEWS: Record<string, () => JSX.Element> = {
  "": Dashboard, dashboard: Dashboard, overview: Overview, modules: Modules, "feature-tree": FeatureTree, structure: Structure,
  pages: Pages, navigation: Navigation, components: Components, forms: Forms, flows: Flows, states: States, hidden: Hidden,
  apis: Apis, relationships: Relationships, screenshots: Screenshots, coverage: Coverage, timeline: Timeline,
  validation: Validation, "manual-review": ManualReview, checklist: Checklist, assistant: Assistant, settings: Settings,
};

export default function Report() {
  const { id, view = "dashboard", sub } = useParams();
  const nav = useNavigate();
  const [model, setModel] = useState<PortalModel | null>(null);
  const [err, setErr] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    (async () => {
      try {
        const rec = await api.getDiscovery(id);
        if (rec.status === "running") { nav(`/discover/${id}`, { replace: true }); return; }
        if (rec.status === "error") { setErr(rec.error || "Discovery failed"); return; }
        const m = await api.getModel(id);
        if (!cancel) setModel(m);
      } catch (e) { if (!cancel) setErr((e as Error).message); }
    })();
    return () => { cancel = true; };
  }, [id, nav]);

  if (err) return <div className="center"><div><h2>Could not open discovery</h2><p className="dim">{err}</p><Link className="btn" to="/discoveries">← Back to history</Link></div></div>;
  if (!model) return <div className="center"><div><div className="spin-lg" /><p className="dim">Loading discovery…</p></div></div>;

  const ViewComp = VIEWS[view] || Dashboard;

  return (
    <ModelProvider id={id!} model={model}>
      <div className="app">
        <Link className="brand" to="/discoveries" title="Back to history">
          <span className="logo">Q</span>
          <div style={{ minWidth: 0 }}><div className="btitle">Intelli QA Discover</div><div className="bsub">{model.meta.appName}</div></div>
        </Link>
        <TopBar id={id!} model={model} onMenu={() => setMenuOpen((o) => !o)} />
        <Sidebar id={id!} model={model} view={view} open={menuOpen} close={() => setMenuOpen(false)} />
        <main className="main"><ViewComp key={view + "/" + (sub || "")} /></main>
      </div>
    </ModelProvider>
  );
}

const NAV = [
  { group: "Overview", items: [
    { r: "dashboard", i: "◲", t: "Dashboard" }, { r: "overview", i: "❖", t: "Application Overview" },
    { r: "modules", i: "▦", t: "Business Modules", c: (m: PortalModel) => m.modules.length },
    { r: "feature-tree", i: "⑃", t: "Business Feature Tree" }, { r: "structure", i: "⊞", t: "Application Structure" },
  ] },
  { group: "Inventory", items: [
    { r: "pages", i: "▢", t: "Pages", c: (m: PortalModel) => m.pages.length },
    { r: "navigation", i: "≡", t: "Navigation", c: (m: PortalModel) => m.navigation.length },
    { r: "components", i: "◱", t: "Components", c: (m: PortalModel) => m.components.length },
    { r: "forms", i: "▤", t: "Forms", c: (m: PortalModel) => m.forms.length },
    { r: "flows", i: "➤", t: "Flows", c: (m: PortalModel) => m.flows.length },
    { r: "states", i: "◐", t: "States", c: (m: PortalModel) => m.states.length },
    { r: "hidden", i: "◈", t: "Hidden Elements", c: (m: PortalModel) => m.hidden.length },
    { r: "apis", i: "⇄", t: "API Map", c: (m: PortalModel) => m.apis.length },
    { r: "relationships", i: "⋔", t: "Relationships" }, { r: "screenshots", i: "▣", t: "Screenshots" },
  ] },
  { group: "QA Handoff", items: [
    { r: "checklist", i: "☑", t: "QA Checklist" },
    { r: "manual-review", i: "⚑", t: "Manual Review", c: (m: PortalModel) => m.manualReview.length },
    { r: "coverage", i: "▩", t: "Coverage Map" }, { r: "timeline", i: "◷", t: "Discovery Timeline" }, { r: "validation", i: "✔", t: "Discovery Validation" },
  ] },
  { group: "Tools", items: [{ r: "assistant", i: "✦", t: "AI Assistant" }, { r: "settings", i: "⚙", t: "Settings" }] },
];

function Sidebar({ id, model, view, open, close }: { id: string; model: PortalModel; view: string; open: boolean; close: () => void }) {
  return (
    <nav className={cx("sidebar nav", open && "open")} onClick={close}>
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="nav-group">{g.group}</div>
          {g.items.map((it: any) => (
            <Link key={it.r} to={rlink(id, it.r)} className={cx(view === it.r && "active")}>
              <span className="ni">{it.i}</span>{it.t}{it.c ? <span className="count">{it.c(model)}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

function TopBar({ id, model, onMenu }: { id: string; model: PortalModel; onMenu: () => void }) {
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inpRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => q.trim() ? model.searchIndex.filter((e) => e.keywords.includes(q.toLowerCase())).slice(0, 40) : [], [q, model]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inpRef.current?.focus(); } };
    const c = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", h); document.addEventListener("click", c);
    return () => { window.removeEventListener("keydown", h); document.removeEventListener("click", c); };
  }, []);
  function goHit(hit: any) { nav(rlink(id, hit.view, hit.id)); setOpen(false); setQ(""); inpRef.current?.blur(); }
  return (
    <div className="topbar">
      <button className="btn sm" onClick={onMenu} style={{ display: "none" }} id="ham">☰</button>
      <div className="searchbox" ref={boxRef}>
        <span className="sicon">⌕</span>
        <input ref={inpRef} value={q} placeholder="Search pages, components, features, flows… (Ctrl K)"
          onChange={(e) => { setQ(e.target.value); setOpen(true); setSel(-1); }} onFocus={() => q && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { setSel((s) => Math.min(s + 1, results.length - 1)); e.preventDefault(); }
            else if (e.key === "ArrowUp") { setSel((s) => Math.max(s - 1, 0)); e.preventDefault(); }
            else if (e.key === "Enter" && results[sel]) goHit(results[sel]);
            else if (e.key === "Escape") setOpen(false);
          }} />
        {open && results.length > 0 && (
          <div className="results">{results.map((r, i) => (
            <div key={r.id} className={cx("r", i === sel && "sel")} onMouseDown={() => goHit(r)}>
              <span className="rk">{r.kind}</span><span className="rl">{r.label}</span><span className="rh">{r.hint}</span>
            </div>
          ))}</div>
        )}
      </div>
      <div className="spacer" />
      <span className="pill" title="Certainty of discovery">Confidence {pct(model.summary.discoveryConfidence)}</span>
      <Link className="btn sm" to={rlink(id, "settings")}>⤓ Export</Link>
      <button className="btn sm" onClick={toggle} title="Toggle theme">{theme === "dark" ? "◑" : "◐"}</button>
    </div>
  );
}
