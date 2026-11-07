import { describe, expect, it } from "vitest";
import { cleanText, parseAnthropic, parseFeed, parseHn, parseMeta, parseOpenRouter, parseReleases, parseTrending } from "../src/parsers";

describe("parseFeed", () => {
  it("reads RSS with CDATA and entities", () => {
    const xml = `<rss><channel><title>Feed</title><item><title><![CDATA[Hello &amp; <b>world</b>]]></title><link>https://a.com/x?a=1&amp;b=2</link><description>&lt;p&gt;Body&lt;/p&gt;</description><pubDate>Fri, 06 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseFeed(xml)).toEqual([{ title: "Hello & world", url: "https://a.com/x?a=1&b=2", summary: "Body", publishedAt: Date.UTC(2026, 10, 6, 8) }]);
  });

  it("reads Atom and prefers the alternate link", () => {
    const xml = `<feed><title>F</title><entry><title type="text">T</title><link rel="self" href="https://a.com/self"/><link rel="alternate" href="https://a.com/post"/><published>2026-11-05T00:00:00Z</published><updated>2026-11-06T00:00:00Z</updated></entry></feed>`;
    const [item] = parseFeed(xml);
    expect(item?.url).toBe("https://a.com/post");
    expect(item?.publishedAt).toBe(Date.UTC(2026, 10, 5));
  });

  it("drops a truncated trailing entry", () => {
    const xml = `<rss><item><title>A</title><link>https://a.com/a</link></item><item><title>B</title><link>https://a.com`;
    expect(parseFeed(xml).map((i) => i.title)).toEqual(["A"]);
  });
});

describe("HTML sources", () => {
  it("parses GitHub trending rows", () => {
    const html = `<article class="Box-row"><h2 class="h3 lh-condensed">\n<a data-x="{}" href="/acme/llm-kit" class="Link">acme / llm-kit</a></h2><p class="col-9 color-fg-muted my-1 tmp-my-1 pr-4 tmp-pr-4">\n An LLM toolkit &amp; more\n</p><span itemprop="programmingLanguage">Rust</span> 1,306 stars today</article>`;
    expect(parseTrending(html)[0]).toMatchObject({ title: "acme/llm-kit", url: "https://github.com/acme/llm-kit", summary: "An LLM toolkit & more", signal: 1306 });
  });

  it("parses Anthropic tiles and pairs each with its own date", () => {
    const html = `<article><a href="/news/announcements">Announcements</a><time>Oct 26, 2026</time></header><a class="t" href="/news/s1-sec"><h3 class="x">Files S-1</h3><p>Summary</p></a></article>
      <a href="/news/old"><h3>Old</h3></a><script>{\\"publishedOn\\":\\"2026-10-27\\",\\"sensitive\\":false,\\"slug\\":{\\"_type\\":\\"slug\\",\\"current\\":\\"old\\"}}</script>`;
    const items = parseAnthropic(html, "https://www.anthropic.com/news");
    expect(items[0]).toEqual({ title: "Files S-1", url: "https://www.anthropic.com/news/s1-sec", summary: "Summary", publishedAt: Date.parse("Oct 26, 2026") });
    expect(items[1]?.publishedAt).toBe(Date.UTC(2026, 9, 27));
  });

  it("reads Engineering posts from research links", () => {
    const html = `<a href="/engineering">Engineering</a><a href="/research/foo"><h2>Foo post</h2></a><a href="/news/bar"><h3>Bar</h3></a>`;
    expect(parseAnthropic(html, "https://www.anthropic.com/engineering").map((i) => i.title)).toEqual(["Foo post"]);
  });

  it("parses Meta links and ignores short labels", () => {
    const html = `<a href="https://ai.meta.com/blog/foo/"> FEATURED </a><a href="https://ai.meta.com/blog/foo/">Introducing Muse Spark</a>`;
    expect(parseMeta(html)).toEqual([{ title: "Introducing Muse Spark", url: "https://ai.meta.com/blog/foo/" }]);
  });
});

describe("JSON sources", () => {
  it("falls back to the HN discussion for text posts", () => {
    const [item] = parseHn(JSON.stringify({ hits: [{ title: "Ask HN", url: null, objectID: "1", points: 10, num_comments: 2, created_at_i: 100 }] }));
    expect(item?.url).toBe("https://news.ycombinator.com/item?id=1");
  });

  it("sorts OpenRouter newest first and skips free aliases", () => {
    const items = parseOpenRouter(JSON.stringify({ data: [
      { id: "a/old", name: "Old", created: 1 },
      { id: "a/x:free", name: "Free", created: 5 },
      { id: "a/new", name: "New", created: 3, context_length: 200000, pricing: { prompt: "0.000001", completion: "0.000005" } },
    ] }));
    expect(items.map((i) => i.title)).toEqual(["New", "Old"]);
    expect(items[0]?.metric).toBe("200K ctx · $1/$5 /1M");
  });

  it("recovers whole models from a truncated OpenRouter body", () => {
    const body = `{"data":[{"id":"a/one","name":"One","created":2},{"id":"a/two","name":"Two","created":1},{"id":"a/thr`;
    expect(parseOpenRouter(body).map((i) => i.title)).toEqual(["One", "Two"]);
  });
});

describe("parseReleases", () => {
  it("skips prereleases", () => {
    const xml = `<feed><entry><title>v2.0.0-rc1</title><link href="https://g.com/rc"/><updated>2026-11-02T00:00:00Z</updated></entry><entry><title>v1.9.0</title><link href="https://g.com/1"/><updated>2026-11-01T00:00:00Z</updated></entry></feed>`;
    expect(parseReleases(xml, "Tool")[0]?.title).toBe("Tool v1.9.0");
  });
});

it("cleanText strips double-encoded markup and truncates", () => {
  expect(cleanText("&lt;p&gt;a &amp;amp; b&lt;/p&gt;")).toBe("a & b");
  expect(cleanText("abcdef", 4)).toBe("abc…");
});
