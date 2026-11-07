import { ORGS, TOPICS } from "./rules";
import type { DbItem } from "./snapshot";
import type { MomentumBar, Row, Story } from "./types";

const DAY = 86_400_000;
const BARS = 10;
/** A trending list only counts while its latest scans still include the repo. */
const FRESH_LISTING = 1.5 * DAY;
const MAX_DEBATE_POINTS = 60;

const TOPIC_INDEX = new Map(TOPICS.map((t, i) => [t.key, i]));
const ORG_INDEX = new Map(ORGS.map((o, i) => [o.key, i]));

const indexes = (keys: string[], index: Map<string, number>): number[] => keys.flatMap((k) => index.get(k) ?? []);

function bars(items: DbItem[], sources: string[], now: number, requireFresh: boolean): MomentumBar[] {
  const best = new Map<string, MomentumBar>();
  for (const item of items) {
    if (!sources.includes(item.source) || !/^https?:\/\//i.test(item.url)) continue;
    if (requireFresh && now - item.last_seen > FRESH_LISTING) continue;
    const value = item.signal ?? 0;
    const known = best.get(item.url);
    if (value > 0 && (!known || value > known.v)) {
      best.set(item.url, { n: item.title, u: item.url, v: value, d: (item.summary ?? "").slice(0, 110) });
    }
  }
  return [...best.values()].sort((a, b) => b.v - a.v).slice(0, BARS);
}

function headline(
  entities: { name: string; sources: number }[],
  topTopic: { label: string; pct: number } | null,
  topOrg: { label: string; count: number } | null,
): Pick<Story, "headline" | "deck"> {
  const top = entities[0];
  const topicLine = topTopic ? `${topTopic.label} có mặt trong ${topTopic.pct}% số mục của 7 ngày qua` : "";
  const orgLine = topOrg ? `${topOrg.label} được nhắc nhiều nhất với ${topOrg.count} tiêu đề` : "";

  if (top && top.sources >= 3) {
    return {
      headline: [{ text: top.name, em: true }, { text: " đang chiếm sóng, với " }, { text: `${top.sources} trang tin`, em: true }, { text: " cùng đưa tin trong 72 giờ." }],
      deck: [topicLine, orgLine].filter(Boolean).join(". ") + ".",
    };
  }
  if (topTopic) {
    return {
      headline: [{ text: topTopic.label, em: true }, { text: " là chủ đề lớn nhất tuần này, xuất hiện trong " }, { text: `${topTopic.pct}%`, em: true }, { text: " số mục." }],
      deck: orgLine ? `${orgLine}.` : "",
    };
  }
  return { headline: [{ text: "Toàn cảnh AI, cập nhật hai lần mỗi ngày." }], deck: "" };
}

export function buildStory(rows: Row[], items: DbItem[], entities: { name: string; sources: number }[], dataStart: number, now: number): Story {
  // Trending entries have no publication date, so they stay out of the timeline and get their own chart.
  const dated = rows.filter((r) => !r.live);
  const pulse: Story["pulse"] = dated.map((r) => [Math.round(r.t / 1000), indexes(r.topics, TOPIC_INDEX), indexes(r.orgs, ORG_INDEX), r.lane === "labs" ? 1 : 0]);

  const week = dated.filter((r) => now - r.t <= 7 * DAY);
  const topicCounts = TOPICS.map((t) => ({ label: t.label, count: week.filter((r) => r.topics.includes(t.key)).length })).sort((a, b) => b.count - a.count);
  // A lab's own blog says nothing about how much others talk about it.
  const outside = week.filter((r) => r.lane !== "labs");
  const orgCounts = ORGS.map((o) => ({ label: o.label, count: outside.filter((r) => r.orgs.includes(o.key)).length })).sort((a, b) => b.count - a.count);
  const topTopic = topicCounts[0]?.count && week.length ? { label: topicCounts[0].label, pct: Math.round((topicCounts[0].count / week.length) * 100) } : null;
  const topOrg = orgCounts[0]?.count ? orgCounts[0] : null;

  const debate: Story["debate"] = [];
  for (const r of rows) {
    const comments = r.source === "hn" ? /·\s*([\d,]+) bình luận/.exec(r.metric ?? "")?.[1] : undefined;
    const points = r.source === "hn" ? /▲\s*([\d,]+)/.exec(r.metric ?? "")?.[1] : undefined;
    if (comments === undefined || points === undefined || !r.discussUrl || !/^https?:\/\//i.test(r.discussUrl)) continue;
    debate.push({
      n: r.title.slice(0, 110), u: r.discussUrl, p: Number(points.replace(/,/g, "")), c: Number(comments.replace(/,/g, "")),
      t: Math.round(r.t / 1000), tp: indexes(r.topics, TOPIC_INDEX), o: indexes(r.orgs, ORG_INDEX),
    });
  }
  debate.sort((a, b) => b.c - a.c);

  return {
    dataStart,
    topics: TOPICS.map((t) => ({ key: t.key, label: t.label })),
    orgs: ORGS.map((o) => ({ key: o.key, label: o.label })),
    pulse,
    momentum: {
      today: bars(items, ["gh-trend-all", "gh-trend-py", "gh-trend-ts"], now, true),
      week: bars(items, ["gh-trend-week"], now, true),
      fresh: bars(items, ["gh-new"], now, true),
      hf: bars(items, ["hf-models"], now, true),
    },
    debate: debate.slice(0, MAX_DEBATE_POINTS),
    ...headline(entities, topTopic, topOrg),
  };
}
