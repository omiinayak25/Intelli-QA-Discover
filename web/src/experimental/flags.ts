/**
 * Experimental UX feature flags — fully isolated & reversible.
 *
 * Defaults are OFF, so the current experience is unchanged for everyone. Flags
 * persist in localStorage (`iqad:flags`) and can be toggled from the UI or set
 * via `?ux=exp` in the URL. Rollback = turn the flag off (no migrations).
 */

import { useEffect, useState } from "react";

export interface Flags {
  experimentalUX: boolean;      // the simplified "Simple Home" + guided report
  guidedDiscovery: boolean;     // 5-minute guided step-through
  aiFirst: boolean;             // AI assistant as the primary control
  progressiveDisclosure: boolean; // reveal depth on demand
  smartLocation: boolean;       // closest-match highlighting fallback + confidence
}

const DEFAULTS: Flags = {
  experimentalUX: false,
  guidedDiscovery: true,
  aiFirst: true,
  progressiveDisclosure: true,
  smartLocation: true,
};

const KEY = "iqad:flags";
const EVT = "iqad:flags:changed";

function read(): Flags {
  let stored: Partial<Flags> = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { /* ignore */ }
  // URL opt-in: ?ux=exp turns the experiment on; ?ux=classic turns it off
  try {
    const p = new URLSearchParams(location.search).get("ux");
    if (p === "exp") stored = { ...stored, experimentalUX: true };
    if (p === "classic") stored = { ...stored, experimentalUX: false };
  } catch { /* ignore */ }
  return { ...DEFAULTS, ...stored };
}

export function getFlags(): Flags { return read(); }

export function setFlag<K extends keyof Flags>(name: K, value: Flags[K]): void {
  const next = { ...read(), [name]: value };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT));
}

export function resetFlags(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT));
}

/** React hook: current flags, re-rendered on change. */
export function useFlags(): Flags {
  const [flags, setFlags] = useState<Flags>(read);
  useEffect(() => {
    const h = () => setFlags(read());
    window.addEventListener(EVT, h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener("storage", h); };
  }, []);
  return flags;
}

/* ---------- lightweight local metrics (no network, no PII) ---------- */
const MKEY = "iqad:metrics";
export interface Metrics {
  discoveries: number;
  featureClicks: number;
  componentClicks: number;
  searchUses: number;
  assistantUses: number;
  highlightExact: number;
  highlightClosest: number;
  highlightRegion: number;
  highlightMiss: number;
}
const M0: Metrics = { discoveries: 0, featureClicks: 0, componentClicks: 0, searchUses: 0, assistantUses: 0, highlightExact: 0, highlightClosest: 0, highlightRegion: 0, highlightMiss: 0 };

export function metrics(): Metrics {
  try { return { ...M0, ...JSON.parse(localStorage.getItem(MKEY) || "{}") }; } catch { return { ...M0 }; }
}
export function track(name: keyof Metrics, by = 1): void {
  const m = metrics(); m[name] = (m[name] || 0) + by;
  try { localStorage.setItem(MKEY, JSON.stringify(m)); } catch { /* ignore */ }
}
export function resetMetrics(): void { try { localStorage.removeItem(MKEY); } catch { /* ignore */ } }
