import { SOURCES } from "./sources";

const VN_OFFSET_MS = 7 * 3_600_000;

/** Calendar day in Vietnam, the day boundary used by every timeline. */
export function vnDay(ms: number): string {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const quoted = (ids: string[]) => ids.map((id) => `'${id}'`).join(",");
// Trending entries carry no publication date, so they would all pile up on the scan day.
const UNDATED = quoted(SOURCES.filter((s) => s.live).map((s) => s.id));
const OWN_CHANNELS = quoted(SOURCES.filter((s) => s.lane === "labs").map((s) => s.id));
const DAILY_TRENDING = quoted(["gh-trend-all", "gh-trend-py", "gh-trend-ts"]);

const dayExpr = `date((published_at + ${VN_OFFSET_MS}) / 1000, 'unixepoch')`;

/**
 * Aggregates the full history in SQL and stores the JSON directly, so its cost
 * stays in the database no matter how many years of items accumulate.
 * Timelines start on the first day of collection: older dates are only what feeds still happened to list.
 */
export async function rebuildHistory(env: Env, now: number): Promise<void> {
  const start = await env.DB.prepare("SELECT MIN(first_seen) AS start FROM items").first<number>("start");
  if (!start) return;
  const startDay = vnDay(start);
  const row = await env.DB.prepare(`
    SELECT json_object(
      'start', ?1,
      'updatedAt', ?2,
      'totals', (SELECT json_group_array(json_array(d, c)) FROM (
        SELECT ${dayExpr} d, COUNT(DISTINCT url_key) c FROM items
        WHERE source NOT IN (${UNDATED}) AND ${dayExpr} >= ?1 GROUP BY d ORDER BY d)),
      'topics', (SELECT json_group_array(json_array(d, k, c)) FROM (
        SELECT ${dayExpr} d, j.value k, COUNT(DISTINCT url_key) c FROM items, json_each(items.topics) j
        WHERE source NOT IN (${UNDATED}) AND ${dayExpr} >= ?1 GROUP BY d, k)),
      'orgs', (SELECT json_group_array(json_array(d, k, c)) FROM (
        SELECT ${dayExpr} d, j.value k, COUNT(DISTINCT url_key) c FROM items, json_each(items.orgs) j
        WHERE source NOT IN (${UNDATED}) AND source NOT IN (${OWN_CHANNELS}) AND ${dayExpr} >= ?1 GROUP BY d, k)),
      'staying', (SELECT json_group_array(json_array(title, url, days)) FROM (
        SELECT i.title title, i.url url, COUNT(DISTINCT h.day) days FROM signal_history h JOIN items i ON i.id = h.item_id
        WHERE i.source IN (${DAILY_TRENDING}) GROUP BY i.url_key ORDER BY days DESC, MAX(h.signal) DESC LIMIT 10))
    ) AS value`).bind(startDay, now).first<string>("value");
  if (!row) return;
  await env.DB.prepare("INSERT INTO kv (key, value, updated_at) VALUES ('history', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2").bind(row, now).run();
}
