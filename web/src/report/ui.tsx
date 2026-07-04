import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { PortalModel } from "../lib/types";
import { Conf, cx } from "../lib/util";

/* ---------- model context ---------- */
export interface Ctx {
  id: string;
  model: PortalModel;
  idx: {
    page: Record<string, any>; component: Record<string, any>; form: Record<string, any>;
    flow: Record<string, any>; state: Record<string, any>; hidden: Record<string, any>;
    api: Record<string, any>; module: Record<string, any>; nav: Record<string, any>;
  };
  label: (id: string) => string;
}
const ModelCtx = createContext<Ctx | null>(null);
export function ModelProvider({ id, model, children }: { id: string; model: PortalModel; children: React.ReactNode }) {
  const idx = {
    page: index(model.pages), component: index(model.components), form: index(model.forms),
    flow: index(model.flows), state: index(model.states), hidden: index(model.hidden),
    api: index(model.apis), module: index(model.modules), nav: index(model.navigation),
  };
  const label = (id2: string) => {
    const o = (idx.page[id2] || idx.component[id2] || idx.form[id2] || idx.flow[id2] || idx.state[id2] || idx.hidden[id2] || idx.api[id2] || idx.module[id2] || idx.nav[id2]) as any;
    return o ? (o.label || o.name || o.endpointPattern || id2) : id2;
  };
  return <ModelCtx.Provider value={{ id, model, idx, label }}>{children}</ModelCtx.Provider>;
}
export function useM(): Ctx { const c = useContext(ModelCtx); if (!c) throw new Error("no model"); return c; }
function index(arr: any[]) { const o: Record<string, any> = {}; for (const x of arr) o[x.id] = x; return o; }

/* route + link helpers */
export function rlink(id: string, view: string, sub?: string) {
  return `/discoveries/${encodeURIComponent(id)}/${view}` + (sub ? "/" + encodeURIComponent(sub) : "");
}
const PREFIX_VIEW: Record<string, string> = { PAGE: "pages", CMP: "components", FORM: "forms", FLOW: "flows", API: "apis", HID: "hidden", FEAT: "modules", FEATNODE: "modules", STATE: "states", NAV: "navigation", ROLE: "settings" };
export function IdChip({ refId, text }: { refId: string; text?: string }) {
  const { id, label } = useM();
  const prefix = refId.split(":")[0];
  const view = PREFIX_VIEW[prefix];
  const lbl = text || label(refId);
  if (!view) return <span className="chip" style={{ cursor: "default" }}>{lbl}</span>;
  return <Link className="chip" to={rlink(id, view, refId)}>{lbl}</Link>;
}

/* ---------- atoms ---------- */
export function Head({ title, sub, crumbs }: { title: string; sub?: React.ReactNode; crumbs?: React.ReactNode }) {
  return (
    <div className="page-head">
      {crumbs && <div className="crumbs">{crumbs}</div>}
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}
export function Ring({ v, label }: { v?: number; label: string }) {
  const val = v == null ? 0 : v;
  return (
    <div style={{ textAlign: "center" }}>
      <div className="ringwrap"><div className="ring" style={{ ["--p" as any]: val }}><b>{Math.round(val)}%</b></div></div>
      <div className="kl" style={{ marginTop: ".4rem" }}>{label}</div>
    </div>
  );
}
export function ConfReason({ o }: { o: any }) {
  if (!o || o.confidence >= 80 || !o.confidenceReason) return null;
  return <div className="muted" style={{ fontSize: 12, marginTop: ".3rem" }}>{o.confidenceReason}</div>;
}
export { Conf };

/* ---------- table ---------- */
export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="tblwrap"><table className="tbl">
      <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table></div>
  );
}

/* ---------- virtualized list ---------- */
export function VirtualList<T>({ items, rowH = 46, render, height }: { items: T[]; rowH?: number; render: (x: T) => React.ReactNode; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [vh, setVh] = useState(600);
  const H = height ?? Math.min(items.length * rowH, 640);
  useEffect(() => { if (ref.current) setVh(ref.current.clientHeight); }, [H]);
  const start = Math.max(0, Math.floor(scrollTop / rowH) - 6);
  const end = Math.min(items.length, Math.ceil((scrollTop + vh) / rowH) + 6);
  const slice = items.slice(start, end);
  return (
    <div className="vlist" ref={ref} style={{ height: H }} onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
      <div style={{ position: "relative", height: items.length * rowH }}>
        {slice.map((x, i) => (
          <div key={start + i} style={{ position: "absolute", top: (start + i) * rowH, left: 0, right: 0, height: rowH }}>{render(x)}</div>
        ))}
      </div>
    </div>
  );
}

/* ---------- generic tree ---------- */
export interface TreeItem { key: string; label: string; tag?: string; to?: string; confidence?: number; children?: TreeItem[]; onLabel?: () => void; }
export function Tree({ nodes }: { nodes: TreeItem[] }) {
  return <div className="tree"><ul>{nodes.map((n) => <TreeLi key={n.key} n={n} />)}</ul></div>;
}
function TreeLi({ n }: { n: TreeItem }) {
  const [open, setOpen] = useState(true);
  const has = n.children && n.children.length > 0;
  return (
    <li>
      <div className={cx("tnode", (n.to || n.onLabel) && "clk")}>
        <span className="tw" onClick={() => has && setOpen(!open)}>{has ? (open ? "▾" : "▸") : ""}</span>
        {n.to ? <Link className="tl" to={n.to}>{n.label}</Link> : <span className="tl" onClick={n.onLabel}>{n.label}</span>}
        {n.tag && <span className="tt">{n.tag}</span>}
        {n.confidence != null && <Conf v={n.confidence} />}
      </div>
      {has && open && <ul>{n.children!.map((c) => <TreeLi key={c.key} n={c} />)}</ul>}
    </li>
  );
}

/* ---------- screenshot overlay ---------- */
export function ScreenshotOverlay({ page }: { page: any }) {
  const { id, model } = useM();
  const set = (model.screenshots || {})[page.screenshotKey];
  const [view, setView] = useState<"desktop" | "tablet" | "mobile">("desktop");
  if (!set || !(set.desktop || set.tablet || set.mobile)) {
    return <div className="noshot">📷<div style={{ marginTop: ".5rem" }}>No screenshot captured for this page.</div></div>;
  }
  const src = set[view] || set.desktop || set.tablet || set.mobile;
  const boxes = view === "desktop" ? (set.boxes || []) : [];
  return (
    <div className="panel">
      <div className="ph">Screenshot overlay <span className="muted" style={{ fontWeight: 400 }}>· hover a hotspot, click to open the component</span></div>
      <div className="pb">
        <div className="seg" style={{ marginBottom: ".5rem" }}>
          {(["desktop", "tablet", "mobile"] as const).filter((v) => set[v]).map((v) => (
            <button key={v} className={cx(view === v && "on")} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
        <div className="shot">
          <img src={src} alt="page screenshot" loading="lazy" />
          {boxes.map((b: any, i: number) => {
            const L = set.width ? (b.x / set.width) * 100 : 0, T = set.height ? (b.y / set.height) * 100 : 0;
            const W = set.width ? (b.w / set.width) * 100 : 0, Hh = set.height ? (b.h / set.height) * 100 : 0;
            return (
              <Link key={b.id + i} className="hot" to={rlink(id, "components", b.id)}
                style={{ left: L + "%", top: T + "%", width: W + "%", height: Hh + "%" }} title={b.label || b.type}>
                <span className="num">{i + 1}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
