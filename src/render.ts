import type { Row, Snapshot } from "./types";

const ASSET_VERSION = "6";

/** Next run of the 08:00 / 16:00 Vietnam schedule in wrangler.jsonc. */
const SCAN_HOURS_VN = [8, 16];

const LANE_TITLES: { key: keyof Snapshot["lanes"]; title: string }[] = [
  { key: "labs", title: "Từ các công ty AI" },
  { key: "github", title: "Dự án mã nguồn mở" },
  { key: "models", title: "Model" },
  { key: "papers", title: "Nghiên cứu" },
  { key: "community", title: "Cộng đồng" },
  { key: "news", title: "Báo chí & phân tích" },
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
  return `data-t="${r.t}" data-seen="${r.firstSeen}" data-topics="${esc(r.topics.join(" "))}" data-orgs="${esc((r.orgs ?? []).join(" "))}" data-sectors="${esc((r.sectors ?? []).join(" "))}"`;
}

function laneRow(r: Row, now: number): string {
  const tip = r.summary ? ` title="${esc(r.summary)}"` : "";
  return `<li class="row" ${rowAttrs(r)}><div class="row-title"><span class="dot" aria-hidden="true"></span>${externalLink(r.url, esc(r.title))}</div><div class="row-meta"${tip}>${rowMeta(r, now)}</div></li>`;
}

function mustRow(r: Row, now: number): string {
  const summary = r.summary ? `<p class="must-summary">${esc(r.summary)}</p>` : "";
  const reasons = r.reasons.slice(0, 3).map((x) => `<span class="reason">${esc(x)}</span>`).join("");
  return `<li class="row must-row" ${rowAttrs(r)}><span class="rank" aria-hidden="true"></span><div class="must-body"><div class="reasons">${reasons}</div><div class="row-title"><span class="dot" aria-hidden="true"></span>${externalLink(r.url, esc(r.title))}</div>${summary}<div class="row-meta">${rowMeta(r, now)}</div></div></li>`;
}

function lane(title: string, rows: Row[], now: number, cls = ""): string {
  return `<section class="card lane ${cls}" data-lane><header class="lane-head"><h3>${esc(title)}</h3></header><ol class="rows">${rows.map((r) => laneRow(r, now)).join("")}</ol><p class="empty"${rows.length ? " hidden" : ""}>Không có mục nào khớp bộ lọc.</p><button type="button" class="more" hidden></button></section>`;
}

function chart(id: string, eyebrow: string, title: string, cls = ""): string {
  return `<section class="card chart ${cls}" id="${id}">
    <p class="eyebrow">${esc(eyebrow)}</p>
    <h3 class="finding" data-finding>${esc(title)}</h3>
    <div class="plot" data-plot></div>
    <p class="caption" data-caption></p>
    <details class="table-view"><summary>Xem bảng số liệu</summary><div data-table></div></details>
  </section>`;
}

function charts(s: Snapshot): string {
  if (!s.story) return "";
  const data = JSON.stringify(s.story).replace(/</g, "\\u003c");
  const entities = s.entities.length
    ? `<section class="card chart" id="entities"><p class="eyebrow">Biểu đồ 7 · Tên đang nổi</p><h3 class="finding">Model được nhắc đến nhiều nơi cùng lúc</h3><ul class="entities">${s.entities.map((e) => `<li>${externalLink(e.url, esc(e.name))}<span>${e.sources} trang tin</span></li>`).join("")}</ul><p class="caption">Số trang tin khác nhau cùng nhắc tới một model trong 72 giờ qua.</p></section>`
    : "";
  return `<script type="application/json" id="story-data">${data}</script>
  <div class="section-head"><p class="eyebrow">Toàn cảnh</p><h2>Điều gì đang diễn ra</h2><p>Bấm vào một cột, thanh hoặc ô để xem danh sách tin tạo nên con số đó.</p></div>
  <noscript><p class="caption">Bật JavaScript để xem biểu đồ. Danh sách tin bên dưới vẫn đọc được bình thường.</p></noscript>
  <div class="bento">
    ${chart("flow", "Biểu đồ 1 · Nhịp tin", "Nhịp tin 14 ngày", "span-7")}
    ${chart("orgs", "Biểu đồ 2 · Mức độ được nhắc đến", "Công ty được nhắc nhiều nhất", "span-5")}
    ${chart("heat", "Biểu đồ 3 · Chủ đề theo ngày", "Chủ đề theo từng ngày", "span-12")}
    ${chart("timeline", "Biểu đồ 4 · Dòng thời gian", "Xu hướng theo thời gian", "span-12")}
    ${chart("momentum", "Biểu đồ 5 · Đà tăng", "Dự án và model đang tăng nhanh", "span-5")}
    ${chart("debate", "Biểu đồ 6 · Thảo luận", "Điều gì khiến cộng đồng tranh luận", "span-7")}
    ${entities ? entities.replace('class="card chart"', 'class="card chart span-12"') : ""}
  </div>`;
}

function sectors(s: Snapshot, now: number): string {
  if (!s.story?.sectors) return "";
  return `<section class="feature">
  <div class="section-head"><p class="eyebrow">Chuyên đề</p><h2>AI trong ngân hàng và các ngành</h2></div>
  <div class="bento">
    ${chart("sectors", "Chuyên đề · Theo ngành", "Tin về ứng dụng AI theo ngành", "span-5")}
    ${chart("banking", "Chuyên đề · Ngân hàng", "AI trong ngân hàng", "span-7")}
    ${lane("Tin AI trong ngân hàng & tài chính", s.banking ?? [], now, "span-7")}
    ${lane("Ứng dụng ở các ngành khác", s.lanes.industry.filter((r) => r.sectors.length > 0 && !r.sectors.includes("banking")), now, "span-5")}
  </div>
  </section>`;
}

function tools(s: Snapshot, now: number): string {
  if (!s.lanes.tools.length) return "";
  const cells = s.lanes.tools.map((r) => `<li class="tool" data-seen="${r.firstSeen}">${externalLink(r.url, esc(r.title))}<time data-t="${r.t}">${timeAgo(r.t, now)}</time></li>`).join("");
  return `<section class="tools card"><header class="lane-head"><h3>Phiên bản mới của công cụ AI</h3></header><ul>${cells}</ul></section>`;
}

export function nextScanLabel(now: number): string {
  const vnHour = new Date(now + 7 * 3_600_000).getUTCHours();
  const next = SCAN_HOURS_VN.find((h) => h > vnHour);
  return next === undefined ? `${SCAN_HOURS_VN[0]}:00 sáng mai` : `${next}:00`;
}

function shell(body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Catchup</title>
<meta name="description" content="Toàn cảnh AI bằng dữ liệu: tin, model, repo và paper mới nhất trên một trang.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/app.css?v=${ASSET_VERSION}">
<script src="/theme.js?v=${ASSET_VERSION}"></script>
<script src="/app.js?v=${ASSET_VERSION}" defer></script>
</head>
<body>${body}</body>
</html>`;
}

export function renderPage(s: Snapshot, now: number): string {
  const lanes = LANE_TITLES.map((l) => lane(l.title, s.lanes[l.key], now)).join("");
  const updated = new Date(s.generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  const headline = s.story
    ? s.story.headline.map((h) => (h.em ? `<em>${esc(h.text)}</em>` : esc(h.text))).join("")
    : "Toàn cảnh AI, cập nhật hai lần mỗi ngày.";
  return shell(`
<div class="masthead">
  <header class="bar"><div class="bar-inner">
    <a class="logo" href="/">AI Catchup</a>
    <span class="bar-meta">Cập nhật ${esc(updated)} · Lần tiếp theo lúc ${esc(nextScanLabel(now))}</span>
    <div class="range" role="group" aria-label="Khoảng thời gian">
      <button type="button" data-range="1" aria-pressed="false">24 giờ</button>
      <button type="button" data-range="3" aria-pressed="false">3 ngày</button>
      <button type="button" data-range="7" aria-pressed="true">7 ngày</button>
      <button type="button" data-range="14" aria-pressed="false">14 ngày</button>
    </div>
    <div class="active" id="active-filters" aria-live="polite"></div>
    <div class="bar-end">
      <p class="unread" id="unread" hidden><b id="unread-count"></b> mục mới <button type="button" id="mark-read">Đã xem hết</button></p>
      <button type="button" class="theme" id="theme-toggle" aria-label="Đổi giao diện sáng tối">◐</button>
    </div>
  </div></header>
  <section class="hero wrap">
    <div class="hero-copy">
      <p class="eyebrow">Điểm chính hôm nay</p>
      <h1>${headline}</h1>
      ${s.story?.deck ? `<p class="deck">${esc(s.story.deck)}</p>` : ""}
    </div>
    <div class="kpis">
      <button type="button" class="kpi kpi-button" id="kpi-items-button"><span class="kpi-label">Tin mới trong <span data-kpi-range></span></span><span class="kpi-value" id="kpi-items">–</span><span class="kpi-note">Xem danh sách</span></button>
      <div class="kpi"><span class="kpi-label">Không nên bỏ lỡ</span><span class="kpi-value" id="kpi-must">${s.must.length}</span></div>
      <div class="kpi"><span class="kpi-label">Dự án tăng nhanh nhất</span><span class="kpi-value" id="kpi-repo">${s.story?.momentum.today[0] ? `+${s.story.momentum.today[0].v.toLocaleString("en-US")}` : "–"}</span><span class="kpi-note">${esc(s.story?.momentum.today[0]?.n ?? "")}</span></div>
      <div class="kpi"><span class="kpi-label">Chủ đề lớn nhất</span><span class="kpi-value kpi-text">${esc(s.topics[0]?.label ?? "–")}</span><span class="kpi-note">${s.topics[0] ? `${s.topics[0].count} tin` : ""}</span></div>
    </div>
  </section>
</div>
<main>

  <section class="must" data-lane data-all>
    <div class="section-head"><h2>Không nên bỏ lỡ</h2></div>
    <ol class="rows">${s.must.map((r) => mustRow(r, now)).join("")}</ol>
    <p class="empty"${s.must.length ? " hidden" : ""}>Không có mục quan trọng nào khớp bộ lọc.</p>
  </section>

  ${sectors(s, now)}

  ${charts(s)}

  <div class="section-head"><h2>Tất cả tin</h2></div>
  <div class="grid">${lanes}</div>
  ${tools(s, now)}
</main>
<aside class="drawer" id="drawer" aria-labelledby="drawer-title" hidden>
  <header class="drawer-head">
    <div><p class="eyebrow">Chi tiết</p><h2 id="drawer-title" tabindex="-1"></h2><p class="drawer-sub" id="drawer-sub"></p></div>
    <button type="button" class="drawer-close" id="drawer-close" aria-label="Đóng danh sách">×</button>
  </header>
  <ol class="drawer-list" id="drawer-list"></ol>
</aside>
<div class="tooltip" id="tooltip" role="status" hidden><strong></strong><span></span><small></small></div>
<footer class="foot"><p>AI Catchup · Cập nhật mỗi ngày lúc 8:00 và 16:00</p></footer>`);
}

export function renderEmptyPage(): string {
  return shell(`<main class="waiting"><h1>AI Catchup</h1><p>Trang đang được cập nhật. Bạn quay lại sau ít phút nhé.</p></main>`);
}
