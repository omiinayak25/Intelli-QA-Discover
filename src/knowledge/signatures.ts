/**
 * Signature libraries for evidence-based inference. Each match records the exact
 * marker that fired, so every claim is traceable (no hallucination).
 */

export interface TechSig { name: string; category: string; re: RegExp }

/** Technology signatures matched against a page's HTML (script srcs, markup, globals). */
export const TECH_SIGS: TechSig[] = [
  { name: "Next.js", category: "framework", re: /__NEXT_DATA__|\/_next\/static/ },
  { name: "Nuxt", category: "framework", re: /__NUXT__|\/_nuxt\// },
  { name: "React", category: "framework", re: /data-reactroot|react-dom|\/static\/js\/main\.[0-9a-f]+\.js|__REACT_DEVTOOLS/ },
  { name: "Angular", category: "framework", re: /ng-version=|\bng-app\b|zone\.js|runtime\.[0-9a-f]+\.js|polyfills\.[0-9a-f]+\.js/ },
  { name: "Vue", category: "framework", re: /data-v-[0-9a-f]{6,}|__vue__|vue(\.runtime)?(\.min)?\.js/ },
  { name: "Svelte", category: "framework", re: /svelte-[0-9a-z]{5,}/ },
  { name: "jQuery", category: "library", re: /jquery(-\d|\.min)?\.js|jQuery/ },
  { name: "Material UI", category: "ui-kit", re: /\bMui[A-Z]\w+|makeStyles|@mui|material-ui/ },
  { name: "Ant Design", category: "ui-kit", re: /\bant-(btn|layout|menu|row|col|form)\b|antd/ },
  { name: "Bootstrap", category: "ui-kit", re: /bootstrap(\.min)?\.(css|js)|class="[^"]*\b(navbar|col-(sm|md|lg)-\d|btn-(primary|secondary))\b/ },
  { name: "Tailwind CSS", category: "ui-kit", re: /class="[^"]*\b(flex|grid|(p|m)(x|y|t|b|l|r)?-\d|text-(gray|slate|blue|red)-\d00|rounded-(lg|md|xl))\b[^"]*"/ },
  { name: "Chakra UI", category: "ui-kit", re: /\bchakra-\w+/ },
  { name: "PrimeReact", category: "ui-kit", re: /\bp-(button|component|datatable|dropdown)\b/ },
  { name: "Redux", category: "state", re: /__REDUX_DEVTOOLS_EXTENSION__|redux/ },
  { name: "GraphQL", category: "data", re: /graphql|__APOLLO_/ },
  { name: "PWA", category: "capability", re: /rel="manifest"|serviceWorker|service-worker\.js/ },
  { name: "Google Analytics", category: "analytics", re: /gtag\(|googletagmanager|analytics\.js|G-[A-Z0-9]{8,}/ },
  { name: "Cloudflare", category: "infra", re: /cdn-cgi|__cf_|cloudflare/ },
];

export interface DomainSig { key: string; name: string; terms: RegExp }

/** Business-domain signatures matched against modules, feature keys, component & page labels. */
export const DOMAIN_SIGS: DomainSig[] = [
  { key: "education", name: "Education / e-learning", terms: /\b(course|coaching|exam|study material|test series|mock test|syllabus|lecture|student|batch|admission|scholarship|classroom|tutorial|lesson|quiz)\b/i },
  { key: "ecommerce", name: "E-commerce / retail", terms: /\b(cart|checkout|product|catalog|wishlist|order|sku|add to cart|buy now|coupon|shipping|storefront)\b/i },
  { key: "healthcare", name: "Healthcare", terms: /\b(patient|appointment|doctor|clinic|prescription|diagnosis|ehr|emr|medical|pharmacy|hospital|lab report)\b/i },
  { key: "finance", name: "Finance / banking", terms: /\b(account balance|transaction|invoice|statement|loan|banking|wallet|transfer|kyc|portfolio|interest rate)\b/i },
  { key: "travel", name: "Travel / booking", terms: /\b(flight|hotel|booking|reservation|seat|itinerary|check-in|departure|destination)\b/i },
  { key: "media", name: "Media / content", terms: /\b(article|blog|episode|stream|watch now|playlist|subscribe|newsletter|video)\b/i },
  { key: "erp", name: "ERP / business ops", terms: /\b(inventory|purchase order|vendor|warehouse|procurement|payroll|ledger|requisition)\b/i },
  { key: "crm", name: "CRM / sales", terms: /\b(lead|opportunity|pipeline|deal|contact management|campaign|sales funnel)\b/i },
  { key: "hrms", name: "HR / HRMS", terms: /\b(employee|attendance|leave request|onboarding|payroll|appraisal|recruitment)\b/i },
  { key: "government", name: "Government / public services", terms: /\b(citizen|license|permit|tax|grievance|passport|aadhaar|municipal|public service)\b/i },
  { key: "social", name: "Social / community", terms: /\b(profile|follow|feed|post|comment|like|friend request|message|community)\b/i },
  { key: "saas", name: "SaaS / productivity", terms: /\b(dashboard|workspace|integration|api key|billing|subscription|team member|usage)\b/i },
];
