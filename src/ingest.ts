import { parseSource } from "./parsers";
import { canonicalUrl, classify, hashKey } from "./rules";
import type { RawItem, Source } from "./types";

const USER_AGENT = "ai-catchup/1.0 (+https://catchup.dxa.io.vn)";
const FETCH_TIMEOUT_MS = 15_000;
/** Newest entries come first, so reading a prefix keeps CPU and memory bounded on 2 MB feeds. */
const MAX_BODY_BYTES = 700_000;
const MAX_ITEM_AGE_MS = 30 * 86_400_000;
const FIRST_RUN_BACKDATE_MS = 30 * 86_400_000;
const RETENTION_MS = 60 * 86_400_000;

async function readBounded(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const decoder = new TextDecoder();
  let text = "";
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

function requestUrl(source: Source, now: number): string {
  if (source.kind === "hn") {
    const since = Math.floor((now - 3 * 86_400_000) / 1000);
    return `${source.url}?tags=story&numericFilters=points%3E%3D60,created_at_i%3E${since}&hitsPerPage=200&attributesToRetrieve=title,url,points,num_comments,created_at_i&attributesToHighlight=none`;
  }
  if (source.kind === "gh-search") {
    const since = new Date(now - 14 * 86_400_000).toISOString().slice(0, 10);
    const q = `llm OR "ai agent" OR mcp OR rag created:>${since} stars:>100`;
    return `${source.url}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=25`;
  }
  return source.url;
}

async function fetchSource(source: Source, env: Env, now: number): Promise<RawItem[]> {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (source.kind === "gh-search") {
    headers.Accept = "application/vnd.github+json";
    const token = (env as { GITHUB_TOKEN?: string }).GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(requestUrl(source, now), { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`HTTP ${res.status}`);
  }
  // JSON cannot be truncated; these endpoints are bounded in size by their own limits.
  const isJson = ["gh-search", "hn", "hf-models", "hf-papers", "lobsters"].includes(source.kind);
  const raw = parseSource(source, isJson ? await res.text() : await readBounded(res, source.maxBytes ?? MAX_BODY_BYTES));
  // An empty parse from a page that has items means the upstream markup changed.
  if (raw.length === 0) throw new Error("Không đọc được mục nào (định dạng nguồn có thể đã đổi)");
  return raw;
}

function toRow(item: RawItem, source: Source, now: number, hasRunBefore: boolean) {
  const verdict = classify(item, source);
  if (!verdict.keep) return null;
  const url = /^https?:\/\//i.test(item.url) ? item.url : null;
  if (!url) return null;
  // A first crawl of a dateless page must not flood the board with "new" items.
  const fallback = source.live || hasRunBefore ? now : now - FIRST_RUN_BACKDATE_MS;
  const publishedAt = Math.min(item.publishedAt ?? fallback, now);
  if (!source.live && now - publishedAt > MAX_ITEM_AGE_MS && item.publishedAt) return null;
  const key = canonicalUrl(url);
  return {
    id: hashKey(`${source.id}|${key}`),
    source: source.id,
    url_key: hashKey(key),
    title: item.title,
    url,
    summary: item.summary ? item.summary.slice(0, 280) : null,
    published_at: publishedAt,
    now,
    signal: item.signal ?? 0,
    metric: item.metric || null,
    discuss_url: item.discussUrl ?? null,
    topics: JSON.stringify(verdict.topics),
    base_score: verdict.baseScore,
    reasons: JSON.stringify(verdict.reasons),
  };
}

const f = (name: string) => `json_extract(value, '$.${name}')`;

/** One statement per source: json_each keeps us well under D1's per-invocation query limit. */
const UPSERT_SQL = `
INSERT INTO items (id, source, url_key, title, url, summary, published_at, first_seen, last_seen, signal, metric, discuss_url, topics, base_score, reasons)
SELECT ${f("id")}, ${f("source")}, ${f("url_key")}, ${f("title")}, ${f("url")}, ${f("summary")}, ${f("published_at")}, ${f("now")}, ${f("now")},
       ${f("signal")}, ${f("metric")}, ${f("discuss_url")}, ${f("topics")}, ${f("base_score")}, ${f("reasons")}
FROM json_each(?1) WHERE true
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title, signal = excluded.signal, metric = excluded.metric, topics = excluded.topics,
  base_score = excluded.base_score, reasons = excluded.reasons, last_seen = excluded.last_seen
WHERE ?2 = 1 OR items.signal IS NOT excluded.signal OR items.title IS NOT excluded.title OR items.reasons IS NOT excluded.reasons`;

/** Fetch, parse, classify and store one source. Throws on failure so the Workflow step can retry. */
export async function ingestSource(env: Env, source: Source, now: number): Promise<number> {
  const status = await env.DB.prepare("SELECT last_ok FROM source_status WHERE id = ?1").bind(source.id).first<number>("last_ok");
  const raw = await fetchSource(source, env, now);
  const rows = raw.flatMap((item) => toRow(item, source, now, (status ?? 0) > 0) ?? []);
  const statements: D1PreparedStatement[] = [];
  if (rows.length > 0) statements.push(env.DB.prepare(UPSERT_SQL).bind(JSON.stringify(rows), source.live ? 1 : 0));
  statements.push(env.DB.prepare(
    `INSERT INTO source_status (id, last_run, last_ok, last_err, last_count) VALUES (?1, ?2, ?2, NULL, ?3)
     ON CONFLICT(id) DO UPDATE SET last_run = ?2, last_ok = ?2, last_err = NULL, last_count = ?3`,
  ).bind(source.id, now, rows.length));
  await env.DB.batch(statements);
  return rows.length;
}

/** Keeps the previous items and last_ok, so a failing source stays visible in the health panel. */
export async function recordFailure(env: Env, source: Source, now: number, error: string): Promise<void> {
  console.warn(JSON.stringify({ event: "source_failed", source: source.id, error }));
  await env.DB.prepare(
    `INSERT INTO source_status (id, last_run, last_ok, last_err, last_count) VALUES (?1, ?2, 0, ?3, 0)
     ON CONFLICT(id) DO UPDATE SET last_run = ?2, last_err = ?3`,
  ).bind(source.id, now, error.slice(0, 200)).run();
}

export async function pruneOldItems(env: Env, now: number): Promise<void> {
  await env.DB.prepare("DELETE FROM items WHERE last_seen < ?1 AND published_at < ?1").bind(now - RETENTION_MS).run();
}
