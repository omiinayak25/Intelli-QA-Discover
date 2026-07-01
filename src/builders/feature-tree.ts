/**
 * Business Feature Tree (Phase 3) + Feature Relationships.
 *
 * Business/functional hierarchy of what the app DOES — organized the way a
 * senior QA groups an app, NOT by DOM/page structure. Distinct from the
 * structural QA Map (Phase 5). Nodes carry NO test cases.
 */

import { LOW_CONFIDENCE_THRESHOLD } from "../core/constants.js";
import { hash, id, slug, titleCase } from "../core/ids.js";
import { makeEnvelope, type Envelope } from "../core/envelope.js";
import type { DiscoveryModel, FeatureItem } from "../core/types.js";

export interface FeatureNode {
  id: string;
  label: string;
  kind: "feature" | "subfeature" | "action";
  parentId?: string;
  memberIds: string[];
  confidence: number;
  confidenceReason?: string | null;
  children: FeatureNode[];
}

export interface FeatureTree extends Envelope {
  artifact: "business_feature_tree";
  root: FeatureNode;
}

export interface FeatureRelationships extends Envelope {
  artifact: "feature_relationships";
  nodes: string[];
  edges: { id: string; from: string; to: string; kind: string; confidence: number; reason?: string | null }[];
}

/** Known sub-capabilities detected within a feature's members. */
const SUBFEATURES: Record<string, { label: string; match: RegExp }[]> = {
  authentication: [
    { label: "Login", match: /login|sign in/i },
    { label: "Register", match: /register|sign up/i },
    { label: "Forgot Password", match: /forgot|reset/i },
    { label: "Logout", match: /logout|sign out/i },
  ],
  "search-discovery": [
    { label: "Search", match: /search/i },
    { label: "Filters", match: /filter/i },
    { label: "Sort", match: /sort/i },
    { label: "Categories", match: /categor|chip/i },
  ],
  booking: [
    { label: "Movie Selection", match: /movie|book/i },
    { label: "Seat Selection", match: /seat|select/i },
    { label: "Showtimes", match: /showtime|timing/i },
  ],
  payment: [
    { label: "Payment Methods", match: /pay|card|upi|wallet/i },
    { label: "Coupons", match: /coupon|promo/i },
    { label: "Invoice", match: /invoice|receipt/i },
  ],
  "profile-account": [
    { label: "Edit Profile", match: /profile|edit|name/i },
    { label: "Preferences", match: /preferenc|setting/i },
    { label: "Change Password", match: /password/i },
  ],
  "user-management": [
    { label: "Create User", match: /create user|add user/i },
    { label: "Delete User", match: /delete user|remove user/i },
    { label: "User List", match: /user|table/i },
  ],
  reports: [
    { label: "Charts", match: /chart|graph/i },
    { label: "Export", match: /export|download/i },
    { label: "Statistics", match: /statistic|kpi|metric/i },
  ],
};

function subFeaturesFor(model: DiscoveryModel, feat: FeatureItem): FeatureNode[] {
  const memberLabels = [
    ...feat.components.map((cid) => model.components.find((c) => c.id === cid)),
    ...feat.forms.map((fid) => model.forms.find((f) => f.id === fid)),
    ...feat.pages.map((pid) => model.pages.find((p) => p.id === pid)),
  ].filter(Boolean);
  const key = feat.id.replace("FEAT:", "");
  const defs = SUBFEATURES[key] ?? [];
  const nodes: FeatureNode[] = [];
  for (const def of defs) {
    const members = memberLabels
      .filter((m) => def.match.test((m as any).label + " " + ((m as any).name ?? "")))
      .map((m) => (m as any).id as string);
    if (members.length === 0) continue;
    nodes.push({
      id: id("FEATNODE", key, slug(def.label)),
      label: def.label,
      kind: "action",
      parentId: id("FEATNODE", key),
      memberIds: Array.from(new Set(members)).sort(),
      confidence: Math.max(...members.map((mid) => memberConf(model, mid)), 80),
      confidenceReason: null,
      children: [],
    });
  }
  return nodes;
}

function memberConf(model: DiscoveryModel, mid: string): number {
  const all = [...model.components, ...model.forms, ...model.pages, ...model.flows, ...model.features];
  return all.find((x) => x.id === mid)?.confidence ?? 80;
}

export function buildFeatureTree(model: DiscoveryModel, generatedAt: string): FeatureTree {
  const children: FeatureNode[] = [];
  for (const feat of model.features) {
    const key = feat.id.replace("FEAT:", "");
    const subs = subFeaturesFor(model, feat);
    const members = [...feat.pages, ...feat.flows, ...feat.forms, ...feat.components.slice(0, 8)];
    const conf = feat.confidence;
    children.push({
      id: id("FEATNODE", key),
      label: feat.name,
      kind: "feature",
      parentId: "FEATNODE:root",
      memberIds: Array.from(new Set(members)).sort(),
      confidence: conf,
      confidenceReason: conf < LOW_CONFIDENCE_THRESHOLD ? feat.confidenceReason ?? "Grouped from limited evidence." : null,
      children: subs,
    });
  }
  children.sort((a, b) => a.id.localeCompare(b.id));

  const root: FeatureNode = {
    id: "FEATNODE:root",
    label: "Application",
    kind: "feature",
    memberIds: [],
    confidence: 100,
    confidenceReason: null,
    children,
  };

  const envelope = makeEnvelope({
    artifact: "business_feature_tree",
    artifactId: id("FEATNODE", hash(model.runId, "tree")),
    runId: model.runId,
    appUrl: model.appUrl,
    roles: model.roles.map((r) => r.name),
    sourceArtifacts: ["discovery-model.json"],
    generatedAt,
  });
  return { ...envelope, artifact: "business_feature_tree", root };
}

export function buildFeatureRelationships(
  model: DiscoveryModel,
  generatedAt: string,
): FeatureRelationships {
  const featIds = model.features.map((f) => f.id);
  const edges: FeatureRelationships["edges"] = [];
  // infer edges from flows: consecutive feature-linked pages, and known chains
  const order = ["FEAT:authentication", "FEAT:search-discovery", "FEAT:booking", "FEAT:payment"];
  const present = order.filter((f) => featIds.includes(f));
  for (let i = 0; i < present.length - 1; i++) {
    edges.push({
      id: id("REL", slug(present[i].replace("FEAT:", "") + "->" + present[i + 1].replace("FEAT:", ""))),
      from: present[i],
      to: present[i + 1],
      kind: "leadsTo",
      confidence: 90,
      reason: null,
    });
  }
  // profile -> reports/notifications dependsOn
  if (featIds.includes("FEAT:profile-account") && featIds.includes("FEAT:notifications")) {
    edges.push({
      id: id("REL", "profile-account->notifications"),
      from: "FEAT:profile-account",
      to: "FEAT:notifications",
      kind: "leadsTo",
      confidence: 80,
      reason: null,
    });
  }
  const nodes = Array.from(new Set(edges.flatMap((e) => [e.from, e.to])));

  const envelope = makeEnvelope({
    artifact: "feature_relationships",
    artifactId: id("REL", hash(model.runId, "rel")),
    runId: model.runId,
    appUrl: model.appUrl,
    roles: model.roles.map((r) => r.name),
    sourceArtifacts: ["feature-tree.json", "discovery-model.json"],
    generatedAt,
  });
  return { ...envelope, artifact: "feature_relationships", nodes, edges };
}

// ---------- renderers ----------

export function renderFeatureTreeMd(tree: FeatureTree): string {
  const L: string[] = [];
  L.push(`# Business Feature Tree`);
  L.push("");
  L.push(`_Business-oriented — what the app does, not its DOM. A tester thinks in features._`);
  L.push("");
  L.push(tree.root.label);
  for (const feat of tree.root.children) {
    const kids = feat.children.map((c) => c.label).join(", ");
    L.push(` - ${feat.label}${kids ? ` ( ${kids} )` : ""}`);
  }
  L.push("");
  return L.join("\n") + "\n";
}

export function renderFeatureRelationshipsMd(rel: FeatureRelationships): string {
  const L: string[] = [];
  L.push(`# Feature Relationships`);
  L.push("");
  L.push(`_Inferred feature-to-feature graph (descriptive only, distinct from concrete User Flows)._`);
  L.push("");
  // render chains
  const byFrom = new Map<string, string>();
  for (const e of rel.edges) byFrom.set(e.from, e.to);
  const starts = rel.nodes.filter((n) => !rel.edges.some((e) => e.to === n));
  for (const s of starts) {
    const chain = [s];
    let cur = s;
    const seen = new Set([s]);
    while (byFrom.has(cur)) {
      const next = byFrom.get(cur)!;
      if (seen.has(next)) break;
      chain.push(next);
      seen.add(next);
      cur = next;
    }
    L.push(chain.map((c) => titleCase(c.replace("FEAT:", "").replace(/-/g, " "))).join(" → "));
  }
  L.push("");
  return L.join("\n") + "\n";
}
