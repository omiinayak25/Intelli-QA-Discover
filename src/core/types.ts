/**
 * Discovery Model types — the structured picture of "what all is present in
 * this application that I need to test?".
 *
 * DISCIPLINE: these types describe WHAT EXISTS. There is no `expected*` field,
 * no verdict, no pass/fail, no risk/severity anywhere by design.
 */

import type { Envelope } from "./envelope.js";
import type { Category, MapNodeType, TickState, BlockerType } from "./constants.js";

/** Cross-cutting: certainty of DISCOVERY (never pass-probability). */
export interface Confidence {
  /** 0-100. 100 = certain the item exists / is correctly identified. */
  confidence: number;
  /** Required when confidence < LOW_CONFIDENCE_THRESHOLD. */
  confidenceReason?: string | null;
}

/** Inferred semantics — descriptive, never prescriptive. */
export interface Semantics {
  businessFunction?: string;
  inferredPurpose?: string;
  /** Observed effect label, e.g. "opens Seat Selection". Never "should …". */
  behavior?: string;
  /** Target Discovery Model IDs this item navigates to / reveals. */
  leadsTo?: string[];
  partOfFlow?: string | null;
  semanticConfidence?: number;
  semanticConfidenceReason?: string | null;
}

/** Link back to the exact raw evidence that produced an item. */
export interface SourceEvidence {
  rawArtifact: string;
  stateId?: string;
  locator?: string;
  screenshotRef?: string;
}

export interface ManualReviewTag {
  manualReview: boolean;
  manualReviewReason?: string | null;
  blockerType?: BlockerType;
}

interface BaseItem extends Confidence, Semantics, ManualReviewTag {
  id: string;
  category: Category;
  label: string;
  /** Roles that can reach it, stored lowercase/slug. */
  roleVisibility: string[];
  detectionMethod: DetectionMethod;
  sourceEvidence: SourceEvidence;
}

export type DetectionMethod =
  | "dom"
  | "accessibility_tree"
  | "computed_style"
  | "event_listener"
  | "network"
  | "vision";

export interface PageItem extends BaseItem {
  category: "page";
  title: string;
  archetype: string;
  urlPattern: string;
  sampleUrls: string[];
  httpStatusObserved: number | null;
  authRequired: boolean;
  containsForms: string[];
  containsComponents: string[];
  knownStates: string[];
  entryPoints: string[];
  discoverySource: string;
}

export interface NavigationItem extends BaseItem {
  category: "navigation";
  type: string;
  scope: "global" | "page-local";
  page?: string;
  items: { label: string; selector: string; target: string }[];
  revealTrigger: string;
  selector: string;
}

export interface ComponentItem extends BaseItem {
  category: "component";
  type: string;
  selector: string;
  xpath?: string;
  page: string;
  parent?: string | null;
  ariaRole?: string;
  interactive: boolean;
  eventListeners: string[];
  stateVariants: string[];
  triggersApi: string[];
  opensModalOrDrawer?: string | null;
  visionClassified: boolean;
  scope: "global" | "page-local";
  appearsOn?: string[];
}

export interface FeatureItem extends BaseItem {
  category: "business_feature";
  name: string;
  featureCategory: string;
  pages: string[];
  components: string[];
  forms: string[];
  flows: string[];
  apis: string[];
  entryPoints: string[];
  evidence: string[];
}

export interface FlowStep {
  order: number;
  pageId?: string;
  componentId?: string;
  action: string;
  resultingState?: string;
}

export interface FlowItem extends BaseItem {
  category: "user_flow";
  name: string;
  feature?: string;
  steps: FlowStep[];
  startPoint?: string;
  branches: { label: string; steps: FlowStep[] }[];
  terminalOutcomes: string[];
  apiSequence: string[];
  crossesRoles: boolean;
  stepCount: number;
}

export interface HiddenItem extends BaseItem {
  category: "hidden";
  type: string;
  revealTrigger: string;
  revealedElement?: string;
  page: string;
  preconditions?: string;
  detectionMethodDetail: string;
  reproducible: boolean;
}

export interface ApiItem extends BaseItem {
  category: "api";
  triggeringComponent?: string;
  triggeringAction: string;
  page?: string;
  flowStep?: string;
  method: string;
  endpointPattern: string;
  transport: string;
  sampleStatus?: number | null;
  requestShape: string[];
  authSignalObserved: "cookie" | "bearer" | "none";
  correlationConfidence: "high" | "med" | "low";
}

export interface FormField {
  label: string;
  name: string;
  type: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: string[];
  validationAttributesObserved: string[];
  cmpId?: string;
}

export interface FormItem extends BaseItem {
  category: "form";
  name: string;
  page: string;
  feature?: string;
  fields: FormField[];
  fieldCount: number;
  requiredFields: string[];
  validationAttributesObserved: string[];
  submitControl?: string;
  submitTargetApi?: string;
  multiStep: boolean;
  successState?: string;
  errorState?: string;
  fileUploadFields: string[];
}

export interface RoleItem extends BaseItem {
  category: "role";
  name: string;
  authMethod: "form-login" | "SSO" | "token" | "none";
  reachablePages: string[];
  reachableNav: string[];
  reachableComponents: string[];
  reachableFeatures: string[];
  reachableForms: string[];
  reachableHidden: string[];
  exclusiveItems: string[];
  deniedObserved: string[];
}

export interface StateItem extends BaseItem {
  category: "state";
  type: string;
  appliesTo: string;
  observationCondition: string;
  observationMethod: string;
  detectionSignal: string;
  observed: boolean;
  visualEvidenceRef?: string;
  roleContext?: string;
}

/** A named Business Function Inference group. */
export interface BusinessFunctionGroup {
  id: string;
  name: string;
  componentIds: string[];
  confidence: number;
  confidenceReason?: string | null;
}

// NOTE: category-9 `roles: RoleItem[]` deliberately shadows the envelope's
// `roles: string[]`. Omit it from the envelope base and re-declare as the
// category array. Use crawledRoles(model) when the string slug list is needed.
export interface DiscoveryModel extends Omit<Envelope, "roles"> {
  artifact: "discovery_model";
  generatedFrom: string;
  pages: PageItem[];
  navigation: NavigationItem[];
  components: ComponentItem[];
  features: FeatureItem[];
  flows: FlowItem[];
  hidden: HiddenItem[];
  apis: ApiItem[];
  forms: FormItem[];
  roles: RoleItem[];
  states: StateItem[];
  globalComponents: string[];
  businessFunctions: BusinessFunctionGroup[];
}

/** Any discovered item across the 10 categories. */
export type AnyItem =
  | PageItem
  | NavigationItem
  | ComponentItem
  | FeatureItem
  | FlowItem
  | HiddenItem
  | ApiItem
  | FormItem
  | RoleItem
  | StateItem;

export type { Category, MapNodeType, TickState, BlockerType };
