/**
 * Portal generator — assembles the self-contained enterprise portal (portal.html)
 * from the discovery deliverables. Inlines the denormalized model, the design
 * system, and the client SPA into one file that opens with no server and no
 * external network. Discovery only.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PORTAL_CSS } from "./styles.js";
import { buildPortalModel, type ScreenshotSet } from "./model.js";
import type { ReportInputs } from "../builders/report.js";
import type { RawCapture } from "../core/raw-capture.js";

const CLIENT_JS = readFileSync(fileURLToPath(new URL("./client-app.js", import.meta.url)), "utf8");

function inlineJson(obj: unknown): string {
  // Safe to embed inside <script>: neutralize `<` (so `</script>` can't break
  // out) and the U+2028/U+2029 line separators (valid JSON, invalid in a JS
  // string literal).
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildPortal(
  inp: ReportInputs,
  raw?: RawCapture,
  screenshots: Record<string, ScreenshotSet> = {},
): string {
  const model = buildPortalModel(inp, raw, screenshots);
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QA Discovery Portal — ${escapeHtml(model.meta.appName)}</title>
<meta name="description" content="Interactive QA discovery portal for ${escapeHtml(model.meta.appUrl)} — discovery only.">
<style>${PORTAL_CSS}</style>
</head>
<body>
<noscript><div style="padding:2rem;font-family:sans-serif">This QA Discovery Portal requires JavaScript to render its interactive views. The same data is available in the JSON and Markdown exports.</div></noscript>
<script>window.__MODEL__=${inlineJson(model)};</script>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
