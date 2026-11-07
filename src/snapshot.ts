import { decayed, entitiesIn, LANE_SOURCE_CAP, MUST_LANE_CAP, TOPICS } from "./rules";
import { SOURCE_BY_ID, SOURCES } from "./sources";
import type { Lane, Row, Snapshot } from "./types";

const DAY = 86_400_000;
const LANE_SIZE = 30;
const MUST_SIZE = 10;
const MUST_WINDOW = 7 * DAY;
const ENTITY_WINDOW = 3 * DAY;
const ENTITY_MUST_SOURCES = 3;

interface DbItem {
  id: string; source: string; url_key: string; title: string; url: string; summary: string | null;
  published_at: number; first_seen: number; last_seen: number; metric: string | null; discuss_url: string | null;
  topics: string; base_score: number; reasons: string;
}

const LANES: Lane[] = ["labs", "github", "models", "papers", "community", "news", "tools"];

export function buildSnapshot(items: DbItem[], statuses: { id: string; last_ok: number; last_err: string | null; last_count: number }[], oldestSeen: number, now: number): Snapshot {
  // Group one story across sources; the strongest copy represents it.
  const stories = new Map<string, Row>();
  const storyByTitle = new Map<string, string>();
  const entitySources = new Map<string, { name: string; sources: Set<string>; best: Row | null }>();
  const counts = new Map<string, { count: number; prev: number }>();

  for (const item of items) {
    const source = SOURCE_BY_ID.get(item.source);
    if (!source) continue; // Source removed from config: its rows simply age out.
    const live = source.live === true;
    const t = live ? item.last_seen : item.published_at;
    const age = now - t;

    const topics = JSON.parse(item.topics) as string[];
    for (const topic of topics) {
      const c = counts.get(topic) ?? { count: 0, prev: 0 };
      if (age <= 7 * DAY) c.count += 1;
      else if (age <= 14 * DAY) c.prev += 1;
      counts.set(topic, c);
    }

    if (age > 14 * DAY) continue;
    const row: Row = {
      id: item.id, title: item.title, url: item.url, source: source.id, sourceName: source.name, lane: source.lane,
      t, firstSeen: item.first_seen, live, metric: item.metric, summary: item.summary, discussUrl: item.discuss_url,
      topics, reasons: JSON.parse(item.reasons) as string[], also: [],
      score: decayed(item.base_score, age, source.lane),
    };

    // Labs cross-post the same announcement under different URLs, so an identical title is the same story.
    const titleKey = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const storyKey = storyByTitle.get(titleKey) ?? item.url_key;
    storyByTitle.set(titleKey, storyKey);
    const existing = stories.get(storyKey);
    if (!existing) {
      stories.set(storyKey, row);
    } else {
      const [top, other] = row.score > existing.score ? [row, existing] : [existing, row];
      if (top.sourceName !== other.sourceName && !top.also.includes(other.sourceName)) top.also.push(other.sourceName, ...other.also.filter((a) => !top.also.includes(a)));
      top.reasons = [...new Set([...top.reasons, ...other.reasons])];
      top.topics = [...new Set([...top.topics, ...other.topics])];
      top.discussUrl ??= other.discussUrl;
      top.firstSeen = Math.min(top.firstSeen, other.firstSeen);
      top.t = Math.max(top.t, other.t);
      stories.set(storyKey, top);
    }
  }

  const rows = [...stories.values()];
  for (const row of rows) row.score += row.also.length * 6;

  // A model named by several independent sources is news, whichever article reports it.
  for (const row of rows) {
    if (now - row.t > ENTITY_WINDOW || row.lane === "tools") continue;
    for (const { key, name } of entitiesIn(row.title)) {
      const e = entitySources.get(key) ?? { name, sources: new Set<string>(), best: null };
      e.sources.add(row.sourceName);
      for (const a of row.also) e.sources.add(a);
      if (!e.best || row.score > e.best.score) e.best = row;
      entitySources.set(key, e);
    }
  }
  const hotEntities = [...entitySources.values()].filter((e) => e.sources.size >= 2).sort((a, b) => b.sources.size - a.sources.size).slice(0, 8);
  for (const e of hotEntities) {
    if (e.sources.size >= ENTITY_MUST_SOURCES && e.best) e.best.reasons = [...new Set([...e.best.reasons, `${e.sources.size} nguồn cùng nhắc ${e.name}`])];
  }

  const byScore = (a: Row, b: Row) => b.score - a.score;
  const lanes = Object.fromEntries(LANES.map((l) => [l, [] as Row[]])) as Record<Lane, Row[]>;
  for (const row of rows) lanes[row.lane].push(row);
  for (const lane of LANES) {
    lanes[lane].sort(byScore);
    if (lane === "tools") {
      // Releases are a status board: newest per project, freshest first.
      const latest = new Map<string, Row>();
      for (const r of lanes.tools.sort((a, b) => b.t - a.t)) if (!latest.has(r.source)) latest.set(r.source, r);
      lanes.tools = [...latest.values()];
    }
    const cap = LANE_SOURCE_CAP[lane];
    if (cap) {
      const seen = new Map<string, number>();
      lanes[lane] = lanes[lane].filter((r) => {
        const n = (seen.get(r.source) ?? 0) + 1;
        seen.set(r.source, n);
        return n <= cap;
      });
    }
    lanes[lane] = lanes[lane].slice(0, LANE_SIZE);
  }

  const perLane = new Map<Lane, number>();
  const mustByEntity = new Map<string, Row>();
  const must = rows
    .filter((r) => r.reasons.length > 0 && now - r.t <= MUST_WINDOW)
    .sort(byScore)
    .filter((r) => {
      // Differently titled reports of one model launch take a single slot; the top one keeps all the reasons.
      const entities = entitiesIn(r.title);
      const kept = entities.map((e) => mustByEntity.get(e.key)).find(Boolean);
      if (kept) {
        kept.reasons = [...new Set([...kept.reasons, ...r.reasons])];
        kept.discussUrl ??= r.discussUrl;
        return false;
      }
      for (const e of entities) mustByEntity.set(e.key, r);
      const n = perLane.get(r.lane) ?? 0;
      perLane.set(r.lane, n + 1);
      return n < MUST_LANE_CAP[r.lane];
    })
    .slice(0, MUST_SIZE);

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  return {
    generatedAt: now,
    must,
    lanes,
    topics: TOPICS.map((t) => ({ key: t.key, label: t.label, count: counts.get(t.key)?.count ?? 0, prev: counts.get(t.key)?.prev ?? 0 }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count),
    entities: hotEntities.map((e) => ({ name: e.name, sources: e.sources.size, url: e.best?.url ?? "#" })),
    deltaReady: oldestSeen > 0 && now - oldestSeen >= 14 * DAY,
    health: SOURCES.map((s) => {
      const st = statusById.get(s.id);
      return { id: s.id, name: s.name, ok: !!st && !st.last_err && st.last_ok > 0, lastOk: st?.last_ok ?? 0, err: st?.last_err ?? null, count: st?.last_count ?? 0 };
    }),
  };
}

export async function rebuildSnapshot(env: Env, now: number): Promise<void> {
  const [items, statuses, oldest] = await env.DB.batch([
    env.DB.prepare(`SELECT id, source, url_key, title, url, summary, published_at, first_seen, last_seen, metric, discuss_url, topics, base_score, reasons
                    FROM items WHERE published_at >= ?1 OR last_seen >= ?1 ORDER BY published_at DESC LIMIT 2500`).bind(now - 14 * DAY),
    env.DB.prepare("SELECT id, last_ok, last_err, last_count FROM source_status"),
    env.DB.prepare("SELECT MIN(first_seen) AS oldest FROM items"),
  ]);
  const snapshot = buildSnapshot(
    items!.results as unknown as DbItem[],
    statuses!.results as { id: string; last_ok: number; last_err: string | null; last_count: number }[],
    (oldest!.results[0] as { oldest: number | null } | undefined)?.oldest ?? 0,
    now,
  );
  await env.DB.prepare("INSERT INTO kv (key, value, updated_at) VALUES ('snapshot', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2")
    .bind(JSON.stringify(snapshot), now).run();
}
