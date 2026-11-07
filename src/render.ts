import type { Row, Snapshot } from "./types";

const ASSET_VERSION = "1";

const LANE_TITLES: { key: keyof Snapshot["lanes"]; title: string; hint: string }[] = [
  { key: "labs", title: "Từ các lab", hint: "Kênh chính thức" },
  { key: "github", title: "GitHub", hint: "Repo AI đang lên" },
  { key: "models", title: "Model", hint: "Hugging Face, OpenRouter" },
  { key: "papers", title: "Paper", hint: "HF Daily Papers" },
  { key: "community", title: "Cộng đồng", hint: "HN, Reddit, Lobsters" },
  { key: "news", title: "Báo chí & phân tích", hint: "Tin và góc nhìn" },
];

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Feed URLs are untrusted: anything other than http(s) becomes an inert link. */
export function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? esc(url) : "#";
}

export function timeAgo(t: number, now: number): string {
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 60) return `${Math.max(1, min)} phút`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} giờ`;
  return `${Math.round(h / 24)} ngày`;
}

function externalLink(url: string, text: string, cls = ""): string {
  return `<a href="${safeUrl(url)}"${cls ? ` class="${cls}"` : ""} target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function rowMeta(r: Row, now: number): string {
  const parts = [`<span class="src">${esc(r.sourceName)}</span>`];
  if (r.also.length) parts.push(`<span class="also">+ ${esc(r.also.slice(0, 3).join(", "))}</span>`);
  parts.push(r.live ? `<span>đang lên</span>` : `<time data-t="${r.t}">${timeAgo(r.t, now)}</time>`);
  if (r.metric) parts.push(`<span class="metric">${esc(r.metric)}</span>`);
  if (r.discussUrl && r.discussUrl !== r.url) parts.push(externalLink(r.discussUrl, "thảo luận", "discuss"));
  return parts.join(`<i aria-hidden="true">·</i>`);
}

function rowAttrs(r: Row): string {
  return `data-t="${r.t}" data-seen="${r.firstSeen}" data-topics="${esc(r.topics.join(" "))}"`;
}

function laneRow(r: Row, now: number): string {
  const tip = r.summary ? ` title="${esc(r.summary)}"` : "";
  return `<li class="row" ${rowAttrs(r)}><div class="row-title"><span class="dot" aria-hidden="true"></span>${externalLink(r.url, esc(r.title))}</div><div class="row-meta"${tip}>${rowMeta(r, now)}</div></li>`;
}

function mustRow(r: Row, now: number): string {
  const summary = r.summary ? `<p class="must-summary">${esc(r.summary)}</p>` : "";
  const reasons = r.reasons.slice(0, 3).map((x) => `<span class="reason">${esc(x)}</span>`).join("");
  return `<li class="row must-row" ${rowAttrs(r)}><div class="reasons">${reasons}</div><div class="row-title"><span class="dot" aria-hidden="true"></span>${externalLink(r.url, esc(r.title))}</div>${summary}<div class="row-meta">${rowMeta(r, now)}</div></li>`;
}

function lane(title: string, hint: string, rows: Row[], now: number): string {
  const body = rows.length ? rows.map((r) => laneRow(r, now)).join("") : "";
  return `<section class="lane" data-lane><header class="lane-head"><h2>${esc(title)}</h2><span>${esc(hint)}</span></header><ol class="rows">${body}</ol><p class="empty"${rows.length ? " hidden" : ""}>Không có mục nào khớp bộ lọc.</p><button type="button" class="more" hidden></button></section>`;
}

function delta(count: number, prev: number, ready: boolean): string {
  if (!ready) return "";
  const d = count - prev;
  if (d === 0) return `<span class="delta">=</span>`;
  return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${Math.abs(d)}</span>`;
}

function trends(s: Snapshot): string {
  const topics = s.topics.map((t) => `<li><button type="button" class="topic" data-topic="${esc(t.key)}" aria-pressed="false"><span>${esc(t.label)}</span><span class="topic-num"><b>${t.count}</b>${delta(t.count, t.prev, s.deltaReady)}</span></button></li>`).join("");
  const entities = s.entities.length
    ? `<h3>Model đang được nhắc</h3><ul class="entities">${s.entities.map((e) => `<li>${externalLink(e.url, esc(e.name))}<span>${e.sources} nguồn</span></li>`).join("")}</ul>`
    : "";
  const note = s.deltaReady ? "Số mục 7 ngày, so với 7 ngày trước." : "Số mục 7 ngày. So sánh tuần sẽ hiện khi đủ 14 ngày dữ liệu.";
  return `<aside class="trends"><header class="lane-head"><h2>Xu hướng</h2></header><ul class="topics">${topics}</ul><p class="note">${note} Bấm chủ đề để lọc.</p>${entities}</aside>`;
}

function tools(s: Snapshot, now: number): string {
  if (!s.lanes.tools.length) return "";
  const cells = s.lanes.tools.map((r) => `<li class="tool" data-seen="${r.firstSeen}">${externalLink(r.url, esc(r.title))}<time data-t="${r.t}">${timeAgo(r.t, now)}</time></li>`).join("");
  return `<section class="tools"><header class="lane-head"><h2>Bản phát hành công cụ</h2><span>Bản ổn định mới nhất</span></header><ul>${cells}</ul></section>`;
}

function health(s: Snapshot, now: number): string {
  const bad = s.health.filter((h) => !h.ok);
  const list = s.health.map((h) => `<li class="${h.ok ? "ok" : "bad"}" title="${esc(h.err ?? `${h.count} mục`)}"><span>${esc(h.name)}</span><span>${h.lastOk ? `${timeAgo(h.lastOk, now)} trước` : "chưa chạy"}</span></li>`).join("");
  const summary = bad.length
    ? `<strong>${bad.length}/${s.health.length} nguồn đang lỗi:</strong> ${esc(bad.map((b) => b.name).join(", "))}`
    : `${s.health.length} nguồn đều hoạt động`;
  return `<details class="health"><summary>${summary}</summary><ul>${list}</ul></details>`;
}

function shell(body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Catchup</title>
<meta name="description" content="Toàn cảnh tin tức, model, repo và paper AI mới nhất trên một trang.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/app.css?v=${ASSET_VERSION}">
<script src="/app.js?v=${ASSET_VERSION}" defer></script>
</head>
<body>${body}</body>
</html>`;
}

export function renderPage(s: Snapshot, now: number): string {
  const lanes = LANE_TITLES.map((l) => lane(l.title, l.hint, s.lanes[l.key], now)).join("");
  const updated = new Date(s.generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  const must = s.must.length
    ? s.must.map((r) => mustRow(r, now)).join("")
    : "";
  return shell(`
<header class="top">
  <div class="brand"><h1>AI Catchup</h1><p>Cập nhật lúc ${esc(updated)}, quét 2 lần mỗi ngày</p></div>
  <div class="controls">
    <p class="unread" id="unread" hidden><b id="unread-count"></b> mục mới từ lần trước <button type="button" id="mark-read">Đã xem hết</button></p>
    <div class="range" role="group" aria-label="Khoảng thời gian">
      <button type="button" data-range="1" aria-pressed="false">24 giờ</button>
      <button type="button" data-range="3" aria-pressed="true">3 ngày</button>
      <button type="button" data-range="7" aria-pressed="false">7 ngày</button>
      <button type="button" data-range="14" aria-pressed="false">14 ngày</button>
    </div>
  </div>
</header>
<main>
  <div class="lead">
    <section class="must" data-lane data-all>
      <header class="lane-head"><h2>Không nên bỏ lỡ</h2><span>Lý do chọn ghi ngay trên mỗi mục</span></header>
      <ol class="rows">${must}</ol>
      <p class="empty"${s.must.length ? " hidden" : ""}>Chưa có mục nào đạt ngưỡng quan trọng trong khoảng này.</p>
    </section>
    ${trends(s)}
  </div>
  <div class="grid">${lanes}</div>
  ${tools(s, now)}
</main>
<footer class="foot">
  ${health(s, now)}
  <p>Chọn lọc hoàn toàn bằng rule, không dùng AI. <a href="https://github.com/xvalleycorp/ai-catchup/blob/main/src/rules.ts" target="_blank" rel="noopener noreferrer">Xem rule</a> · <a href="https://github.com/xvalleycorp/ai-catchup" target="_blank" rel="noopener noreferrer">GitHub</a> · <a href="/api/snapshot.json">JSON</a></p>
</footer>`);
}

export function renderEmptyPage(): string {
  return shell(`<main class="waiting"><h1>AI Catchup</h1><p>Lần quét đầu tiên chưa hoàn tất. Bạn quay lại sau ít phút nhé.</p></main>`);
}
