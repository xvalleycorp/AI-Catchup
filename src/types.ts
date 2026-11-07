export type Lane = "labs" | "github" | "models" | "papers" | "community" | "news" | "tools" | "industry" | "security";

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
  | "meta"
  | "gh-advisory";

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
  /** Every AI story from this trade publication belongs to this industry. */
  sector?: string;
  /** General trade press mentions AI in passing, so AI must be in the headline itself. */
  aiInTitle?: boolean;
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
  orgs: string[];
  sectors: string[];
  reasons: string[];
  also: string[];
  score: number;
}

export interface MomentumBar {
  n: string; // name
  u: string; // url
  v: number; // value
  d: string; // description
}

export interface DebatePoint {
  n: string; // title
  u: string; // discussion url
  p: number; // points
  c: number; // comments
  t: number; // epoch seconds
  tp: number[]; // topic indexes
  o: number[]; // org indexes
}

/** Everything the charts need; filtered in the browser so all charts agree on one slice. */
export interface Story {
  dataStart: number;
  topics: { key: string; label: string }[];
  orgs: { key: string; label: string }[];
  sectors: { key: string; label: string }[];
  /** Publisher names, referenced by index from pulse and banking rows. */
  sources: string[];
  /**
   * One entry per dated story: [epoch seconds, topic indexes, org indexes, 1 if from a lab's own channel,
   * sector indexes, title, url, publisher index]. Titles and links let every count open its list.
   */
  pulse: [number, number[], number[], 0 | 1, number[], string, string, number][];
  banking: {
    themes: { key: string; label: string }[];
    banks: string[];
    /** One entry per banking story: [epoch seconds, theme indexes, bank indexes, title, url, publisher index]. */
    rows: [number, number[], number[], string, string, number][];
  };
  momentum: { today: MomentumBar[]; week: MomentumBar[]; fresh: MomentumBar[]; hf: MomentumBar[] };
  debate: DebatePoint[];
  headline: { text: string; em?: boolean }[];
  deck: string;
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
  /** Announced model shutdowns, soonest first. */
  lifecycle?: LifecycleEntry[];
  /** Strongest AI-in-banking stories, across every channel. */
  banking?: Row[];
  story?: Story;
}

/** A model shutdown date as published on a provider's deprecations page. */
export interface LifecycleSource {
  id: string;
  provider: string;
  /** Machine-readable (Markdown) version of the page. */
  url: string;
  /** The page a reader should open. */
  page: string;
}

export interface LifecycleEntry {
  provider: string;
  model: string;
  retiresAt: number;
  replacement: string;
  url: string;
}
