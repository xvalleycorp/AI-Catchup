import { expect, it } from "vitest";
import { buildSnapshot } from "../src/snapshot";
import { nextScanLabel, renderPage, safeUrl } from "../src/render";

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
  expect(s.must[0]?.reasons[0]).toMatch(/3 trang tin cùng nhắc/);
});

it("gives one model launch a single must-see slot", () => {
  const s = build([
    item({ id: "a", url_key: "1", source: "deepmind", title: "Gemini Omni 1.2 Flash: fast clips", base_score: 60, reasons: '["lab"]' }),
    item({ id: "b", url_key: "2", source: "hn", title: "Gemini Omni 1.2 Flash", reasons: '["HN"]' }),
  ]);
  expect(s.must).toHaveLength(1);
  expect(s.must[0]?.reasons).toEqual(["lab", "HN"]);
});

it("caps must-see per lane", () => {
  const items = Array.from({ length: 6 }, (_, i) => item({ id: `h${i}`, url_key: `k${i}`, title: `Story ${i}`, reasons: '["x"]' }));
  expect(build(items).must).toHaveLength(2);
  expect(build(items.map((i) => ({ ...i, source: "hf-papers" }))).must).toHaveLength(0);
});

it("caps a prolific source within its lane", () => {
  const items = Array.from({ length: 9 }, (_, i) => item({ id: `o${i}`, url_key: `k${i}`, title: `Story ${i}`, source: "openai" }));
  expect(build(items).lanes.labs).toHaveLength(6);
});

it("builds the headline from data and keeps live items out of the timeline", () => {
  const s = build([
    item({ id: "a", url_key: "1", source: "hn", title: "GPT-6 is out", topics: '["models"]' }),
    item({ id: "b", url_key: "2", source: "verge", title: "OpenAI ships GPT-6", topics: '["models"]' }),
    item({ id: "c", url_key: "3", source: "decoder", title: "A look at gpt 6" }),
    item({ id: "d", url_key: "4", source: "gh-trend-all", title: "acme/llm", url: "https://github.com/acme/llm", signal: 900 }),
  ]);
  expect(s.story?.headline.map((h) => h.text).join("")).toContain("3 trang tin");
  expect(s.story?.pulse).toHaveLength(3);
  expect(s.story?.momentum.today[0]).toMatchObject({ n: "acme/llm", v: 900 });
  // Every counted story can be listed: title, link and publisher travel with it.
  const first = s.story!.pulse[0]!;
  expect(first[5]).toBe("GPT-6 is out");
  expect(first[6]).toBe("https://a.com");
  expect(s.story!.sources[first[7]]).toBe("Hacker News");
});

it("reads points and comments for the debate chart", () => {
  const s = build([item({ metric: "▲ 261 · 521 bình luận", discuss_url: "https://news.ycombinator.com/item?id=1", title: "IPO" })]);
  expect(s.story?.debate[0]).toMatchObject({ p: 261, c: 521 });
});

it("does not let feed text close the embedded data block", () => {
  const s = build([item({ title: "</script><script>alert(1)</script>", metric: "▲ 9 · 9 bình luận", discuss_url: "https://news.ycombinator.com/item?id=1" })]);
  expect(renderPage(s, NOW)).not.toContain("</script><script>alert");
});

it("next scan label follows the Vietnam schedule", () => {
  expect(nextScanLabel(Date.UTC(2026, 10, 7, 0))).toBe("8:00"); // 07:00 VN
  expect(nextScanLabel(Date.UTC(2026, 10, 7, 5))).toBe("16:00"); // 12:00 VN
  expect(nextScanLabel(Date.UTC(2026, 10, 7, 12))).toBe("8:00 sáng mai"); // 19:00 VN
});

it("shows readers nothing about how the page is produced", () => {
  const s = build([item({ title: "A story", source: "hf-papers" })]);
  const html = renderPage(s, NOW).replace(/<script type="application\/json".*?<\/script>/s, "");
  for (const internal of ["github.com/xvalleycorp", "rule", "api/snapshot", "nguồn đều", "quét", "HF "]) expect(html).not.toContain(internal);
});

it("gathers banking stories from every channel", () => {
  const s = build([
    item({ id: "a", url_key: "1", source: "finextra", title: "Bank A rolls out agents", sectors: '["banking"]' }),
    item({ id: "b", url_key: "2", source: "hn", title: "JPMorgan and OpenAI", sectors: '["banking"]' }),
    item({ id: "c", url_key: "3", source: "healthcare-dive", title: "Hospital AI", sectors: '["health"]' }),
  ]);
  expect(s.banking?.map((x) => x.source).sort()).toEqual(["finextra", "hn"]);
  expect(s.story?.banking.rows).toHaveLength(2);
  expect(s.lanes.industry.map((x) => x.source)).toContain("healthcare-dive");
  expect(renderPage(s, NOW)).toContain("AI trong ngân hàng");
});

it("keeps stories with no industry out of the other-industries list", () => {
  const s = build([item({ id: "a", url_key: "1", source: "pymnts", title: "Tech giants ration AI" })]);
  const list = renderPage(s, NOW).split("Ứng dụng ở các ngành khác")[1]!.split("</section>")[0]!;
  expect(list).not.toContain("Tech giants ration AI");
});

it("keeps unsafe links out of the lists behind the charts", () => {
  const s = build([item({ url: "javascript:alert(1)", title: "Bad" }), item({ id: "b", url_key: "2", title: "Good" })]);
  expect(s.story!.pulse.map((p) => p[5])).toEqual(["Good"]);
});

it("offers both looks over one set of panes", () => {
  const html = renderPage(build([item({})]), NOW);
  for (const id of ['id="pane-1"', 'id="pane-2"', 'id="pane-3"', 'id="skin-toggle"', 'id="cmd-form"', 'data-center-tab="all"']) expect(html).toContain(id);
});

it("counts down to model shutdowns with a text label, not colour alone", () => {
  const s = build([item({ id: "a", source: "sec-pip", title: "vLLM: RCE", metric: "CAO · CVSS 8.1 · bản vá 0.32.0", summary: "vllm" })]);
  s.lifecycle = [
    { provider: "Anthropic", model: "claude-sonnet-4-5", retiresAt: NOW + 10 * 86_400_000, replacement: "claude-sonnet-5-5", url: "https://platform.claude.com/x" },
    { provider: "OpenAI", model: "gpt-4o", retiresAt: NOW - 2 * 86_400_000, replacement: "", url: "https://developers.openai.com/x" },
  ];
  const html = renderPage(s, NOW);
  expect(html).toContain("Còn 10 ngày");
  expect(html).toContain("Đã ngừng");
  expect(html).toContain('class="sev sev-high">CAO');
  expect(html).toContain("1 lỗ hổng mức cao trở lên");
});

it("never shows a failed vulnerability fetch as an all-clear", () => {
  const s = build([item({})]);
  s.health = [{ id: "sec-pip", name: "GitHub Advisory", ok: false, lastOk: 0, err: "HTTP 403", count: 0 }];
  const html = renderPage(s, NOW);
  expect(html).toContain("chưa cập nhật được dữ liệu lỗ hổng");
  expect(html).not.toContain("Không có lỗ hổng mới");
});

it("lists the most severe vulnerability first", () => {
  const s = build([
    item({ id: "a", url_key: "1", source: "sec-pip", title: "Low one", metric: "THẤP · CVSS 3.4", published_at: NOW - 1000 }),
    item({ id: "b", url_key: "2", source: "sec-pip", title: "Critical one", metric: "NGHIÊM TRỌNG · CVSS 9.8", published_at: NOW - 5000 }),
  ]);
  const html = renderPage(s, NOW);
  expect(html.indexOf("Critical one")).toBeLessThan(html.indexOf("Low one"));
});

it("escapes feed content and neutralises unsafe URLs", () => {
  const s = build([item({ title: `<img src=x onerror="alert(1)">`, url: "javascript:alert(1)", reasons: '["<b>"]' })]);
  const html = renderPage(s, NOW);
  expect(html).not.toContain("<img src=x");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<b>\"");
  expect(safeUrl("data:text/html,x")).toBe("#");
});
