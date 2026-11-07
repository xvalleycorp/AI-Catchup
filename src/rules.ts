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
    "trí tuệ nhân tạo", "vibe coding", "prompt (engineering|injection)", "fine-?tun", "\\bgguf\\b", "embeddings?\\b", "vector (db|database|search)",
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

/** Who a headline is about. Matched on titles only: summaries mention rivals in passing. */
export const ORGS: { key: string; label: string; re: RegExp }[] = [
  { key: "openai", label: "OpenAI", re: /\bOpenAI\b|ChatGPT|\bGPT[- ]?\d|\bCodex\b|\bSora\b/i },
  { key: "anthropic", label: "Anthropic", re: /\bAnthropic\b|\bClaude\b/i },
  { key: "google", label: "Google", re: /\bGoogle\b|DeepMind|\bGemini\b|\bGemma\b|\bVeo\b/i },
  { key: "meta", label: "Meta", re: /\bMeta\b|\bLlama\b|\bMuse (Spark|Image|Video)\b/ },
  { key: "microsoft", label: "Microsoft", re: /\bMicrosoft\b|\bCopilot\b/i },
  { key: "nvidia", label: "NVIDIA", re: /\bNVIDIA\b|\bNemotron\b|\bJensen\b/i },
  { key: "xai", label: "xAI", re: /\bxAI\b|\bGrok\b/ },
  { key: "mistral", label: "Mistral", re: /\bMistral\b|\bLe Chonk\b/i },
  { key: "deepseek", label: "DeepSeek", re: /\bDeepSeek\b/i },
  { key: "qwen", label: "Qwen", re: /\bQwen\b|\bAlibaba\b/i },
  { key: "moonshot", label: "Moonshot", re: /\bMoonshot\w*\b|\bKimi\b/i },
  { key: "hf", label: "Hugging Face", re: /Hugging ?Face/i },
];

export function orgsOf(title: string): string[] {
  return ORGS.filter((o) => o.re.test(title)).map((o) => o.key);
}

/** Industries AI is being applied in. Matched on titles; trade publications also set Source.sector. */
export const SECTORS: { key: string; label: string; re: RegExp }[] = [
  { key: "banking", label: "Ngân hàng & tài chính", re: /\bbank(s|ing|ers?)?\b|ngân hàng|fintech|\bfinancial\b|\bcredit (card|union|scor\w+)\b|\bpayments?\b|thanh toán|\binsur(er|ers|ance|tech)\b|bảo hiểm|\banti-money|\bAML\b|\bKYC\b|\bwealth (management|manager|tech)\b|\bpersonal finance\b|\bunderwriting\b|JPMorgan|JP Morgan|Goldman Sachs|Morgan Stanley|Wells Fargo|Citigroup|\bHSBC\b|\bMastercard\b/i },
  { key: "health", label: "Y tế", re: /health ?care|\bhospitals?\b|\bclinical\b|\bpatients?\b|\bdoctors?\b|\bmedical\b|drug discovery|\bpharma\w*|y tế|bệnh viện/i },
  { key: "education", label: "Giáo dục", re: /\beducation\b|\bschools?\b|\buniversit(y|ies)\b|\bstudents?\b|\bteachers?\b|\bclassrooms?\b|giáo dục|sinh viên/i },
  { key: "retail", label: "Bán lẻ & thương mại", re: /\bretail\w*|e-?commerce|agentic commerce|\bshopping\b|\bshoppers?\b|bán lẻ|thương mại điện tử/i },
  { key: "manufacturing", label: "Sản xuất", re: /\bmanufactur\w+|\bfactor(y|ies)\b|\bindustrial\b|sản xuất/i },
  { key: "energy", label: "Năng lượng", re: /\butilit(y|ies)\b|power grid|\bthe grid\b|\benergy (sector|industry|company|companies)\b|\boil and gas\b|năng lượng/i },
  { key: "logistics", label: "Logistics", re: /\blogistics\b|supply chain|\bfreight\b|\bwarehouses?\b|chuỗi cung ứng/i },
  { key: "legal", label: "Pháp lý", re: /\blegal (AI|tech|industry|teams?|services)\b|\blaw firms?\b|\blawyers?\b|\battorneys?\b|luật sư/i },
  { key: "government", label: "Chính phủ & công", re: /\bgovernment (agenc\w+|services?|partners?|employees)\b|\bpublic sector\b|\bfederal agenc\w+|\bGovCloud\b|\bGSA\b|chính phủ/i },
];

export function sectorsOf(title: string, source: Source): string[] {
  // Papers, model cards and repos describe research and tools, not adoption by an industry.
  if (source.lane === "papers" || source.lane === "models" || source.lane === "github") return [];
  return SECTORS
    .filter((s) => s.re.test(title) || s.key === source.sector || (s.key === "banking" && BANKS.some((b) => b.re.test(title))))
    .map((s) => s.key);
}

/** What banks use AI for. */
export const BANK_THEMES: { key: string; label: string; re: RegExp }[] = [
  { key: "agents", label: "Agent AI", re: /\bagent(s|ic)?\b/i },
  { key: "fraud", label: "Chống gian lận", re: /fraud|\bscams?\b|gian lận|lừa đảo|money.laundering|\bAML\b|\bKYC\b|deepfake/i },
  { key: "cyber", label: "An ninh mạng", re: /cyber|security|vulnerab|\bhack|an ninh mạng|bảo mật/i },
  { key: "credit", label: "Tín dụng & rủi ro", re: /\bcredit\b|\bloans?\b|\blending\b|underwriting|\brisk\b|tín dụng|rủi ro/i },
  { key: "payments", label: "Thanh toán", re: /payment|\bcommerce\b|\bcards?\b|thanh toán/i },
  { key: "service", label: "Dịch vụ khách hàng", re: /customer|chatbot|assistant|personal finance|khách hàng|trợ lý/i },
  { key: "wealth", label: "Đầu tư & tài sản", re: /wealth|invest(ing|ment|or)|trading|đầu tư/i },
  { key: "compliance", label: "Quy định & giám sát", re: /regulat|complian|supervis|sound practices|\bFSB\b|\bcentral bank|quy định|giám sát|tuân thủ/i },
];

export const BANKS: { label: string; re: RegExp }[] = [
  { label: "JPMorgan", re: /JP ?Morgan/i }, { label: "Goldman Sachs", re: /Goldman/i }, { label: "Morgan Stanley", re: /Morgan Stanley/i },
  { label: "Bank of America", re: /Bank of America|\bBofA\b/i }, { label: "Citi", re: /\bCiti(group|bank)?\b/ }, { label: "Wells Fargo", re: /Wells Fargo/i },
  { label: "HSBC", re: /\bHSBC\b/ }, { label: "BMO", re: /\bBMO\b/ }, { label: "Barclays", re: /Barclays/i }, { label: "Revolut", re: /Revolut/i },
  { label: "Standard Chartered", re: /Standard Chartered/i }, { label: "Commonwealth Bank", re: /Commonwealth Bank|\bCBA\b/ },
  { label: "Vietcombank", re: /Vietcombank/i }, { label: "BIDV", re: /\bBIDV\b/ }, { label: "VietinBank", re: /VietinBank/i },
  { label: "Techcombank", re: /Techcombank/i }, { label: "VPBank", re: /VPBank/i }, { label: "MB", re: /\bMB ?Bank\b/i },
  { label: "ACB", re: /\bACB\b/ }, { label: "TPBank", re: /TPBank/i }, { label: "HDBank", re: /HDBank/i },
];

// ── 3. Importance ────────────────────────────────────────────────────────────
const RELEASE = /\b(introduc\w*|announc\w*|launch\w*|releas\w*|unveil\w*|now available|general availability|open[- ]sourc\w*|open[- ]weights?|new model|to acquire|acquires?)\b/i;
const VERSIONED_MODEL = /\b(GPT|Claude(?: (?:Opus|Sonnet|Haiku|Fable))?|Gemini(?: [A-Z][a-z]+)?|Gemma|Llama|Qwen|DeepSeek(?:[- ][VR])?|Mistral(?: \w+)?|Kimi(?:[- ]K)?|Grok|Sora|Veo|GLM|MiniMax(?:[- ]M)?|Muse(?: \w+)?|Nemotron|Phi)[- ]?(\d+(?:\.\d+)*)\b/gi;
const NOISE = /customer stor|case study|webinar|\bhow .{2,40} uses?\b|scholarship|\bhiring\b|\bcareers?\b|\bpodcast\b|\bsponsor|\bsummit\b|\bevent\b|\bAI (fellowship|residency)\b|partner(s|ing)? with|expanding (our )?partnership|\bbuilds? .{2,50} with (codex|chatgpt|claude|gemini)\b|(universities|graduates|students)\b/i;
/** Community re-uploads of someone else's weights crowd out the original on HF trending. */
const HF_REUPLOAD = /uncensored|abliterated|heretic|-GGUF\b|-GSQ\b|-MLX\b|\d+bit\b/i;
const MAJOR_MODEL_PROVIDER = /^(OpenAI|Anthropic|Google|Meta|Mistral|DeepSeek|Qwen|Alibaba|xAI|Moonshot|MoonshotAI|Z\.?ai|MiniMax|NVIDIA|Microsoft|Amazon)\b/i;

/** Signal level at which an item becomes "must-see" on its own. */
export const MUST_THRESHOLD: Partial<Record<Source["kind"], { min: number; label: (n: number) => string }>> = {
  hn: { min: 300, label: (n) => `${n} điểm trên Hacker News` },
  lobsters: { min: 40, label: (n) => `${n} điểm trên Lobsters` },
  "gh-trending": { min: 800, label: (n) => `+${n.toLocaleString("en-US")} sao` },
  "gh-search": { min: 3000, label: (n) => `Dự án mới ${n.toLocaleString("en-US")} sao` },
  "hf-models": { min: 300, label: () => "Model đang hot" },
  "hf-papers": { min: 50, label: (n) => `${n} lượt bình chọn` },
};

const TIER_BASE: Record<Source["tier"], number> = { 1: 50, 2: 28, 3: 18 };

/** A weekly total is not comparable with a daily one. */
const WEEKLY_THRESHOLD_FACTOR = 5;

/** Keeps any one channel from filling the must-see list, however large its numbers are. */
export const MUST_LANE_CAP: Record<Lane, number> = { labs: 4, github: 2, models: 2, community: 2, papers: 1, news: 2, tools: 1, industry: 1 };

/** Prolific sources (OpenAI publishes daily) must not bury the others in their column. */
export const LANE_SOURCE_CAP: Partial<Record<Lane, number>> = { labs: 6, news: 6, community: 18, industry: 6 };

/** Hours for a score to halve, by lane. */
export const HALF_LIFE_H: Record<Lane, number> = { labs: 96, github: 48, models: 72, papers: 48, community: 36, news: 36, tools: 96, industry: 72 };

export interface Classified {
  keep: boolean;
  topics: string[];
  baseScore: number;
  reasons: string[];
}

export function classify(item: RawItem, source: Source): Classified {
  const text = `${item.title} ${item.summary ?? ""}`;
  const drop = { keep: false, topics: [], baseScore: 0, reasons: [] };
  if (source.aiFilter && !isAiRelated(source.aiInTitle ? item.title : text)) return drop;
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
  if (source.lane === "labs" && source.tier === 1 && !noisy && (release || hasModel)) reasons.push(`${source.name} công bố`);
  if (source.kind === "openrouter" && MAJOR_MODEL_PROVIDER.test(item.title)) reasons.push("Model mới");

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
