import { describe, expect, it } from "vitest";
import { BANK_THEMES, BANKS, canonicalUrl, classify, decayed, entitiesIn, isAiRelated, orgsOf, sectorsOf, topicsOf } from "../src/rules";
import type { Source } from "../src/types";

const src = (over: Partial<Source>): Source => ({ id: "x", name: "X", lane: "news", tier: 2, kind: "rss", url: "https://x", ...over });

describe("isAiRelated", () => {
  it.each(["Claude Code ships hooks", "New LLM benchmark", "The AI bubble", "Running gguf files locally"])("keeps %s", (t) => expect(isAiRelated(t)).toBe(true));
  it.each(["Libghostty 1.0", "RealPage rent-pricing case", "Said to wait", "Rails 8 released", "Thai food in Hanoi"])("drops %s", (t) => expect(isAiRelated(t)).toBe(false));
});

describe("classify", () => {
  const lab = src({ name: "OpenAI", lane: "labs", tier: 1 });

  it("flags a lab release as must-see and explains why", () => {
    const c = classify({ title: "Introducing GPT-5.5", url: "https://x" }, lab);
    expect(c.reasons).toEqual(["OpenAI công bố"]);
    expect(c.topics).toContain("models");
  });

  it("does not promote lab marketing", () => {
    const c = classify({ title: "How Acme uses ChatGPT to launch faster", url: "https://x" }, lab);
    expect(c.reasons).toEqual([]);
  });

  it("promotes on signal only past the threshold", () => {
    const hn = src({ kind: "hn", aiFilter: true, lane: "community" });
    expect(classify({ title: "LLM thing", url: "https://x", signal: 299 }, hn).reasons).toEqual([]);
    expect(classify({ title: "LLM thing", url: "https://x", signal: 300 }, hn).reasons).toEqual(["300 điểm trên Hacker News"]);
  });

  it("does not promote a customer story or a weekly total at the daily threshold", () => {
    expect(classify({ title: "Cult.fit builds operational muscle with Codex", url: "https://x" }, lab).reasons).toEqual([]);
    const week = src({ id: "gh-trend-week", kind: "gh-trending", lane: "github" });
    expect(classify({ title: "a/b", url: "https://x", signal: 3000 }, week).reasons).toEqual([]);
    expect(classify({ title: "a/b", url: "https://x", signal: 4000 }, week).reasons).toEqual(["+4,000 sao trong tuần"]);
  });

  it("flags a named Gemini tier and drops HF re-uploads", () => {
    const deepmind = src({ name: "Google DeepMind", lane: "labs", tier: 1 });
    expect(classify({ title: "Gemini Omni 1.2 Flash: fast clips", url: "https://x" }, deepmind).reasons).toHaveLength(1);
    expect(classify({ title: "Bob/DeepSeek-V4-Uncensored-GGUF", url: "https://x" }, src({ kind: "hf-models", lane: "models" })).keep).toBe(false);
  });

  it("drops off-topic items from filtered feeds", () => {
    expect(classify({ title: "Postgres internals", url: "https://x" }, src({ aiFilter: true })).keep).toBe(false);
  });

  it("recognises major providers on OpenRouter only", () => {
    const or = src({ kind: "openrouter", lane: "models" });
    expect(classify({ title: "Anthropic: Claude Opus 5.5", url: "https://x" }, or).reasons).toEqual(["Model mới"]);
    expect(classify({ title: "SomeCo: Tiny Model", url: "https://x" }, or).reasons).toEqual([]);
  });
});

it("entitiesIn merges spellings of a versioned model", () => {
  expect(entitiesIn("gpt 5.5 vs GPT-5.5 and Kimi K3.1").map((e) => e.key).sort()).toEqual(["gpt 5.5", "kimi k3.1"]);
  expect(entitiesIn("Claude is nice")).toEqual([]);
});

it("topicsOf matches multiple topics", () => {
  expect(topicsOf("Open-source coding agent for local models")).toEqual(expect.arrayContaining(["agents", "coding", "open"]));
});

it("canonicalUrl removes tracking and host variants", () => {
  expect(canonicalUrl("http://www.a.com/x/?utm_source=hn&id=1#top")).toBe("https://a.com/x?id=1");
});

it("decayed halves after one half-life", () => {
  expect(decayed(40, 96 * 3_600_000, "labs")).toBeCloseTo(20);
});

it("orgsOf attributes products to their maker without matching lookalikes", () => {
  expect(orgsOf("Claude Code vs ChatGPT")).toEqual(["openai", "anthropic"]);
  expect(orgsOf("Writing metadata for meta tags")).toEqual([]);
});

describe("sectorsOf", () => {
  const plain = src({});
  it.each([
    ["JPMorgan Chase signs cybersecurity and coding deal with OpenAI", "banking"],
    ["BMO Turns to Agentic AI to Resolve Card Issues", "banking"],
    ["Ngân hàng đối mặt 4 thách thức khi ứng dụng AI", "banking"],
    ["Hospitals adopt AI scribes for patients", "health"],
    ["AI tutors reach students in rural schools", "education"],
  ])("classifies %s", (title, expected) => {
    expect(sectorsOf(title, plain)).toContain(expected);
  });

  it("ignores research and model listings", () => {
    expect(sectorsOf("Multi-Teacher Distillation for Hospitals", src({ lane: "papers" }))).toEqual([]);
  });

  it("requires AI in the headline for general trade press", () => {
    const press = src({ aiFilter: true, aiInTitle: true });
    expect(classify({ title: "Wells Fargo exec sees M&A attitude", summary: "AI came up too", url: "https://x" }, press).keep).toBe(false);
    expect(classify({ title: "Ngân hàng ứng dụng AI", url: "https://x" }, press).keep).toBe(true);
  });

  it("trusts a trade publication's own industry", () => {
    expect(sectorsOf("Some AI rollout", src({ sector: "health" }))).toEqual(["health"]);
  });

  it("does not read unrelated words as banking", () => {
    expect(sectorsOf("Riverbank model runs", plain)).toEqual([]);
    expect(sectorsOf("AI talent and the H-1B visa", plain)).toEqual([]);
  });
});

it("reads banking themes and bank names from titles", () => {
  const title = "JPMorgan Chase signs cybersecurity and coding deal with OpenAI";
  expect(BANK_THEMES.filter((x) => x.re.test(title)).map((x) => x.key)).toEqual(["cyber"]);
  expect(BANKS.filter((x) => x.re.test(title)).map((x) => x.label)).toEqual(["JPMorgan"]);
  expect(BANKS.filter((x) => x.re.test("VPBank và Techcombank ứng dụng AI")).map((x) => x.label)).toEqual(["Techcombank", "VPBank"]);
});

it("recognises Vietnamese AI wording", () => {
  expect(isAiRelated("Ứng dụng trí tuệ nhân tạo tại ngân hàng")).toBe(true);
});
