/**
 * Human-readable rendering of the Discovery Model, organized by the 10
 * categories, cross-linking IDs. Discovery only — no test cases.
 */

import { titleCase } from "../core/ids.js";
import type { DiscoveryModel } from "../core/types.js";

export function renderDiscoveryModelMd(m: DiscoveryModel): string {
  const L: string[] = [];
  L.push(`# Discovery Model`);
  L.push("");
  L.push(`- **App:** ${m.appUrl}`);
  L.push(`- **Run:** ${m.runId}`);
  L.push(`- **Generated:** ${m.generatedAt}`);
  L.push(`- **Roles:** ${m.roles.map((r) => titleCase(r.name)).join(", ")}`);
  L.push(`- **Schema:** ${m.schemaVersion}`);
  L.push("");
  L.push(`> Discovery only — this catalogs what exists, never whether it works. The agent discovers and organizes; the human does the testing.`);
  L.push("");

  const conf = (c: { confidence: number; confidenceReason?: string | null }) =>
    c.confidence >= 80 ? `Confidence ${c.confidence}%` : `Confidence ${c.confidence}% — Reason: ${c.confidenceReason}`;

  L.push(`## 1. Pages (${m.pages.length})`);
  for (const p of m.pages)
    L.push(`- \`${p.id}\` **${p.label}** — ${p.urlPattern} · roles: ${p.roleVisibility.map(titleCase).join(", ")} · ${conf(p)}`);
  L.push("");

  L.push(`## 2. Navigation (${m.navigation.length})`);
  for (const n of m.navigation) L.push(`- \`${n.id}\` **${n.label}** (${n.type}, ${n.scope}) · ${n.items.length} links`);
  L.push("");

  L.push(`## 3. Components (${m.components.length})`);
  for (const c of m.components.slice(0, 120))
    L.push(
      `- \`${c.id}\` **${c.label || c.type}** (${c.type}${c.scope === "global" ? ", global" : ""}) — ${c.businessFunction} · ${c.inferredPurpose}${c.behavior ? " · " + c.behavior : ""} · ${conf(c)}`,
    );
  if (m.components.length > 120) L.push(`- … and ${m.components.length - 120} more`);
  L.push("");

  L.push(`## 4. Business Features (${m.features.length})`);
  for (const f of m.features)
    L.push(`- \`${f.id}\` **${f.name}** (${f.featureCategory}) — pages: ${f.pages.length}, components: ${f.components.length}, forms: ${f.forms.length} · ${conf(f)}`);
  L.push("");

  L.push(`## 5. User Flows (${m.flows.length})`);
  for (const fl of m.flows)
    L.push(`- \`${fl.id}\` **${fl.name}** — ${fl.steps.map((s) => s.action).join(" → ")}`);
  L.push("");

  L.push(`## 6. Hidden Things (${m.hidden.length})`);
  for (const h of m.hidden.slice(0, 40)) L.push(`- \`${h.id}\` **${h.type}** — reveal: ${h.revealTrigger}`);
  L.push("");

  L.push(`## 7. APIs (map only) (${m.apis.length})`);
  for (const a of m.apis.slice(0, 60)) L.push(`- \`${a.id}\` **${a.endpointPattern}** — trigger: ${a.triggeringAction} · auth: ${a.authSignalObserved}`);
  L.push("");

  L.push(`## 8. Forms (${m.forms.length})`);
  for (const fm of m.forms)
    L.push(`- \`${fm.id}\` **${fm.name}** — ${fm.fieldCount} fields (required: ${fm.requiredFields.length}) · validation attrs: ${fm.validationAttributesObserved.join(", ") || "none"}`);
  L.push("");

  L.push(`## 9. Roles (${m.roles.length})`);
  for (const r of m.roles)
    L.push(`- \`${r.id}\` **${titleCase(r.name)}** — pages: ${r.reachablePages.length}, exclusive: ${r.exclusiveItems.length}, denied: ${r.deniedObserved.length}`);
  L.push("");

  L.push(`## 10. States (${m.states.length})`);
  for (const s of m.states) L.push(`- \`${s.id}\` **${s.type}** on ${s.appliesTo} — ${s.observed ? "observed" : "declared, not observed"}`);
  L.push("");

  L.push(`## Business Function Groups (${m.businessFunctions.length})`);
  for (const g of m.businessFunctions) L.push(`- **${g.name}** — ${g.componentIds.length} components`);
  L.push("");

  return L.join("\n") + "\n";
}
