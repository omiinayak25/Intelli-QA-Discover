/**
 * Knowledge bounded context — the collective-intelligence engine. It ingests
 * every completed run into a cross-project knowledge index and answers
 * cross-application questions (Application DNA, similarity, enterprise search,
 * reasoning) STRICTLY from accumulated evidence. Every inference carries
 * evidence + confidence + source; nothing is invented.
 */

import { FILENAMES } from "../core/constants.js";
import { DOMAIN_SIGS } from "./signatures.js";
import { detectTech } from "./tech.js";
import type { DiscoveryStore } from "../server/store.js";
import type { Db, KnowledgeRow, TechHit } from "../platform/db.js";

export interface DomainInference { domain: string; confidence: number; evidence: string[] }

export class KnowledgeService {
  constructor(private readonly store: DiscoveryStore, private readonly db: Db) {}

  /** Ingest a completed run into the knowledge index (idempotent). */
  async ingest(runId: string, force = false): Promise<KnowledgeRow | null> {
    const rec = await this.store.get(runId);
    if (!rec || rec.status !== "done") return null;
    if (!force && this.db.hasKnowledge(runId)) return this.db.getKnowledge(runId)!;
    let model: any, tree: any;
    try {
      model = await this.store.loadArtifact<any>(rec.runId, FILENAMES.discoveryModelJson);
      tree = await this.store.loadArtifact<any>(rec.runId, FILENAMES.featureTreeJson).catch(() => ({ root: { children: [] } }));
    } catch { return null; }

    const modules: string[] = (tree.root?.children || []).map((c: any) => c.label);
    const featureKeys: string[] = (model.features || []).map((f: any) => f.id.replace(/^FEAT:/, ""));
    const componentProfile: Record<string, number> = {};
    const labelSet = new Set<string>();
    for (const c of model.components || []) {
      componentProfile[c.type] = (componentProfile[c.type] || 0) + 1;
      if (c.label) labelSet.add(c.label);
    }
    const componentLabels = Array.from(labelSet).slice(0, 400);
    const pages = (model.pages || []).map((p: any) => ({ label: p.label, archetype: p.archetype }));
    const dom = inferDomain({ modules, componentLabels, pages, featureKeys });
    const tech: TechHit[] = await detectTech(model.appUrl);

    const row: KnowledgeRow = {
      runId: rec.id, projectId: rec.projectId || "", url: model.appUrl, appName: rec.appName, createdAt: rec.createdAt,
      domain: dom.domain, domainConfidence: dom.confidence, domainEvidence: dom.evidence,
      modules, featureKeys, componentProfile, componentLabels, tech,
      kpis: { pages: (model.pages || []).length, components: (model.components || []).length, features: (model.features || []).length, forms: (model.forms || []).length, apis: (model.apis || []).length },
      pages,
    };
    this.db.upsertKnowledge(row);
    return row;
  }

  /** Backfill knowledge for every completed run that isn't indexed yet. */
  async backfill(): Promise<number> {
    let n = 0;
    for (const rec of await this.store.list()) {
      if (rec.status === "done" && !this.db.hasKnowledge(rec.id)) {
        try { if (await this.ingest(rec.id)) n++; } catch { /* skip */ }
      }
    }
    return n;
  }

  all(): KnowledgeRow[] { return this.db.allKnowledge(); }

  /** Application DNA for a project (latest indexed run + similar applications). */
  async dna(projectId: string): Promise<any> {
    const rows = this.db.allKnowledge().filter((k) => k.projectId === projectId);
    if (!rows.length) return null;
    const latest = rows[0];
    return {
      ...latest,
      similar: this.similar(latest.runId, 6),
    };
  }

  /** Similar applications to a given run, ranked (excludes same project). */
  similar(runId: string, limit = 8): any[] {
    const target = this.db.getKnowledge(runId);
    if (!target) return [];
    const others = this.db.allKnowledge().filter((k) => k.runId !== runId && k.projectId !== target.projectId);
    // keep the latest run per other project
    const byProject = new Map<string, KnowledgeRow>();
    for (const o of others) if (!byProject.has(o.projectId)) byProject.set(o.projectId, o);
    return Array.from(byProject.values())
      .map((o) => ({ ...similarity(target, o), appName: o.appName, url: o.url, projectId: o.projectId, runId: o.runId, domain: o.domain }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Global knowledge overview (aggregates over every discovered application). */
  overview(): any {
    const rows = this.db.allKnowledge();
    const byProject = new Map<string, KnowledgeRow>();
    for (const r of rows) if (!byProject.has(r.projectId)) byProject.set(r.projectId, r);
    const apps = Array.from(byProject.values());
    const domainDist = tally(apps.map((a) => a.domain));
    const techDist = tally(apps.flatMap((a) => a.tech.map((t) => t.name)));
    const moduleDist = tally(apps.flatMap((a) => a.modules));
    const componentTotals: Record<string, number> = {};
    for (const a of apps) for (const [t, n] of Object.entries(a.componentProfile)) componentTotals[t] = (componentTotals[t] || 0) + n;
    return {
      applications: apps.length,
      runsIndexed: rows.length,
      totals: apps.reduce((acc, a) => ({ pages: acc.pages + (a.kpis.pages || 0), components: acc.components + (a.kpis.components || 0), features: acc.features + (a.kpis.features || 0) }), { pages: 0, components: 0, features: 0 }),
      domains: sortDist(domainDist),
      technologies: sortDist(techDist),
      topModules: sortDist(moduleDist).slice(0, 15),
      componentTypes: sortDist(componentTotals).slice(0, 15),
    };
  }

  /** Enterprise search across ALL projects, with source evidence. */
  search(q: string): any {
    const t = q.toLowerCase().trim();
    if (!t) return { query: q, results: [] };
    const results = this.db.allKnowledge().map((k) => {
      const hits: { kind: string; value: string }[] = [];
      for (const m of k.modules) if (m.toLowerCase().includes(t)) hits.push({ kind: "module", value: m });
      for (const l of k.componentLabels) if (l.toLowerCase().includes(t)) hits.push({ kind: "component", value: l });
      for (const p of k.pages) if ((p.label + " " + p.archetype).toLowerCase().includes(t)) hits.push({ kind: "page", value: p.label });
      for (const te of k.tech) if (te.name.toLowerCase().includes(t)) hits.push({ kind: "technology", value: te.name });
      if (k.domain.toLowerCase().includes(t)) hits.push({ kind: "domain", value: k.domain });
      for (const f of k.featureKeys) if (f.toLowerCase().includes(t)) hits.push({ kind: "feature", value: f });
      return { runId: k.runId, projectId: k.projectId, appName: k.appName, url: k.url, domain: k.domain, hits: hits.slice(0, 12), count: hits.length };
    }).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
    return { query: q, applications: results.length, results };
  }

  /** Cross-application reasoning assistant — answers only from accumulated evidence. */
  ask(q: string): any {
    const ql = q.toLowerCase().trim();
    const apps = (() => { const m = new Map<string, KnowledgeRow>(); for (const r of this.db.allKnowledge()) if (!m.has(r.projectId)) m.set(r.projectId, r); return Array.from(m.values()); })();
    const cite = (a: KnowledgeRow, evidence: string[]) => ({ appName: a.appName, projectId: a.projectId, runId: a.runId, url: a.url, domain: a.domain, evidence });

    // "compare A vs B"
    const cmp = ql.match(/compare\s+(.+?)\s+(?:vs|versus|and|with)\s+(.+)$/);
    if (cmp) {
      const a = findApp(apps, cmp[1]), b = findApp(apps, cmp[2]);
      if (a && b) { const s = similarity(a, b); return { answer: `${a.appName} and ${b.appName} are ${s.score}% similar.`, kind: "compare", similarity: s, a: cite(a, a.modules), b: cite(b, b.modules) }; }
    }
    // "find applications similar to X"
    const sim = ql.match(/(?:similar to|like)\s+(.+)$/);
    if (sim) { const a = findApp(apps, sim[1]); if (a) return { answer: `Applications most similar to ${a.appName}:`, kind: "similar", results: this.similar(a.runId, 6) }; }
    // domain queries: "find education platforms" / "healthcare systems"
    const domSig = DOMAIN_SIGS.find((d) => ql.includes(d.key) || d.name.toLowerCase().split(/[ /]/).some((w) => w.length > 3 && ql.includes(w)));
    if (domSig && /(find|show|list|which|applications?|platforms?|systems?|sites?)/.test(ql)) {
      const matched = apps.filter((a) => a.domain === domSig.name).map((a) => cite(a, a.domainEvidence));
      return { answer: matched.length ? `${matched.length} application(s) classified as ${domSig.name}:` : `No application is classified as ${domSig.name} yet.`, kind: "list", results: matched };
    }
    // "which applications use/have/contain <thing>"
    const feat = ql.match(/(?:which|find|show|list|any).*?(?:use|using|have|has|contain|containing|with|support|supporting)\s+(.+?)\??$/);
    const term = feat ? feat[1].replace(/\bcomponents?\b|\bmodules?\b|\bapplications?\b|\bfeature\b/g, "").trim() : "";
    if (term) {
      const matched = apps.map((a) => {
        const ev: string[] = [];
        const tl = term.toLowerCase();
        for (const m of a.modules) if (m.toLowerCase().includes(tl)) ev.push("module: " + m);
        for (const l of a.componentLabels) if (l.toLowerCase().includes(tl)) ev.push("component: " + l);
        for (const te of a.tech) if (te.name.toLowerCase().includes(tl)) ev.push("tech: " + te.name);
        for (const p of a.pages) if (p.label.toLowerCase().includes(tl)) ev.push("page: " + p.label);
        return ev.length ? cite(a, ev.slice(0, 6)) : null;
      }).filter(Boolean);
      if (matched.length) return { answer: `${matched.length} application(s) contain "${term}":`, kind: "list", results: matched };
      // fall through to search
    }
    // fallback: enterprise search over the whole knowledge base
    const s = this.search(q.replace(/^(which|find|show|list|the|me|applications?|use|using|have|contain)\s+/gi, "").trim() || q);
    if (s.results.length) return { answer: `Found ${s.results.length} application(s) matching your question:`, kind: "search", results: s.results };
    return { answer: `Nothing in the knowledge base (${apps.length} application(s)) matches "${q}". Discover more websites to grow the knowledge.`, kind: "empty", results: [] };
  }
}

/* ---------- evidence-based inference ---------- */
export function inferDomain(x: { modules: string[]; componentLabels: string[]; pages: { label: string; archetype: string }[]; featureKeys: string[] }): DomainInference {
  const blob = [x.modules.join(" "), x.componentLabels.join(" "), x.pages.map((p) => p.label + " " + p.archetype).join(" "), x.featureKeys.join(" ")].join("  ");
  let best: DomainInference = { domain: "Unclassified", confidence: 30, evidence: [] };
  for (const sig of DOMAIN_SIGS) {
    const matches = Array.from(new Set((blob.match(new RegExp(sig.terms.source, "gi")) || []).map((m) => m.toLowerCase())));
    if (matches.length) {
      const confidence = Math.min(97, 45 + matches.length * 11);
      if (matches.length > best.evidence.length || (best.domain === "Unclassified")) {
        best = { domain: sig.name, confidence, evidence: matches.slice(0, 8) };
      }
    }
  }
  return best;
}

function similarity(a: KnowledgeRow, b: KnowledgeRow): { score: number; reasons: string[]; sharedModules: string[]; sharedTech: string[] } {
  const modA = new Set(a.modules.map((m) => m.toLowerCase())), modB = new Set(b.modules.map((m) => m.toLowerCase()));
  const sharedMods = [...modA].filter((m) => modB.has(m));
  const modJac = jaccard(modA, modB);
  const techA = new Set(a.tech.map((t) => t.name)), techB = new Set(b.tech.map((t) => t.name));
  const sharedTech = [...techA].filter((t) => techB.has(t));
  const techJac = jaccard(techA, techB);
  const compCos = cosine(a.componentProfile, b.componentProfile);
  const domainMatch = a.domain === b.domain && a.domain !== "Unclassified" ? 1 : 0;
  const score = Math.round(100 * (0.4 * modJac + 0.2 * techJac + 0.25 * compCos + 0.15 * domainMatch));
  const reasons: string[] = [];
  if (domainMatch) reasons.push(`both are ${a.domain}`);
  if (sharedMods.length) reasons.push(`${sharedMods.length} shared business module(s)`);
  if (sharedTech.length) reasons.push(`shared tech: ${sharedTech.join(", ")}`);
  if (compCos > 0.6) reasons.push("similar component composition");
  return { score, reasons, sharedModules: [...modA].filter((m) => modB.has(m)).map(titleish), sharedTech };
}

function jaccard(a: Set<string>, b: Set<string>): number { if (!a.size && !b.size) return 0; const inter = [...a].filter((x) => b.has(x)).length; return inter / (a.size + b.size - inter); }
function cosine(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) { const va = a[k] || 0, vb = b[k] || 0; dot += va * vb; na += va * va; nb += vb * vb; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
function tally(arr: string[]): Record<string, number> { const o: Record<string, number> = {}; for (const x of arr) if (x) o[x] = (o[x] || 0) + 1; return o; }
function sortDist(o: Record<string, number>): { name: string; count: number }[] { return Object.entries(o).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count); }
function findApp(apps: KnowledgeRow[], name: string): KnowledgeRow | undefined { const n = name.trim().toLowerCase(); return apps.find((a) => a.appName.toLowerCase() === n) || apps.find((a) => a.appName.toLowerCase().includes(n) || n.includes(a.appName.toLowerCase())) || apps.find((a) => a.url.toLowerCase().includes(n)); }
function titleish(s: string) { return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "); }
