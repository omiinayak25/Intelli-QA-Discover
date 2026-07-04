/**
 * News widgets — a tiny server-side RSS proxy so the dashboard can show live
 * QA / AI / Browser / Security / Frontend headlines without CORS. Cached in
 * memory (30 min) and degrades to an empty list when offline.
 */

export interface NewsItem { title: string; link: string; date: string; source: string; }

const FEEDS: Record<string, { url: string; source: string }[]> = {
  qa: [{ url: "https://dev.to/feed/tag/testing", source: "dev.to/testing" }],
  ai: [{ url: "https://hnrss.org/newest?q=AI+OR+LLM&count=12", source: "Hacker News" }],
  browser: [{ url: "https://hnrss.org/newest?q=chrome+OR+browser+OR+devtools&count=12", source: "Hacker News" }],
  security: [{ url: "https://hnrss.org/newest?q=security+OR+vulnerability&count=12", source: "Hacker News" }],
  frontend: [{ url: "https://dev.to/feed/tag/react", source: "dev.to/react" }],
};

const cache = new Map<string, { at: number; items: NewsItem[] }>();
const TTL = 30 * 60 * 1000;

function textBetween(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}

function parseRss(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) || [];
  for (const b of blocks.slice(0, 12)) {
    const title = textBetween(b, "title");
    let link = textBetween(b, "link");
    if (!link) { const lm = b.match(/<link[^>]*href="([^"]+)"/i); if (lm) link = lm[1]; }
    const date = textBetween(b, "pubDate") || textBetween(b, "updated") || textBetween(b, "published");
    if (title && link) items.push({ title, link, date, source });
  }
  return items;
}

export async function fetchNews(topic: string): Promise<NewsItem[]> {
  const key = topic in FEEDS ? topic : "qa";
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL) return cached.items;
  const out: NewsItem[] = [];
  for (const feed of FEEDS[key]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(feed.url, { signal: ctrl.signal, headers: { "user-agent": "IntelliQADiscover/1.0" } });
      clearTimeout(t);
      if (res.ok) out.push(...parseRss(await res.text(), feed.source));
    } catch { /* skip feed */ }
  }
  const items = out.slice(0, 10);
  if (items.length) cache.set(key, { at: Date.now(), items });
  return items;
}
