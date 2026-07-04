import React, { createContext, useContext, useEffect, useState } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
export function tc(s: string) {
  return String(s || "").split(/[\s_-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
export function pct(n?: number) { return (n == null ? 0 : Math.round(n)) + "%"; }
export function timeAgo(iso: string) {
  const d = Date.parse(iso);
  if (isNaN(d)) return iso;
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
export function confClass(v?: number) { return v == null ? "n" : v >= 80 ? "g" : v >= 50 ? "y" : "r"; }

export function Conf({ v }: { v?: number }) {
  if (v == null) return null;
  return <span className={cx("badge", confClass(v))} title="Certainty of discovery, never a pass-probability">Conf {Math.round(v)}%</span>;
}

/* ---- theme ---- */
type Theme = "dark" | "light";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("iqad:theme") as Theme) || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("iqad:theme", theme);
  }, [theme]);
  return <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>{children}</ThemeCtx.Provider>;
}
export function useTheme() { return useContext(ThemeCtx); }
