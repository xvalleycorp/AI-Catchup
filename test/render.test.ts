import { expect, it } from "vitest";
import { buildSnapshot } from "../src/snapshot";
import { renderPage, safeUrl } from "../src/render";

const NOW = Date.UTC(2026, 10, 7);
const item = (over: Record<string, unknown>) => ({
  id: "i", source: "hn", url_key: "k", title: "T", url: "https://a.com", summary: null, published_at: NOW - 3_600_000, first_seen: NOW - 3_600_000,
  last_seen: NOW - 3_600_000, metric: null, discuss_url: null, topics: "[]", base_score: 30, reasons: "[]", ...over,
});
const build = (items: ReturnType<typeof item>[]) => buildSnapshot(items as never, [], NOW, NOW);

it("merges one URL across sources and keeps both reasons", () => {
  const s = build([
    item({ id: "a", source: "openai", reasons: '["Công bố từ OpenAI"]', base_score: 50 }),
    item({ id: "b", source: "hn", reasons: '["HN 400 điểm"]', discuss_url: "https://news.ycombinator.com/item?id=1" }),
  ]);
  expect(s.must).toHaveLength(1);
  expect(s.must[0]?.also).toEqual(["Hacker News"]);
  expect(s.must[0]?.reasons).toEqual(["Công bố từ OpenAI", "HN 400 điểm"]);
  expect(s.must[0]?.discussUrl).toContain("ycombinator");
});

it("merges an identical title published under two URLs", () => {
  const s = build([
    item({ id: "a", url_key: "1", source: "deepmind", title: "Gemini Omni 1.2: fast!" }),
    item({ id: "b", url_key: "2", source: "google-ai", title: "Gemini Omni 1.2 — fast" }),
  ]);
  expect(s.lanes.labs).toHaveLength(1);
  expect(s.lanes.labs[0]?.also).toHaveLength(1);
});

it("flags a model named by three separate sources", () => {
  const s = build([
    item({ id: "a", url_key: "1", source: "hn", title: "GPT-6 is out", base_score: 40 }),
    item({ id: "b", url_key: "2", source: "verge", title: "OpenAI ships GPT-6" }),
    item({ id: "c", url_key: "3", source: "decoder", title: "A look at gpt 6" }),
  ]);
  expect(s.entities[0]).toMatchObject({ sources: 3 });
  expect(s.must[0]?.reasons[0]).toMatch(/3 nguồn cùng nhắc/);
});

it("caps must-see per lane", () => {
  const items = Array.from({ length: 6 }, (_, i) => item({ id: `h${i}`, url_key: `k${i}`, title: `Story ${i}`, reasons: '["x"]' }));
  expect(build(items).must).toHaveLength(2);
});

it("caps a prolific source within its lane", () => {
  const items = Array.from({ length: 9 }, (_, i) => item({ id: `o${i}`, url_key: `k${i}`, title: `Story ${i}`, source: "openai" }));
  expect(build(items).lanes.labs).toHaveLength(6);
});

it("escapes feed content and neutralises unsafe URLs", () => {
  const s = build([item({ title: `<img src=x onerror="alert(1)">`, url: "javascript:alert(1)", reasons: '["<b>"]' })]);
  const html = renderPage(s, NOW);
  expect(html).not.toContain("<img src=x");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<b>\"");
  expect(safeUrl("data:text/html,x")).toBe("#");
});
