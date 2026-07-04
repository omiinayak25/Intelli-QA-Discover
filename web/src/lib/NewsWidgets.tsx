import { useEffect, useState } from "react";
import { api } from "./api";

const TOPICS: { key: string; label: string; icon: string }[] = [
  { key: "qa", label: "QA & Testing", icon: "🧪" },
  { key: "ai", label: "AI", icon: "✦" },
  { key: "browser", label: "Browser & DevTools", icon: "🌐" },
  { key: "security", label: "Security", icon: "🛡" },
  { key: "frontend", label: "Frontend", icon: "⚛" },
];

function NewsCard({ topic, icon, label }: { topic: string; icon: string; label: string }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => { api.news(topic).then(setItems).catch(() => setItems([])); }, [topic]);
  return (
    <div className="panel">
      <div className="ph" style={{ cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <span>{icon}</span> {label} <span className="spacer" />
        <span className="muted" style={{ fontSize: 11 }}>{items ? items.length : "…"}</span>
      </div>
      {open && (
        <div className="pb" style={{ padding: ".5rem 0" }}>
          {items === null ? <div className="muted" style={{ padding: ".6rem 1rem" }}>Loading…</div>
            : items.length === 0 ? <div className="muted" style={{ padding: ".6rem 1rem" }}>No headlines (offline?)</div>
            : items.slice(0, 6).map((it, i) => (
              <a key={i} href={it.link} target="_blank" rel="noopener" className="newsitem"
                style={{ display: "block", padding: ".45rem 1rem", borderTop: i ? "1px solid var(--border)" : "0", color: "inherit", textDecoration: "none", fontSize: 13 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                <div className="muted" style={{ fontSize: 11 }}>{it.source}</div>
              </a>
            ))}
        </div>
      )}
    </div>
  );
}

export function NewsWidgets({ enabled }: { enabled?: string[] }) {
  const topics = TOPICS.filter((t) => !enabled || enabled.includes(t.key));
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
      {topics.map((t) => <NewsCard key={t.key} topic={t.key} icon={t.icon} label={t.label} />)}
    </div>
  );
}
