/**
 * Inference heuristics for the Classifier.
 *
 * DISCIPLINE: these produce inferred DESCRIPTIONS (what an item is FOR / what it
 * observably does), never expected behavior, never a verification. Every phrase
 * emitted here is an observation ("opens …", "starts …"), never "should …".
 */

export interface SemanticGuess {
  businessFunction: string;
  inferredPurpose: string;
  behavior?: string;
  semanticConfidence: number;
}

const KW = (s: string) => (s ?? "").toLowerCase();

/**
 * Infer a component's semantics from its label + type. Descriptive only.
 */
export function inferComponentSemantics(label: string, type: string, page: string): SemanticGuess {
  const l = KW(label);
  const rules: { match: RegExp; fn: string; purpose: string; behavior?: string; conf: number }[] = [
    { match: /\bbook\b|book now/, fn: "Booking", purpose: "starts a booking", behavior: "opens Seat Selection", conf: 90 },
    { match: /\bpay|checkout|payment\b/, fn: "Payment", purpose: "begins the payment step", behavior: "opens Payment", conf: 88 },
    { match: /\bsearch\b/, fn: "Search & Discovery", purpose: "searches the catalog", behavior: "shows results", conf: 92 },
    { match: /\blogin|sign in\b/, fn: "Authentication", purpose: "opens the login form", behavior: "opens Login", conf: 94 },
    { match: /\bregister|sign up\b/, fn: "Authentication", purpose: "opens the registration form", behavior: "opens Register", conf: 92 },
    { match: /\blogout|sign out\b/, fn: "Authentication", purpose: "ends the session", conf: 90 },
    { match: /forgot/, fn: "Authentication", purpose: "opens password recovery", conf: 90 },
    { match: /\blanguage|locale\b/, fn: "Localization", purpose: "changes the site language", behavior: "changes the site language", conf: 88 },
    { match: /\bfilter\b/, fn: "Search & Discovery", purpose: "narrows the listing", conf: 85 },
    { match: /\bsort\b/, fn: "Search & Discovery", purpose: "reorders the listing", conf: 85 },
    { match: /\bshare\b/, fn: "Sharing", purpose: "shares the item", conf: 82 },
    { match: /favorite|wishlist|save/, fn: "Wishlist", purpose: "saves the item", conf: 82 },
    { match: /\bupload|avatar|photo\b/, fn: "Media Upload", purpose: "uploads a file", conf: 84 },
    { match: /\bdownload|export|invoice\b/, fn: "Data Export", purpose: "downloads content", conf: 84 },
    { match: /\bprofile|account\b/, fn: "Profile & Account", purpose: "opens the profile area", conf: 86 },
    { match: /\bnotification|bell\b/, fn: "Notifications", purpose: "shows notifications", conf: 84 },
    { match: /\bcart\b/, fn: "Commerce", purpose: "opens the cart", conf: 86 },
    { match: /\bmenu|hamburger\b/, fn: "Navigation", purpose: "opens the navigation menu", behavior: "opens the menu", conf: 88 },
    { match: /\bcreate user|add user\b/, fn: "User Management", purpose: "opens the create-user form", conf: 86 },
  ];
  for (const r of rules) {
    if (r.match.test(l)) {
      return { businessFunction: r.fn, inferredPurpose: r.purpose, behavior: r.behavior, semanticConfidence: r.conf };
    }
  }
  // type-based fallback
  const typeMap: Record<string, SemanticGuess> = {
    button: { businessFunction: "Interaction", inferredPurpose: "triggers an action", semanticConfidence: 62 },
    input: { businessFunction: "Data Entry", inferredPurpose: "accepts user input", semanticConfidence: 66 },
    dropdown: { businessFunction: "Selection", inferredPurpose: "selects an option", semanticConfidence: 66 },
    search: { businessFunction: "Search & Discovery", inferredPurpose: "searches content", semanticConfidence: 80 },
    table: { businessFunction: "Data Display", inferredPurpose: "displays tabular data", semanticConfidence: 78 },
    chart: { businessFunction: "Reporting", inferredPurpose: "visualizes data", semanticConfidence: 70 },
    card: { businessFunction: "Content Browse", inferredPurpose: "presents a content item", semanticConfidence: 72 },
    carousel: { businessFunction: "Content Browse", inferredPurpose: "rotates featured content", semanticConfidence: 72 },
    video: { businessFunction: "Media", inferredPurpose: "plays a video", semanticConfidence: 78 },
    modal: { businessFunction: "Overlay", inferredPurpose: "presents an overlay", semanticConfidence: 68 },
    accordion: { businessFunction: "Disclosure", inferredPurpose: "expands hidden content", semanticConfidence: 70 },
    tabs: { businessFunction: "Navigation", inferredPurpose: "switches between views", semanticConfidence: 72 },
    upload: { businessFunction: "Media Upload", inferredPurpose: "uploads a file", semanticConfidence: 80 },
    checkbox: { businessFunction: "Selection", inferredPurpose: "toggles an option", semanticConfidence: 66 },
    radio: { businessFunction: "Selection", inferredPurpose: "selects one option", semanticConfidence: 66 },
    calendar: { businessFunction: "Scheduling", inferredPurpose: "picks a date", semanticConfidence: 72 },
  };
  return (
    typeMap[type] ?? {
      businessFunction: "unknown",
      inferredPurpose: "unknown",
      semanticConfidence: 45,
    }
  );
}

/** Feature-area classification for the Business Feature Tree. */
export interface FeatureArea {
  key: string;
  name: string;
  category: string;
  match: RegExp;
}

export const FEATURE_AREAS: FeatureArea[] = [
  { key: "authentication", name: "Authentication", category: "identity", match: /login|sign in|register|sign up|logout|forgot|password|otp|2fa/i },
  { key: "search-discovery", name: "Search & Discovery", category: "search", match: /search|filter|sort|categor|browse|recommend/i },
  { key: "booking", name: "Booking", category: "booking", match: /book|seat|showtime|reserv|ticket/i },
  { key: "payment", name: "Payment", category: "commerce", match: /pay|checkout|coupon|wallet|card|upi|invoice/i },
  { key: "profile-account", name: "Profile & Account", category: "identity", match: /profile|account|avatar|preferenc|setting/i },
  { key: "user-management", name: "User Management", category: "admin", match: /user management|create user|edit user|delete user|admin/i },
  { key: "reports", name: "Reports", category: "reporting", match: /report|analytic|dashboard|chart|statistic|export/i },
  { key: "notifications", name: "Notifications", category: "communication", match: /notification|bell|alert|message|inbox/i },
  { key: "media", name: "Media", category: "content", match: /video|trailer|gallery|image|media|upload/i },
  { key: "localization", name: "Localization", category: "cross-cutting", match: /language|locale|region|currency/i },
];
