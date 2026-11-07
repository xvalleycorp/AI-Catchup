import type { RawItem, Source } from "./types";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

export function cleanText(s: string | undefined | null, max = 400): string {
  if (!s) return "";
  // Feeds often double-encode, so decode, strip tags, then decode again.
  const text = decodeEntities(decodeEntities(s).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function xmlValue(chunk: string, tag: string): string | undefined {
  const open = chunk.indexOf(`<${tag}`);
  if (open < 0) return undefined;
  const after = chunk[open + tag.length + 1];
  if (after !== ">" && after !== " " && after !== "/" && after !== "\n" && after !== "\t") return undefined;
  const start = chunk.indexOf(">", open);
  if (start < 0 || chunk[start - 1] === "/") return undefined;
  const end = chunk.indexOf(`</${tag}>`, start);
  if (end < 0) return undefined;
  const raw = chunk.slice(start + 1, end).trim();
  return raw.startsWith("<![CDATA[") ? raw.slice(9, raw.lastIndexOf("]]>")) : raw;
}

function atomLink(entry: string): string | undefined {
  let fallback: string | undefined;
  for (const m of entry.matchAll(/<link\b[^>]*>/g)) {
    const href = /href="([^"]+)"/.exec(m[0])?.[1];
    if (!href) continue;
    if (/rel="alternate"/.test(m[0])) return href;
    if (!/rel=/.test(m[0])) fallback ??= href;
  }
  return fallback;
}

function toMs(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

/** RSS 2.0 and Atom. Scans with indexOf so a truncated body yields only complete entries. */
export function parseFeed(xml: string, maxItems = 40): RawItem[] {
  const isAtom = !/<item[\s>]/.test(xml) && /<entry[\s>]/.test(xml);
  const tag = isAtom ? "entry" : "item";
  const close = `</${tag}>`;
  const items: RawItem[] = [];
  let pos = 0;
  while (items.length < maxItems) {
    const m = xml.indexOf(`<${tag}`, pos);
    if (m < 0) break;
    const end = xml.indexOf(close, m);
    if (end < 0) break;
    const chunk = xml.slice(m, end);
    pos = end + close.length;
    const title = cleanText(xmlValue(chunk, "title"), 200);
    const url = isAtom ? atomLink(chunk) : decodeEntities(xmlValue(chunk, "link") ?? "").trim();
    if (!title || !url) continue;
    const summary = xmlValue(chunk, isAtom ? "summary" : "description") ?? xmlValue(chunk, "content");
    const date = isAtom
      ? xmlValue(chunk, "published") ?? xmlValue(chunk, "updated")
      : xmlValue(chunk, "pubDate") ?? xmlValue(chunk, "dc:date");
    const text = cleanText(summary).replace(/\s*submitted by \/u\/.*$/, ""); // Reddit footer
    items.push({ title, url: decodeEntities(url), summary: text, publishedAt: toMs(date) });
  }
  return items;
}

export function parseTrending(html: string): RawItem[] {
  const weekly = /stars? this week/.test(html);
  const items: RawItem[] = [];
  for (const article of html.split('<article class="Box-row">').slice(1)) {
    const slug = /<h2[^>]*>\s*<a\b[^>]*href="\/([^"/]+\/[^"/]+)"/.exec(article)?.[1];
    if (!slug) continue;
    const desc = /<p class="[^"]*col-9[^"]*">([\s\S]*?)<\/p>/.exec(article)?.[1];
    const gained = /([\d,]+)\s+stars?\s+(?:today|this week)/.exec(article)?.[1];
    const lang = /itemprop="programmingLanguage">([^<]+)/.exec(article)?.[1];
    const signal = gained ? Number(gained.replace(/,/g, "")) : 0;
    const label = weekly ? "tuần" : "hôm nay";
    items.push({
      title: slug,
      url: `https://github.com/${slug}`,
      summary: cleanText(desc),
      signal,
      metric: `★ +${signal.toLocaleString("en-US")} ${label}${lang ? ` · ${lang}` : ""}`,
    });
  }
  return items;
}

interface GhRepo { full_name: string; html_url: string; description: string | null; stargazers_count: number; created_at: string; language: string | null }

export function parseGhSearch(json: string): RawItem[] {
  const data = JSON.parse(json) as { items?: GhRepo[] };
  return (data.items ?? []).map((r) => ({
    title: r.full_name,
    url: r.html_url,
    summary: cleanText(r.description),
    publishedAt: toMs(r.created_at),
    signal: r.stargazers_count,
    metric: `★ ${r.stargazers_count.toLocaleString("en-US")} · repo mới`,
  }));
}

const PRERELEASE = /\b(rc|beta|alpha|nightly|preview|pre|canary|dev)\b|-(rc|beta|alpha|pre)/i;

export function parseReleases(xml: string, displayName: string): RawItem[] {
  // Monorepos publish sub-packages ("langgraph-sdk==0.4.14") that say nothing about the main project.
  const latest = parseFeed(xml, 15).find((r) => !PRERELEASE.test(r.title) && !/-\w+==/.test(r.title));
  if (!latest) return [];
  const version = /\bv?\d+(?:\.\d+)+\b/.exec(latest.title)?.[0] ?? latest.title;
  return [{ ...latest, title: `${displayName} ${version}`, summary: "" }];
}

interface HnHit { title: string | null; url: string | null; objectID: string; points: number; num_comments: number; created_at_i: number }

export function parseHn(json: string): RawItem[] {
  const data = JSON.parse(json) as { hits?: HnHit[] };
  return (data.hits ?? []).flatMap((h) => {
    if (!h.title) return [];
    const discussUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
    return [{
      title: cleanText(h.title, 200),
      url: h.url || discussUrl,
      publishedAt: h.created_at_i * 1000,
      signal: h.points,
      metric: `▲ ${h.points} · ${h.num_comments} bình luận`,
      discussUrl,
    }];
  });
}

interface HfModel { id: string; likes?: number; trendingScore?: number; downloads?: number; pipeline_tag?: string; createdAt?: string }

export function parseHfModels(json: string): RawItem[] {
  return (JSON.parse(json) as HfModel[]).map((m) => ({
    title: m.id,
    url: `https://huggingface.co/${m.id}`,
    summary: m.pipeline_tag ?? "",
    publishedAt: toMs(m.createdAt),
    signal: m.trendingScore ?? 0,
    metric: `↗ ${m.trendingScore ?? 0} · ♥ ${(m.likes ?? 0).toLocaleString("en-US")}`,
  }));
}

interface HfPaper { title: string; summary?: string; publishedAt?: string; paper?: { id?: string; upvotes?: number; submittedOnDailyAt?: string; githubStars?: number } }

export function parseHfPapers(json: string): RawItem[] {
  return (JSON.parse(json) as HfPaper[]).flatMap((p) => {
    const id = p.paper?.id;
    if (!id || !p.title) return [];
    const upvotes = p.paper?.upvotes ?? 0;
    const stars = p.paper?.githubStars ?? 0;
    return [{
      title: cleanText(p.title, 200),
      url: `https://huggingface.co/papers/${id}`,
      summary: cleanText(p.summary),
      publishedAt: toMs(p.paper?.submittedOnDailyAt) ?? toMs(p.publishedAt),
      signal: upvotes,
      metric: `▲ ${upvotes}${stars ? ` · ★ ${stars.toLocaleString("en-US")}` : ""}`,
    }];
  });
}

interface OrModel { id: string; name: string; created: number; description?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }

export function parseOpenRouter(json: string): RawItem[] {
  // The endpoint lists newest first and is ~800 KB, so ingest reads a prefix: close it at the last whole model.
  let data: { data?: OrModel[] };
  try {
    data = JSON.parse(json) as { data?: OrModel[] };
  } catch {
    const cut = json.lastIndexOf('},{"id":"');
    if (cut < 0) throw new Error("OpenRouter: unexpected response");
    data = JSON.parse(`${json.slice(0, cut + 1)}]}`) as { data?: OrModel[] };
  }
  return (data.data ?? [])
    .filter((m) => !m.id.endsWith(":free"))
    .sort((a, b) => b.created - a.created)
    .slice(0, 30)
    .map((m) => {
      const input = Number(m.pricing?.prompt) * 1e6;
      const output = Number(m.pricing?.completion) * 1e6;
      const price = input > 0 && output > 0 ? `$${+input.toFixed(2)}/$${+output.toFixed(2)} /1M` : "";
      const ctx = m.context_length ? `${Math.round(m.context_length / 1000)}K ctx` : "";
      return {
        title: cleanText(m.name, 200),
        url: `https://openrouter.ai/${m.id}`,
        summary: cleanText(m.description),
        publishedAt: m.created * 1000,
        metric: [ctx, price].filter(Boolean).join(" · "),
      };
    });
}

interface LobstersStory { title: string; url: string; comments_url: string; score: number; comment_count: number; created_at: string }

export function parseLobsters(json: string): RawItem[] {
  return (JSON.parse(json) as LobstersStory[]).map((s) => ({
    title: cleanText(s.title, 200),
    url: s.url || s.comments_url,
    publishedAt: toMs(s.created_at),
    signal: s.score,
    metric: `▲ ${s.score} · ${s.comment_count} bình luận`,
    discussUrl: s.comments_url,
  }));
}

/** Sanity documents embedded in the page carry the real publish date for each slug. */
function anthropicDates(html: string): Map<string, number> {
  const dates = new Map<string, number>();
  const add = (slug: string, date: string) => {
    const t = toMs(date);
    if (t && !dates.has(slug)) dates.set(slug, t);
  };
  for (const m of html.matchAll(/publishedOn\\?":\\?"(\d{4}-\d\d-\d\d)\\?"[^{}]{0,300}?slug\\?":\{[^{}]*?current\\?":\\?"([a-z0-9-]+)/g)) add(m[2]!, m[1]!);
  for (const m of html.matchAll(/current\\?":\\?"([a-z0-9-]+)\\?"\},[^{}]{0,120}?publishedOn\\?":\\?"(\d{4}-\d\d-\d\d)/g)) add(m[1]!, m[2]!);
  return dates;
}

/** anthropic.com has no feed. Titles sit in <a href="/news/slug"><h3>; Engineering posts link to /research or /engineering. */
export function parseAnthropic(html: string, baseUrl: string): RawItem[] {
  const sections = new URL(baseUrl).pathname === "/engineering" ? "research|engineering" : "news";
  const anchors = new RegExp(`<a\\b[^>]*href="(/(?:${sections})/([a-z0-9-]+))"[^>]*>([\\s\\S]*?)</a>`, "g");
  const dates = anthropicDates(html);
  const items = new Map<string, RawItem>();
  for (const m of html.matchAll(anchors)) {
    const [, path, slug, body] = m as unknown as [string, string, string, string];
    const heading = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/.exec(body)?.[1];
    if (!heading || items.has(path)) continue;
    items.set(path, {
      title: cleanText(heading, 200),
      url: `https://www.anthropic.com${path}`,
      summary: cleanText(/<p[^>]*>([\s\S]*?)<\/p>/.exec(body)?.[1]),
      publishedAt: dates.get(slug) ?? toMs(/<time[^>]*>([^<]+)<\/time>[^<]*(?:<\/[a-z]+>)?\s*$/.exec(html.slice(Math.max(0, m.index - 200), m.index))?.[1]),
    });
  }
  return [...items.values()].slice(0, 30);
}

/** ai.meta.com has no feed. The page carries no reliable per-card date, so items are dated at first sight. */
export function parseMeta(html: string): RawItem[] {
  const items = new Map<string, RawItem>();
  for (const m of html.matchAll(/<a\b[^>]*href="(https:\/\/ai\.meta\.com\/blog\/[a-z0-9-]+\/)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const title = cleanText(m[2], 200);
    if (title.length < 12 || items.has(m[1]!)) continue;
    items.set(m[1]!, { title, url: m[1]! });
  }
  return [...items.values()].slice(0, 20);
}

interface GhAdvisory {
  ghsa_id: string;
  html_url: string;
  summary: string;
  severity: string;
  cvss?: { score: number | null } | null;
  published_at: string;
  withdrawn_at: string | null;
  vulnerabilities?: { package?: { name?: string }; first_patched_version?: string | null }[];
}

export const SEVERITY_LABEL: Record<string, string> = { critical: "NGHIÊM TRỌNG", high: "CAO", medium: "TRUNG BÌNH", low: "THẤP" };
const SEVERITY_SIGNAL: Record<string, number> = { critical: 95, high: 75, medium: 50, low: 20 };

/** GitHub security advisories. Signal is CVSS x10, or a severity-based stand-in when no score is published. */
export function parseAdvisories(json: string): RawItem[] {
  const data = JSON.parse(json) as GhAdvisory[];
  if (!Array.isArray(data)) throw new Error("GitHub Advisory: unexpected response");
  return data.flatMap((a) => {
    if (a.withdrawn_at || !a.summary || !/^https:\/\/github\.com\//.test(a.html_url)) return [];
    const packages = [...new Set((a.vulnerabilities ?? []).map((v) => v.package?.name).filter((n): n is string => !!n))];
    const main = packages[0] ?? "";
    const short = main.split("/").pop() ?? main;
    const summary = cleanText(a.summary, 180);
    const title = !main || summary.toLowerCase().includes(short.toLowerCase()) ? summary : `${main}: ${summary}`;
    const score = a.cvss?.score ?? null;
    const patched = a.vulnerabilities?.find((v) => v.first_patched_version)?.first_patched_version;
    const severity = SEVERITY_LABEL[a.severity] ? a.severity : "medium";
    return [{
      title,
      url: a.html_url,
      summary: packages.join(", "),
      publishedAt: toMs(a.published_at),
      signal: score !== null ? Math.round(score * 10) : SEVERITY_SIGNAL[severity]!,
      metric: [SEVERITY_LABEL[severity], score !== null ? `CVSS ${score}` : "", patched ? `bản vá ${patched}` : "chưa có bản vá"].filter(Boolean).join(" · "),
    }];
  });
}

export interface LifecycleRow {
  model: string;
  retiresAt: number;
  replacement: string;
}

/** Tables in a page, from Markdown pipes or Markdoc {% table %} blocks: [header, ...rows]. */
function markdownTables(md: string): string[][][] {
  const tables: string[][][] = [];
  const lines = md.split("\n");
  let pipe: string[][] = [];
  const flushPipe = () => {
    if (pipe.length >= 3) tables.push([pipe[0]!, ...pipe.slice(2)]);
    pipe = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|")) {
      pipe.push(trimmed.replace(/\\\|/g, "/").replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    } else {
      flushPipe();
    }
  }
  flushPipe();
  for (const block of md.matchAll(/\{%\s*table\s*%\}([\s\S]*?)\{%\s*\/table\s*%\}/g)) {
    const rows = block[1]!.split(/^\s*---\s*$/m).map((chunk) =>
      chunk.split("\n").filter((l) => /^\s*\*/.test(l)).map((l) => l.replace(/^\s*\*\s?/, "").trim()),
    ).filter((r) => r.length > 0);
    if (rows.length >= 2) tables.push(rows);
  }
  return tables;
}

const TENTATIVE = /not sooner|no earlier|to be announced|tbd|n\/a|no shutdown|not announced|earliest|^-$/i;

function cleanCell(cell: string): string {
  return cell.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/`/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Definite shutdown dates from a provider's deprecations page. Tentative or unannounced dates are skipped. */
export function parseLifecycle(md: string): LifecycleRow[] {
  const found = new Map<string, LifecycleRow>();
  for (const [header, ...rows] of markdownTables(md)) {
    const h = header!.map((c) => cleanCell(c).toLowerCase());
    const modelCol = h.findIndex((c) => /model|system/.test(c) && !/replace/.test(c));
    const dateCol = h.findIndex((c) => /shutdown|retire/.test(c) && !/training/.test(c));
    const replaceCol = h.findIndex((c) => /replace/.test(c));
    if (modelCol < 0 || dateCol < 0) continue;
    for (const row of rows) {
      const model = cleanCell(row[modelCol] ?? "").slice(0, 100);
      const when = cleanCell(row[dateCol] ?? "");
      if (!model || !when || TENTATIVE.test(when)) continue;
      const retiresAt = Date.parse(when);
      if (Number.isNaN(retiresAt)) continue;
      const replacement = replaceCol >= 0 ? cleanCell(row[replaceCol] ?? "").slice(0, 100) : "";
      found.set(model, { model, retiresAt, replacement: TENTATIVE.test(replacement) ? "" : replacement });
    }
  }
  return [...found.values()];
}

export function parseSource(source: Source, body: string): RawItem[] {
  switch (source.kind) {
    case "rss": return parseFeed(body);
    case "gh-trending": return parseTrending(body);
    case "gh-search": return parseGhSearch(body);
    case "gh-release": return parseReleases(body, source.name);
    case "hn": return parseHn(body);
    case "hf-models": return parseHfModels(body);
    case "hf-papers": return parseHfPapers(body);
    case "openrouter": return parseOpenRouter(body);
    case "lobsters": return parseLobsters(body);
    case "anthropic": return parseAnthropic(body, source.url);
    case "meta": return parseMeta(body);
    case "gh-advisory": return parseAdvisories(body);
  }
}
