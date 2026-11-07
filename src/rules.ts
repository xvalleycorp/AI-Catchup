/**
 * The whole "intelligence" of the app, as plain rules. No AI involved.
 * To change what is surfaced, edit the regexes and thresholds in this file.
 */
import type { Lane, RawItem, Source } from "./types";

// ── 1. Relevance: general-purpose feeds must match to be kept ────────────────
const AI_CASED = /\bAI\b|\bA\.I\.|\bAGI\b|\bLLMs?\b|\bMCP\b|\bRAG\b|\bNLP\b|\bGPUs?\b.*\b(model|train|inference)/;
const AI_ANYCASE = new RegExp(
  [
    "\\bai[- ](agent|model|assistant|powered|coding|native|safety|search|tool)",
    "\\bllm", "chatgpt", "\\bgpt-?\\d", "openai", "anthropic", "\\bclaude\\b", "gemini", "gemma", "deepmind",
    "\\bllama\\b", "llama\\.cpp", "ollama", "mistral", "deepseek", "\\bqwen\\b", "\\bkimi\\b", "\\bgrok\\b", "hugging ?face",
    "copilot", "machine learning", "deep learning", "neural net", "large language", "language model",
    "stable diffusion", "diffusion model", "agentic", "multi-agent", "coding agent", "\\bagents?\\b.*\\b(llm|model|tool)",
    "vibe coding", "prompt (engineering|injection)", "fine-?tun", "\\bgguf\\b", "embeddings?\\b", "vector (db|database|search)",
    "inference (engine|server)", "reinforcement learning", "\\bpytorch\\b", "\\btransformers?\\b.*\\b(model|attention)",
    "text-to-(speech|image|video)", "speech-to-text", "world model", "\\bvllm\\b", "langchain", "langgraph", "claude code",
  ].join("|"),
  "i",
);

export function isAiRelated(text: string): boolean {
  return AI_CASED.test(text) || AI_ANYCASE.test(text);
}

// ── 2. Topics: power the trend panel and the topic filter ────────────────────
export const TOPICS: { key: string; label: string; re: RegExp }[] = [
  { key: "models", label: "Model mới", re: /\b(gpt-?\d|claude|gemini|gemma|llama|qwen|deepseek|mistral|kimi|grok|glm|minimax|muse|frontier model|new model|open[- ]weights?)\b/i },
  { key: "agents", label: "Agent", re: /\bagents?\b|\bagentic\b|multi-agent|autonomous/i },
  { key: "coding", label: "AI coding", re: /coding (agent|assistant|tool)|claude code|\bcodex\b|copilot|\bcursor\b|vibe coding|gemini cli|code review|\bIDE\b/i },
  { key: "mcp", label: "MCP & giao thức", re: /\bMCP\b|model context protocol|\bA2A\b|agent skills?/ },
  { key: "open", label: "Open source & local", re: /open[- ]source|open[- ]weights?|\blocal(ly)?\b|on-device|self-host|gguf|ollama|llama\.cpp/i },
  { key: "infra", label: "Hạ tầng & chip", re: /\bGPUs?\b|\bTPUs?\b|nvidia|datacenter|data center|inference|quantiz|compute|\bchips?\b|\bvllm\b/i },
  { key: "rag", label: "RAG & memory", re: /\bRAG\b|retrieval|vector (db|database|search)|embeddings?|context (engineering|compression)|\bmemory\b/i },
  { key: "media", label: "Ảnh, video, giọng nói", re: /text-to-(speech|image|video)|speech|voice|\bvideo\b|image generation|\bsora\b|\bveo\b|multimodal|\baudio\b/i },
  { key: "robotics", label: "Robotics", re: /robot|humanoid|world model|embodied/i },
  { key: "safety", label: "An toàn & chính sách", re: /\bsafety\b|alignment|regulat|\bpolicy\b|\blaw(suit)?\b|copyright|\bAI Act\b|jailbreak|prompt injection|vulnerabilit|misuse|interpretability/i },
  { key: "business", label: "Kinh doanh", re: /funding|raises?\b|valuation|\bIPO\b|\bS-1\b|acqui(re|sition)|revenue|layoff|\bdeal\b|partnership/i },
];

export function topicsOf(text: string): string[] {
  return TOPICS.filter((t) => t.re.test(text)).map((t) => t.key);
}

// ── 3. Importance ────────────────────────────────────────────────────────────
const RELEASE = /\b(introduc\w*|announc\w*|launch\w*|releas\w*|unveil\w*|now available|general availability|open[- ]sourc\w*|open[- ]weights?|new model|to acquire|acquires?)\b/i;
const VERSIONED_MODEL = /\b(GPT|Claude(?: (?:Opus|Sonnet|Haiku|Fable))?|Gemini(?: [A-Z][a-z]+)?|Gemma|Llama|Qwen|DeepSeek(?:[- ][VR])?|Mistral(?: \w+)?|Kimi(?:[- ]K)?|Grok|Sora|Veo|GLM|MiniMax(?:[- ]M)?|Muse(?: \w+)?|Nemotron|Phi)[- ]?(\d+(?:\.\d+)*)\b/gi;
const NOISE = /customer stor|case study|webinar|\bhow .{2,40} uses?\b|scholarship|\bhiring\b|\bcareers?\b|\bpodcast\b|\bsponsor|\bsummit\b|\bevent\b|\bAI (fellowship|residency)\b|partner(s|ing)? with|expanding (our )?partnership|\bbuilds? .{2,50} with (codex|chatgpt|claude|gemini)\b|(universities|graduates|students)\b/i;
/** Community re-uploads of someone else's weights crowd out the original on HF trending. */
const HF_REUPLOAD = /uncensored|abliterated|heretic|-GGUF\b|-GSQ\b|-MLX\b|\d+bit\b/i;
const MAJOR_MODEL_PROVIDER = /^(OpenAI|Anthropic|Google|Meta|Mistral|DeepSeek|Qwen|Alibaba|xAI|Moonshot|MoonshotAI|Z\.?ai|MiniMax|NVIDIA|Microsoft|Amazon)\b/i;

/** Signal level at which an item becomes "must-see" on its own. */
export const MUST_THRESHOLD: Partial<Record<Source["kind"], { min: number; label: (n: number) => string }>> = {
  hn: { min: 300, label: (n) => `HN ${n} điểm` },
  lobsters: { min: 40, label: (n) => `Lobsters ${n} điểm` },
  "gh-trending": { min: 800, label: (n) => `+${n.toLocaleString("en-US")} sao` },
  "gh-search": { min: 3000, label: (n) => `Repo mới ${n.toLocaleString("en-US")} sao` },
  "hf-models": { min: 300, label: (n) => `HF trending ${n}` },
  "hf-papers": { min: 50, label: (n) => `Paper ${n} upvote` },
};

const TIER_BASE: Record<Source["tier"], number> = { 1: 50, 2: 28, 3: 18 };

/** A weekly total is not comparable with a daily one. */
const WEEKLY_THRESHOLD_FACTOR = 5;

/** Keeps any one channel from filling the must-see list, however large its numbers are. */
export const MUST_LANE_CAP: Record<Lane, number> = { labs: 4, github: 2, models: 2, community: 2, papers: 1, news: 2, tools: 1 };

/** Prolific sources (OpenAI publishes daily) must not bury the others in their column. */
export const LANE_SOURCE_CAP: Partial<Record<Lane, number>> = { labs: 6, news: 6, community: 18 };

/** Hours for a score to halve, by lane. */
export const HALF_LIFE_H: Record<Lane, number> = { labs: 96, github: 48, models: 72, papers: 48, community: 36, news: 36, tools: 96 };

export interface Classified {
  keep: boolean;
  topics: string[];
  baseScore: number;
  reasons: string[];
}

export function classify(item: RawItem, source: Source): Classified {
  const text = `${item.title} ${item.summary ?? ""}`;
  const drop = { keep: false, topics: [], baseScore: 0, reasons: [] };
  if (source.aiFilter && !isAiRelated(text)) return drop;
  if (source.kind === "hf-models" && HF_REUPLOAD.test(item.title)) return drop;

  const noisy = NOISE.test(item.title);
  const release = RELEASE.test(item.title);
  VERSIONED_MODEL.lastIndex = 0;
  const hasModel = VERSIONED_MODEL.test(item.title);
  const signal = item.signal ?? 0;

  let score = TIER_BASE[source.tier] + Math.min(35, 9 * Math.log10(1 + signal));
  if (release) score += 10;
  if (hasModel) score += 6;
  if (noisy) score -= 15;

  const reasons: string[] = [];
  const threshold = MUST_THRESHOLD[source.kind];
  const minSignal = threshold ? threshold.min * (source.id === "gh-trend-week" ? WEEKLY_THRESHOLD_FACTOR : 1) : 0;
  if (threshold && signal >= minSignal) reasons.push(`${threshold.label(signal)}${source.id === "gh-trend-week" ? " trong tuần" : ""}`);
  if (source.lane === "labs" && source.tier === 1 && !noisy && (release || hasModel)) reasons.push(`Công bố từ ${source.name}`);
  if (source.kind === "openrouter" && MAJOR_MODEL_PROVIDER.test(item.title)) reasons.push("Model mới từ lab lớn");

  return { keep: true, topics: topicsOf(text), baseScore: Math.round(score * 10) / 10, reasons };
}

/** Named, versioned models in a title, e.g. "GPT-5.5" and "Kimi K3.1". */
export function entitiesIn(title: string): { key: string; name: string }[] {
  const found = new Map<string, string>();
  for (const m of title.matchAll(VERSIONED_MODEL)) {
    const family = m[1]!.replace(/[- ]+$/, "");
    // "Kimi K" + "3.1" joins directly; "GPT" takes a hyphen; the rest take a space.
    const joined = /[- ][KMVR]$/i.test(family);
    const name = /^(GPT|GLM)$/i.test(family) ? `${family.toUpperCase()}-${m[2]}` : `${family}${joined ? "" : " "}${m[2]}`;
    found.set(name.toLowerCase().replace(/[- ]+/g, " "), name);
  }
  return [...found].map(([key, name]) => ({ key, name }));
}

export function decayed(base: number, ageMs: number, lane: Lane): number {
  const hours = Math.max(0, ageMs) / 3_600_000;
  return base * 0.5 ** (hours / HALF_LIFE_H[lane]);
}

// ── 4. Identity: one story, whichever site links to it ───────────────────────
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.replace(/^(www|m|old)\./, "");
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|ref_|source$|via$|fbclid|gclid|mc_)/i.test(key)) u.searchParams.delete(key);
    }
    u.protocol = "https:";
    u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Non-cryptographic 53-bit hash (cyrb53): only used as a compact dedupe key. */
export function hashKey(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
