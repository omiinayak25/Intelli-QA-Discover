# INTERFACE SKETCHES

Type/interface signatures for the domain entities and each agent's function shape. These match `DISCOVERY_MODEL.md`. All code fences are sketches, not shipped code.

---

## Common Envelope & Cross-Cutting

```
SKETCH — not implementation

interface Envelope {
  artifact: string;
  schemaVersion: string;          // frozen "1.0.0"
  artifactId: string;
  runId: string;                  // "RUN:01hxa"
  appUrl: string;
  generatedAt: string;            // passed in, keeps transforms deterministic
  roles: string[];                // lowercase/slug
  sourceArtifacts: string[];
}

interface Confidence {
  confidence: number;             // 0-100, certainty of DISCOVERY
  confidenceReason?: string | null;   // required when confidence < 80
}

interface Semantics {
  businessFunction?: string;
  inferredPurpose?: string;
  behavior?: string;              // "opens Seat Selection" (descriptive)
  leadsTo?: string[];             // target entity IDs
  partOfFlow?: string | null;
  semanticConfidence?: number;
  semanticConfidenceReason?: string | null;
}

interface ManualReviewTag {
  manualReview: boolean;
  manualReviewReason?: string | null;
  blockerType?: BlockerType;      // auth_gated | payment_gateway | otp | captcha
}                                 //          | external_redirect | native_dialog | third_party_widget
```

## Base Entity

```
SKETCH — not implementation

type Category =
  | "page" | "navigation" | "component" | "business_feature" | "user_flow"
  | "hidden" | "api" | "form" | "role" | "state";

interface BaseItem extends Confidence, Semantics, ManualReviewTag {
  id: string;                     // "<PREFIX>:<content/selector key>"
  category: Category;
  label: string;
  roleVisibility: string[];       // lowercase/slug
  detectionMethod: "dom" | "accessibility_tree" | "computed_style"
                 | "event_listener" | "network" | "vision";
  sourceEvidence: { rawArtifact: string; stateId?: string; locator?: string; screenshotRef?: string };
}
```

## Selected Category Entities

```
SKETCH — not implementation

interface PageItem extends BaseItem {          // PAGE:home
  category: "page"; archetype: string; urlPattern: string; sampleUrls: string[];
  authRequired: boolean; containsForms: string[]; containsComponents: string[]; knownStates: string[];
}

interface ComponentItem extends BaseItem {     // CMP:home:hero-banner
  category: "component"; type: string; selector: string; page: string;
  interactive: boolean; eventListeners: string[]; triggersApi: string[]; visionClassified: boolean;
}

interface ApiItem extends BaseItem {           // API:GET:/movies  (mapped only)
  category: "api"; method: string; endpointPattern: string; triggeringAction: string;
  correlationConfidence: "high" | "med" | "low";   // NO response bodies, NO test
}

interface FormItem extends BaseItem {          // FORM:checkout:payment
  category: "form"; page: string; fields: FormField[]; requiredFields: string[];
  validationAttributesObserved: string[];      // captured, never submitted
}

interface RoleItem extends BaseItem {          // ROLE:admin
  category: "role"; authMethod: "form-login" | "SSO" | "token" | "none";
  reachablePages: string[]; reachableFeatures: string[]; exclusiveItems: string[];
}
```

## Derived Entities

```
SKETCH — not implementation

interface InventoryItem { id: string; /* INV:buttons */ sourceEntityId: string; count: number; }

interface MapNode {                            // MAP:auth:login
  id: string;
  nodeType: "root" | "feature" | "page" | "component" | "flow_step" | "form" | "api" | "state";
  entityId: string; parentId: string | null;
  tickState: "untested" | "partial" | "tested";
  children: MapNode[];
}

interface ChecklistItem {                      // CHK:global:login
  id: string; refId: string;                   // exactly one InventoryItem or Page
  mapNodeId: string;                           // plus its MapNode
  tickState: "untested" | "partial" | "tested";
}

interface FeatureTreeNode {                    // FEATNODE:authentication:login
  id: string; memberEntityIds: string[]; parentId: string | null; children: FeatureTreeNode[];
}

interface ManualReviewEntry {                  // MRR:payment-gateway
  id: string; blockedEntityId: string; blockerType: BlockerType; reason: string;
}
```

## Agent Function Shapes

```
SKETCH — not implementation

// Explorer — safe crawl, no vision
function explore(input: { appUrl: string; config: CrawlConfig }): Promise<RawCapture>;

// Classifier — raw -> model; only place vision runs (canvas/chart/custom typing)
function classify(raw: RawCapture, generatedAt: string): Promise<DiscoveryModel>;

// Organizer / Inventory
function organize(model: DiscoveryModel, generatedAt: string): {
  inventory: QaInventory; overview: ApplicationOverview;
  featureTree: FeatureTree; relationships: FeatureRelationships; qaMap: QaMap;
};

// Checklist / Map Reporter
function report(model: DiscoveryModel, qaMap: QaMap, generatedAt: string): {
  checklist: QaChecklist; summary: DiscoverySummary; manualReview: ManualReview;
  validation: DiscoveryValidation; bundle: Bundle;
};
```

All agent transforms (Classifier onward) are pure: same input → same output, modulo `generatedAt`.
