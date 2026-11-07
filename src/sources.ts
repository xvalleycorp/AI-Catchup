import type { Source } from "./types";

const rss = (id: string, name: string, lane: Source["lane"], tier: Source["tier"], url: string, aiFilter = false): Source => ({
  id, name, lane, tier, kind: "rss", url, aiFilter,
});

const release = (repo: string, name: string): Source => ({
  id: `rel-${repo.replace(/\W+/g, "-").toLowerCase()}`,
  name, lane: "tools", tier: 2, kind: "gh-release",
  url: `https://github.com/${repo}/releases.atom`,
});

const trending = (id: string, name: string, path: string): Source => ({
  id, name, lane: "github", tier: 2, kind: "gh-trending", live: true, aiFilter: true,
  url: `https://github.com/trending${path}`,
});

/** Add, remove or tune a source here; nothing else needs to change. */
export const SOURCES: Source[] = [
  // Official lab channels
  rss("openai", "OpenAI", "labs", 1, "https://openai.com/news/rss.xml"),
  { id: "anthropic", name: "Anthropic", lane: "labs", tier: 1, kind: "anthropic", url: "https://www.anthropic.com/news" },
  { id: "anthropic-eng", name: "Anthropic Engineering", lane: "labs", tier: 1, kind: "anthropic", url: "https://www.anthropic.com/engineering" },
  rss("deepmind", "Google DeepMind", "labs", 1, "https://deepmind.google/blog/rss.xml"),
  rss("google-ai", "Google AI", "labs", 1, "https://blog.google/technology/ai/rss/"),
  { id: "meta-ai", name: "Meta AI", lane: "labs", tier: 1, kind: "meta", url: "https://ai.meta.com/blog/" },
  rss("mistral", "Mistral", "labs", 1, "https://mistral.ai/news/rss"),
  rss("hf-blog", "Hugging Face", "labs", 2, "https://huggingface.co/blog/feed.xml"),
  rss("nvidia", "NVIDIA", "labs", 2, "https://blogs.nvidia.com/blog/category/generative-ai/feed/"),
  rss("msr", "Microsoft Research", "labs", 2, "https://www.microsoft.com/en-us/research/feed/", true),

  // GitHub
  trending("gh-trend-all", "GitHub Trending", "?since=daily"),
  trending("gh-trend-py", "Trending Python", "/python?since=daily"),
  trending("gh-trend-ts", "Trending TypeScript", "/typescript?since=daily"),
  trending("gh-trend-week", "Trending tuần", "?since=weekly"),
  { id: "gh-new", name: "Repo mới nổi", lane: "github", tier: 2, kind: "gh-search", url: "https://api.github.com/search/repositories", live: true },

  // Models
  { id: "hf-models", name: "HF Trending", lane: "models", tier: 2, kind: "hf-models", live: true, url: "https://huggingface.co/api/models?sort=trendingScore&limit=30" },
  { id: "openrouter", name: "OpenRouter", lane: "models", tier: 2, kind: "openrouter", url: "https://openrouter.ai/api/v1/models", maxBytes: 80_000 },

  // Papers
  { id: "hf-papers", name: "HF Daily Papers", lane: "papers", tier: 2, kind: "hf-papers", url: "https://huggingface.co/api/daily_papers?limit=40" },

  // Community
  { id: "hn", name: "Hacker News", lane: "community", tier: 2, kind: "hn", aiFilter: true, url: "https://hn.algolia.com/api/v1/search_by_date" },
  rss("r-localllama", "r/LocalLLaMA", "community", 3, "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day"),
  rss("r-ml", "r/MachineLearning", "community", 3, "https://www.reddit.com/r/MachineLearning/top/.rss?t=day"),
  { id: "lobsters", name: "Lobsters", lane: "community", tier: 3, kind: "lobsters", url: "https://lobste.rs/t/ai.json" },

  // Press and analysis
  rss("latent", "Latent Space / AINews", "news", 2, "https://www.latent.space/feed"),
  rss("simonw", "Simon Willison", "news", 2, "https://simonwillison.net/atom/everything/", true),
  rss("interconnects", "Interconnects", "news", 2, "https://www.interconnects.ai/feed"),
  rss("import-ai", "Import AI", "news", 2, "https://importai.substack.com/feed"),
  rss("raschka", "Ahead of AI", "news", 2, "https://magazine.sebastianraschka.com/feed"),
  rss("techcrunch", "TechCrunch AI", "news", 3, "https://techcrunch.com/category/artificial-intelligence/feed/"),
  rss("verge", "The Verge AI", "news", 3, "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"),
  rss("decoder", "The Decoder", "news", 3, "https://the-decoder.com/feed/"),
  rss("mit-tr", "MIT Tech Review", "news", 3, "https://www.technologyreview.com/topic/artificial-intelligence/feed"),

  // Tool releases to watch
  release("anthropics/claude-code", "Claude Code"),
  release("openai/codex", "Codex CLI"),
  release("google-gemini/gemini-cli", "Gemini CLI"),
  release("ollama/ollama", "Ollama"),
  release("ggml-org/llama.cpp", "llama.cpp"),
  release("vllm-project/vllm", "vLLM"),
  release("huggingface/transformers", "Transformers"),
  release("langchain-ai/langgraph", "LangGraph"),
];

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
