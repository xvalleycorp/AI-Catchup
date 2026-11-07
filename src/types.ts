export type Lane = "labs" | "github" | "models" | "papers" | "community" | "news" | "tools";

export type SourceKind =
  | "rss"
  | "gh-trending"
  | "gh-search"
  | "gh-release"
  | "hn"
  | "hf-models"
  | "hf-papers"
  | "openrouter"
  | "lobsters"
  | "anthropic"
  | "meta";

export interface Source {
  id: string;
  name: string;
  lane: Lane;
  /** 1 = primary/official, 2 = strong curated signal, 3 = broad and noisy. */
  tier: 1 | 2 | 3;
  kind: SourceKind;
  url: string;
  /** Drop items that do not match the AI relevance rule (for general-purpose feeds). */
  aiFilter?: boolean;
  /** Item stays "active" for as long as the source keeps listing it (trending lists). */
  live?: boolean;
  /** Read only this many bytes of a newest-first response. */
  maxBytes?: number;
}

export interface RawItem {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: number;
  signal?: number;
  metric?: string;
  discussUrl?: string;
}

export interface Row {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceName: string;
  lane: Lane;
  /** Activity time used for filtering and decay (last_seen for live sources). */
  t: number;
  firstSeen: number;
  live: boolean;
  metric: string | null;
  summary: string | null;
  discussUrl: string | null;
  topics: string[];
  reasons: string[];
  also: string[];
  score: number;
}

export interface Snapshot {
  generatedAt: number;
  must: Row[];
  lanes: Record<Lane, Row[]>;
  topics: { key: string; label: string; count: number; prev: number }[];
  entities: { name: string; sources: number; url: string }[];
  /** True once the database covers 14+ days, so week-over-week deltas are meaningful. */
  deltaReady: boolean;
  health: { id: string; name: string; ok: boolean; lastOk: number; err: string | null; count: number }[];
}
