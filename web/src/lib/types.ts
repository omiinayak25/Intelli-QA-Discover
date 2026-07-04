// Types mirroring the backend DiscoveryRecord + PortalModel (the API contract).

export interface DiscoveryRecord {
  id: string;
  runId: string;
  url: string;
  appName: string;
  createdAt: string;
  status: "running" | "done" | "error";
  error?: string;
  confidence?: number;
  completeness?: number;
  counts?: { pages: number; components: number; features: number; flows: number; forms: number; apis: number; manualReview: number };
  durationMs?: number;
}

export interface StageProgress {
  stage: string;
  pct: number;
  pagesVisited?: number;
  componentsFound?: number;
  currentUrl?: string;
  currentTitle?: string;
  blocked?: number;
}

export interface ScreenshotSet {
  desktop?: string;
  tablet?: string;
  mobile?: string;
  width?: number;
  height?: number;
  boxes?: { id: string; label: string; type: string; x: number; y: number; w: number; h: number }[];
}

export interface PortalModel {
  meta: { appUrl: string; appName: string; runId: string; generatedAt: string; roles: string[]; schemaVersion: string };
  kpis: Record<string, number>;
  summary: any;
  validation: any;
  overview: any;
  featureTree: { root: FeatureNode };
  featureRel: { nodes: string[]; edges: { id: string; from: string; to: string; kind: string; confidence: number }[] };
  modules: PortalModule[];
  pages: PortalPage[];
  components: PortalComponent[];
  navigation: any[];
  forms: any[];
  flows: any[];
  states: any[];
  hidden: any[];
  apis: any[];
  rolesDetail: any[];
  manualReview: any[];
  checklist: { global: ChecklistItem[]; pageWise: { pageId: string; pageLabel: string; items: ChecklistItem[] }[] };
  timeline: { seq: number; kind: string; label: string; detail: string; role?: string }[];
  coverageMap: { id: string; label: string; kind: string; status: string; confidence: number }[];
  screenshots: Record<string, ScreenshotSet>;
  searchIndex: { id: string; label: string; kind: string; view: string; hint: string; keywords: string }[];
}

export interface FeatureNode {
  id: string; label: string; kind: string; memberIds: string[];
  confidence?: number; confidenceReason?: string | null; children: FeatureNode[];
}
export interface PortalModule {
  id: string; name: string; category: string; confidence: number; confidenceReason?: string | null;
  featureNodeId: string;
  features: { id: string; label: string; children: string[] }[];
  pageIds: string[]; componentIds: string[]; formIds: string[]; flowIds: string[]; hiddenIds: string[]; apiIds: string[];
  manualReview: boolean;
}
export interface PortalPage {
  id: string; label: string; url: string; archetype: string; roles: string[];
  confidence: number; confidenceReason?: string | null; authRequired: boolean; httpStatus: number | null;
  purpose: string; componentIds: string[]; formIds: string[]; stateIds: string[]; moduleIds: string[]; screenshotKey: string;
}
export interface PortalComponent {
  id: string; type: string; label: string; page: string; scope: string; appearsOn?: string[];
  confidence: number; confidenceReason?: string | null; businessFunction?: string; inferredPurpose?: string;
  behavior?: string; leadsTo?: string[]; partOfFlow?: string | null; selector: string; ariaRole?: string;
  triggersApi: string[]; manualReview: boolean; manualReviewReason?: string | null;
}
export interface ChecklistItem { id: string; label: string; refId?: string; mapNodeId: string; checked: boolean; }
