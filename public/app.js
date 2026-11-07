(() => {
  "use strict";
  const DAY = 86400000;
  const VN_OFFSET = 7 * 3600000;
  const LANE_LIMIT = window.innerWidth < 720 ? 5 : 6;
  const TIMELINE_DAYS = 14;
  const SESSION_GAP = 30 * 60000;
  const KEYS = { range: "catchup.range", visit: "catchup.lastVisit", baseline: "catchup.baseline", theme: "catchup.theme" };

  // Browser storage can throw or come back empty; everything below works without it.
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* per-viewer convenience only */ } },
  };

  const now = Date.now();
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const fmt = (n) => Number(n).toLocaleString("en-US");
  function relative(t) {
    const min = Math.max(0, Math.round((now - t) / 60000));
    if (min < 60) return `${Math.max(1, min)} phút`;
    const h = Math.round(min / 60);
    return h < 24 ? `${h} giờ` : `${Math.round(h / 24)} ngày`;
  }
  const dayOf = (ms) => Math.floor((ms + VN_OFFSET) / DAY);
  const dayLabel = (day) => {
    const d = new Date(day * DAY);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const svgEl = (tag, attrs = {}) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  document.documentElement.classList.add("js");

  const dataNode = document.getElementById("story-data");
  const story = dataNode ? JSON.parse(dataNode.textContent) : null;
  const today = dayOf(now);

  const savedRange = Number(store.get(KEYS.range));
  const state = {
    range: [1, 3, 7, 14].includes(savedRange) ? savedRange : 7,
    topic: null, // topic key
    org: null, // org key
    sector: null, // sector key
    day: null, // day number
    tab: "today",
    expanded: new Set(),
  };

  // ── Slicing ────────────────────────────────────────────────────────────────
  // Each chart ignores its own dimension, so a selection never empties the chart used to change it.
  const topicIndex = (key) => story.topics.findIndex((t) => t.key === key);
  const orgIndex = (key) => story.orgs.findIndex((o) => o.key === key);
  const sectorIndex = (key) => story.sectors.findIndex((s) => s.key === key);

  function matches(tMs, topics, orgs, ignore = {}, sectors = null) {
    if (!ignore.range && state.day === null && tMs < now - state.range * DAY) return false;
    if (!ignore.day && state.day !== null && dayOf(tMs) !== state.day) return false;
    if (!ignore.topic && state.topic && !topics.includes(topicIndex(state.topic))) return false;
    if (!ignore.org && state.org && !orgs.includes(orgIndex(state.org))) return false;
    if (!ignore.sector && state.sector && sectors && !sectors.includes(sectorIndex(state.sector))) return false;
    return true;
  }
  const slice = (ignore) => story.pulse.filter(([t, tp, o, , sec]) => matches(t * 1000, tp, o, ignore, sec));

  function scopeLabel() {
    const parts = [];
    if (state.topic) parts.push(story.topics[topicIndex(state.topic)].label);
    if (state.org) parts.push(story.orgs[orgIndex(state.org)].label);
    if (state.sector) parts.push(story.sectors[sectorIndex(state.sector)].label);
    return parts.join(", ");
  }
  const rangeLabel = () => (state.day !== null ? `ngày ${dayLabel(state.day)}` : state.range === 1 ? "24 giờ qua" : `${state.range} ngày qua`);

  // ── Tooltip: one element, text only, same content on hover and keyboard focus ─
  const tooltip = $("#tooltip");
  function tip(node, value, label, sub) { node._tip = { value, label, sub }; }
  function showTip(node, x, y) {
    const data = node._tip;
    const [strong, span, small] = tooltip.children;
    strong.textContent = data.value;
    span.textContent = data.label;
    small.textContent = data.sub || "";
    small.hidden = !data.sub;
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.min(window.innerWidth - box.width - 8, Math.max(8, x + 14))}px`;
    tooltip.style.top = `${y - box.height - 12 < 8 ? y + 16 : y - box.height - 12}px`;
  }
  document.addEventListener("pointermove", (event) => {
    const target = event.target.closest?.("[data-tip]");
    if (target?._tip) showTip(target, event.clientX, event.clientY);
    else tooltip.hidden = true;
  });
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest?.("[data-tip]");
    if (target?._tip) {
      const r = target.getBoundingClientRect();
      showTip(target, r.left + r.width / 2, r.top);
    }
  });
  document.addEventListener("focusout", () => { tooltip.hidden = true; });
  document.addEventListener("scroll", () => { tooltip.hidden = true; }, { passive: true });

  // ── Detail drawer: the stories behind any number ─────────────────────────
  const drawer = $("#drawer");
  let drawerReturn = null;
  let drawerReturnKey = null;
  const RETURN_KEYS = ['sector', 'org', 'topic', 'day', 'bankTheme', 'bank'];

  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    document.documentElement.classList.remove("drawer-open");
    // Charts redraw on selection, so the clicked mark may be a fresh node with the same data.
    let back = drawerReturn;
    if (back && !document.contains(back) && drawerReturnKey) back = document.querySelector(drawerReturnKey);
    if (back) back.focus();
    drawerReturn = null;
    drawerReturnKey = null;
  }

  /** entries: [{ t (ms), n (title), u (url), s (publisher) }] */
  function openDrawer(title, sub, entries, note) {
    drawerReturn = document.activeElement;
    const ds = drawerReturn?.dataset || {};
    drawerReturnKey = RETURN_KEYS.filter((k) => ds[k] !== undefined)
      .map((k) => '[data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + '="' + CSS.escape(ds[k]) + '"]').join('') || null;
    if (drawerReturnKey) drawerReturnKey = '.' + drawerReturn.className.split(' ')[0] + drawerReturnKey;
    $("#drawer-title").textContent = title;
    $("#drawer-sub").textContent = `${sub} · ${fmt(entries.length)} tin${note ? `. ${note}` : ""}`;
    const list = $("#drawer-list");
    list.replaceChildren();
    for (const e of [...entries].sort((a, b) => b.t - a.t)) {
      const li = el("li", "drawer-row");
      const a = el("a", "drawer-link", e.n);
      a.href = /^https?:\/\//i.test(e.u) ? e.u : "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      const meta = el("p", "drawer-meta");
      meta.append(el("span", "src", e.s), document.createTextNode(` · ${relative(e.t)} trước · ${dayLabel(dayOf(e.t))}`));
      li.append(a, meta);
      list.append(li);
    }
    if (!entries.length) list.append(el("li", "empty", "Không có tin nào."));
    drawer.hidden = false;
    document.documentElement.classList.add("drawer-open");
    drawer.scrollTop = 0;
    $("#drawer-title").focus();
  }

  const fromPulse = (p) => ({ t: p[0] * 1000, n: p[5], u: p[6], s: story.sources[p[7]] || "" });

  /** Opens the stories behind the current selection, exactly as the charts counted them. */
  function openSelection(options = {}) {
    let items = slice();
    if (options.outsideOnly) items = items.filter((p) => p[3] === 0);
    const scope = scopeLabel() || "Tất cả tin";
    openDrawer(scope, rangeLabel(), items.map(fromPulse), options.note);
  }

  // ── Chart scaffolding ─────────────────────────────────────────────────────
  // Marks start from their previous size so filtering morphs instead of flashing.
  const previous = new Map();
  function animateSize(node, key, prop, value) {
    const from = previous.get(key);
    node.style[prop] = from ?? "0%";
    previous.set(key, value);
    requestAnimationFrame(() => requestAnimationFrame(() => { node.style[prop] = value; }));
  }

  function setChart(id, finding, caption) {
    const root = document.getElementById(id);
    $("[data-finding]", root).textContent = finding;
    $("[data-caption]", root).textContent = caption || "";
    const plot = $("[data-plot]", root);
    plot.replaceChildren();
    return plot;
  }

  function setTable(id, headers, rows) {
    const table = el("table");
    const headRow = el("tr");
    headers.forEach((h) => headRow.append(el("th", "", h)));
    const thead = el("thead");
    thead.append(headRow);
    const tbody = el("tbody");
    for (const row of rows) {
      const tr = el("tr");
      row.forEach((cell) => tr.append(el("td", "", String(cell))));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    $("[data-table]", document.getElementById(id)).replaceChildren(table);
  }

  // ── 01 Timeline ───────────────────────────────────────────────────────────
  function renderFlow() {
    const items = slice({ range: true, day: true });
    const days = Array.from({ length: TIMELINE_DAYS }, (_, i) => today - (TIMELINE_DAYS - 1 - i));
    const counts = new Map(days.map((d) => [d, 0]));
    for (const [t] of items) {
      const d = dayOf(t * 1000);
      if (counts.has(d)) counts.set(d, counts.get(d) + 1);
    }
    const max = Math.max(1, ...counts.values());
    const peak = days.reduce((best, d) => (counts.get(d) > counts.get(best) ? d : best), days[0]);
    const startDay = dayOf(story.dataStart);
    const hasBackfill = days[0] < startDay;
    const scope = scopeLabel();

    const plot = setChart(
      "flow",
      counts.get(peak) ? `${scope ? `${scope}: c` : "C"}ao điểm ${dayLabel(peak)} với ${fmt(counts.get(peak))} mục` : "Chưa có mục nào khớp bộ lọc",
      `${hasBackfill ? `Các ngày trước ${dayLabel(startDay)} chưa đủ dữ liệu nên có thể thấp hơn thực tế. ` : ""}Bấm vào một cột để xem danh sách tin.`,
    );
    const inRangeFrom = dayOf(now - state.range * DAY);

    if (hasBackfill) {
      const legend = el("div", "legend");
      for (const [cls, text] of [["key-peak", "Cao điểm"], ["key-bar", "Đủ dữ liệu"], ["key-back", "Chưa đủ dữ liệu"]]) {
        const item = el("span");
        item.append(el("i", cls), document.createTextNode(text));
        legend.append(item);
      }
      plot.append(legend);
    }
    const chart = el("div", "columns");
    chart.setAttribute("role", "group");
    chart.setAttribute("aria-label", "Số mục theo ngày");
    for (const d of days) {
      const count = counts.get(d);
      const col = el("button", "col");
      col.type = "button";
      col.dataset.tip = "";
      col.dataset.day = String(d);
      col.setAttribute("aria-pressed", String(state.day === d));
      col.setAttribute("aria-label", `${dayLabel(d)}: ${count} mục`);
      col.classList.toggle("is-out", state.day === null ? d < inRangeFrom : state.day !== d);
      col.classList.toggle("is-back", d < startDay);
      tip(col, `${fmt(count)} mục`, dayLabel(d) + (d === today ? " (hôm nay, chưa hết ngày)" : ""), d < startDay ? "Chưa đủ dữ liệu" : "Bấm để lọc theo ngày");
      const track = el("span", "col-track");
      const bar = el("span", `col-bar${d === peak && count ? " is-peak" : ""}`);
      track.append(bar);
      animateSize(bar, `flow-${d}`, "height", `${(count / max) * 100}%`);
      if (d === peak && count) track.append(el("span", "col-value", fmt(count)));
      col.append(track, el("span", "col-label", (d - days[0]) % 2 === 1 || d === today ? dayLabel(d) : ""));
      chart.append(col);
    }
    plot.append(chart);
    setTable("flow", ["Ngày", "Số mục"], days.map((d) => [dayLabel(d), counts.get(d)]));
  }

  // ── 02 Organisations ──────────────────────────────────────────────────────
  function renderOrgs() {
    // A lab's own blog is excluded: this chart measures how much others talk about it.
    const items = slice({ org: true }).filter((p) => p[3] === 0);
    const counts = story.orgs.map((o, i) => ({ ...o, count: items.filter((p) => p[2].includes(i)).length }))
      .filter((o) => o.count > 0 || o.key === state.org)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const top = counts[0];
    const second = counts[1];
    let finding = "Chưa có công ty nào được nhắc trong khoảng này";
    if (top?.count) {
      finding = second?.count && top.count >= second.count * 1.5
        ? `${top.label} áp đảo: gấp ${(top.count / second.count).toFixed(1).replace(".", ",")} lần ${second.label}`
        : `${top.label} được nhắc nhiều nhất: ${fmt(top.count)} tiêu đề`;
    }
    const plot = setChart("orgs", finding, `Số tiêu đề nhắc tới công ty trong ${rangeLabel()}, không tính bài do chính công ty đó đăng. Bấm vào một công ty để xem danh sách.`);
    const max = Math.max(1, ...counts.map((o) => o.count));
    const list = el("div", "hbars");
    for (const o of counts) {
      const row = el("button", "hbar");
      row.type = "button";
      row.dataset.org = o.key;
      row.dataset.tip = "";
      row.setAttribute("aria-pressed", String(state.org === o.key));
      tip(row, `${fmt(o.count)} tiêu đề`, o.label, state.org === o.key ? "Bấm để bỏ lọc" : "Bấm để lọc cả trang");
      row.classList.toggle("is-dim", !!state.org && state.org !== o.key);
      const fill = el("span", `hbar-fill${o === top && o.count ? " is-peak" : ""}`);
      const track = el("span", "hbar-track");
      track.append(fill);
      animateSize(fill, `org-${o.key}`, "width", `${(o.count / max) * 100}%`);
      row.append(el("span", "hbar-name", o.label), track, el("span", "hbar-value", fmt(o.count)));
      list.append(row);
    }
    plot.append(list);
    setTable("orgs", ["Công ty", "Số tiêu đề"], counts.map((o) => [o.label, o.count]));
  }

  // ── 03 Topic heatmap ──────────────────────────────────────────────────────
  function renderHeat() {
    const items = slice({ range: true, day: true, topic: true });
    const days = Array.from({ length: TIMELINE_DAYS }, (_, i) => today - (TIMELINE_DAYS - 1 - i));
    const startDay = dayOf(story.dataStart);
    const inRange = slice({ topic: true });
    const totals = story.topics.map((t, i) => ({ ...t, i, total: inRange.filter((p) => p[1].includes(i)).length }))
      .sort((a, b) => b.total - a.total);
    const grid = new Map();
    let max = 1;
    for (const [t, tp] of items) {
      const d = dayOf(t * 1000);
      for (const i of tp) {
        const key = `${i}:${d}`;
        const n = (grid.get(key) || 0) + 1;
        grid.set(key, n);
        if (n > max) max = n;
      }
    }
    const top = totals[0];
    const share = inRange.length && top ? Math.round((top.total / inRange.length) * 100) : 0;
    const plot = setChart(
      "heat",
      top?.total ? `${top.label} có mặt trong ${share}% số mục của ${rangeLabel()}` : "Chưa có chủ đề nào trong khoảng này",
      "Ô càng đậm càng nhiều tin. Một tin có thể thuộc nhiều chủ đề. Các cột mờ là những ngày chưa đủ dữ liệu. Bấm vào một ô hoặc tên chủ đề để xem danh sách.",
    );
    const wrap = el("div", "heat");
    wrap.append(el("span", "heat-corner", "Chủ đề"));
    for (const d of days) wrap.append(el("span", "heat-day", (d - days[0]) % 2 === 1 || d === today ? dayLabel(d) : ""));
    wrap.append(el("span", "heat-total", "Tổng"));
    for (const t of totals) {
      const label = el("button", "heat-label", t.label);
      label.type = "button";
      label.dataset.topic = t.key;
      label.setAttribute("aria-pressed", String(state.topic === t.key));
      wrap.append(label);
      for (const d of days) {
        const n = grid.get(`${t.i}:${d}`) || 0;
        // Five bins of the sequential ramp, relative to the busiest cell.
        const bin = n === 0 ? 0 : Math.min(5, Math.ceil((n / max) * 5));
        const cell = el("button", `heat-cell h${bin}`);
        cell.type = "button";
        cell.dataset.tip = "";
        cell.dataset.topic = t.key;
        cell.dataset.day = String(d);
        cell.setAttribute("aria-label", `${t.label}, ${dayLabel(d)}: ${n} mục`);
        cell.classList.toggle("is-back", d < startDay);
        cell.classList.toggle("is-picked", (!state.topic || state.topic === t.key) && (state.day === null || state.day === d) && !!(state.topic || state.day !== null));
        tip(cell, `${fmt(n)} mục`, `${t.label} · ${dayLabel(d)}`, "Bấm để lọc theo ô này");
        wrap.append(cell);
      }
      wrap.append(el("span", "heat-total", fmt(t.total)));
    }
    plot.append(wrap);
    const scale = el("div", "heat-scale");
    scale.append(el("span", "", "Ít"));
    for (let i = 0; i <= 5; i += 1) scale.append(el("i", `h${i}`));
    scale.append(el("span", "", `Nhiều (${fmt(max)} mục/ngày)`));
    plot.append(scale);
    setTable("heat", ["Chủ đề", ...days.map(dayLabel), "Tổng"], totals.map((t) => [t.label, ...days.map((d) => grid.get(`${t.i}:${d}`) || 0), t.total]));
  }

  // ── 04 Momentum ───────────────────────────────────────────────────────────
  const TABS = [
    { key: "today", label: "Hôm nay", unit: "sao hôm nay", prefix: "+", finding: (a, b) => `${a.n} thêm ${fmt(a.v)} sao hôm nay${b ? `, gấp ${(a.v / b.v).toFixed(1).replace(".", ",")} lần dự án thứ hai` : ""}` },
    { key: "week", label: "Tuần này", unit: "sao trong tuần", prefix: "+", finding: (a) => `${a.n} thêm ${fmt(a.v)} sao trong tuần` },
    { key: "fresh", label: "Dự án mới", unit: "sao", prefix: "", finding: (a) => `Dự án dưới 14 ngày tuổi nổi bật nhất: ${a.n}, ${fmt(a.v)} sao` },
    { key: "hf", label: "Model", unit: "điểm trending", prefix: "", finding: (a) => `${a.n} dẫn đầu Hugging Face với ${fmt(a.v)} điểm trending` },
  ];
  function renderMomentum() {
    const tab = TABS.find((t) => t.key === state.tab);
    const list = story.momentum[tab.key];
    const plot = setChart(
      "momentum",
      list[0] ? tab.finding(list[0], list[1]) : "Chưa có dữ liệu",
      `Số liệu mới nhất, không đổi theo bộ lọc. Đơn vị: ${tab.unit}.`,
    );
    const tabs = el("div", "tabs");
    tabs.setAttribute("role", "tablist");
    for (const t of TABS) {
      const b = el("button", "tab", t.label);
      b.type = "button";
      b.dataset.tab = t.key;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(t.key === tab.key));
      tabs.append(b);
    }
    plot.append(tabs);
    const max = Math.max(1, ...list.map((b) => b.v));
    const bars = el("div", "hbars hbars-stacked");
    list.forEach((b, i) => {
      const row = el("a", "hbar hbar-link");
      row.href = /^https?:\/\//i.test(b.u) ? b.u : "#";
      row.target = "_blank";
      row.rel = "noopener noreferrer";
      row.dataset.tip = "";
      tip(row, `${tab.prefix}${fmt(b.v)} ${tab.unit}`, b.n, b.d);
      const fill = el("span", `hbar-fill${i === 0 ? " is-peak" : ""}`);
      const track = el("span", "hbar-track");
      track.append(fill);
      animateSize(fill, `mom-${tab.key}-${b.u}`, "width", `${(b.v / max) * 100}%`);
      row.append(el("span", "hbar-name", b.n), el("span", "hbar-value", `${tab.prefix}${fmt(b.v)}`), track);
      bars.append(row);
    });
    plot.append(bars);
    setTable("momentum", ["Tên", tab.unit], list.map((b) => [b.n, b.v]));
  }

  // ── 05 Debate scatter ─────────────────────────────────────────────────────
  function truncate(text, max) { return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text; }

  function renderDebate() {
    const points = story.debate.filter((d) => matches(d.t * 1000, d.tp, d.o) && d.c > 0);
    const hot = [...points].filter((d) => d.p >= 100).sort((a, b) => b.c / b.p - a.c / a.p)[0];
    const plot = setChart(
      "debate",
      hot ? `Tranh luận gay gắt nhất: “${truncate(hot.n, 70)}”` : "Chưa có thảo luận nào khớp bộ lọc",
      hot ? `Bài này có ${(hot.c / hot.p).toFixed(1).replace(".", ",")} bình luận trên mỗi điểm. Mỗi chấm là một bài thảo luận trên Hacker News trong ${rangeLabel()}; cả hai trục theo thang log. Bấm chấm để mở thảo luận.` : "",
    );
    setTable("debate", ["Bài", "Điểm", "Bình luận"], points.map((d) => [d.n, d.p, d.c]));
    if (!points.length) return;

    const legend = el("div", "legend");
    for (const [cls, text] of [["key-peak", "Bình luận nhiều hơn điểm"], ["key-mute", "Còn lại"]]) {
      const item = el("span");
      item.append(el("i", cls), document.createTextNode(text));
      legend.append(item);
    }
    plot.append(legend);

    const width = Math.max(280, plot.clientWidth);
    const compact = width < 480;
    const height = compact ? 300 : 340;
    const m = { top: 12, right: 14, bottom: 40, left: 46 };
    const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Điểm và số bình luận của các bài trên Hacker News" });
    const xMax = Math.max(...points.map((d) => d.p)) * 1.15;
    const yMax = Math.max(...points.map((d) => d.c)) * 1.2;
    const xMin = 50;
    const yMin = Math.max(1, Math.min(...points.map((d) => d.c)) * 0.8);
    const x = (v) => m.left + ((Math.log10(Math.max(v, xMin)) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * (width - m.left - m.right);
    const y = (v) => height - m.bottom - ((Math.log10(Math.max(v, yMin)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * (height - m.top - m.bottom);

    for (const tick of [10, 30, 100, 300, 1000, 3000]) {
      if (tick >= yMin && tick <= yMax) {
        svg.append(svgEl("line", { x1: m.left, x2: width - m.right, y1: y(tick), y2: y(tick), class: "grid" }));
        const label = svgEl("text", { x: m.left - 8, y: y(tick) + 4, "text-anchor": "end", class: "tick" });
        label.textContent = fmt(tick);
        svg.append(label);
      }
      if (tick >= xMin && tick <= xMax) {
        svg.append(svgEl("line", { y1: m.top, y2: height - m.bottom, x1: x(tick), x2: x(tick), class: "grid" }));
        const label = svgEl("text", { x: x(tick), y: height - m.bottom + 18, "text-anchor": "middle", class: "tick" });
        label.textContent = fmt(tick);
        svg.append(label);
      }
    }
    const xTitle = svgEl("text", { x: width - m.right, y: height - 6, "text-anchor": "end", class: "tick" });
    xTitle.textContent = "Điểm →";
    const yTitle = svgEl("text", { x: m.left - 38, y: m.top + 2, class: "tick" });
    yTitle.textContent = "Bình luận ↑";
    svg.append(xTitle, yTitle);

    // Comments = points: above this line a story draws more argument than approval.
    const lineMin = Math.max(xMin, yMin);
    const lineMax = Math.min(xMax, yMax);
    if (lineMax > lineMin) {
      svg.append(svgEl("line", { x1: x(lineMin), y1: y(lineMin), x2: x(lineMax), y2: y(lineMax), class: "ref" }));
    }

    const sorted = [...points].sort((a, b) => (a.c > a.p) - (b.c > b.p));
    for (const d of sorted) {
      const link = svgEl("a", { href: /^https?:\/\//i.test(d.u) ? d.u : "#", target: "_blank", rel: "noopener noreferrer", "data-tip": "", "aria-label": `${d.n}: ${d.p} điểm, ${d.c} bình luận` });
      tip(link, `${fmt(d.c)} bình luận · ${fmt(d.p)} điểm`, d.n, "Bấm để mở thảo luận");
      link.append(svgEl("circle", { cx: x(d.p), cy: y(d.c), r: 12, class: "hit" }));
      link.append(svgEl("circle", { cx: x(d.p), cy: y(d.c), r: d === hot ? 7 : 5, class: `dot-mark${d.c > d.p ? " is-peak" : ""}${d === hot ? " is-hot" : ""}` }));
      svg.append(link);
    }
    if (hot && !compact) {
      const left = x(hot.p) > width * 0.6;
      const note = svgEl("text", { x: x(hot.p) + (left ? -12 : 12), y: y(hot.c) + 4, "text-anchor": left ? "end" : "start", class: "note-label" });
      note.textContent = truncate(hot.n, 42);
      svg.append(note);
    }
    plot.append(svg);
  }

  // ── 04 Timeline: small multiples on one shared scale, with a synced crosshair ─
  const TIMELINE_VIEWS = {
    topics: { label: "Chủ đề", state: "topic" },
    orgs: { label: "Công ty", state: "org" },
    sectors: { label: "Ngành", state: "sector" },
  };
  const timeline = { data: null, view: "topics", zoom: 90, bucket: null };

  function parseDay(s) { return Math.floor(Date.parse(`${s}T00:00:00Z`) / DAY); }

  function bucketing(spanDays) {
    if (spanDays <= 60) return { size: 1, unit: "ngày" };
    if (spanDays <= 400) return { size: 7, unit: "tuần" };
    return { size: 30, unit: "tháng" };
  }

  function timelineSeries() {
    const h = timeline.data;
    const first = parseDay(h.start);
    const last = today;
    const from = timeline.zoom ? Math.max(first, last - timeline.zoom + 1) : first;
    const span = last - from + 1;
    const { size, unit } = bucketing(span);
    const count = Math.ceil(span / size);
    const index = (day) => Math.floor((day - from) / size);
    const labels = story[timeline.view];
    const rollup = h[timeline.view] || [];
    const series = labels.map((l) => ({ key: l.key, label: l.label, values: new Array(count).fill(0), total: 0 }));
    const byKey = new Map(series.map((s) => [s.key, s]));
    for (const [d, k, c] of rollup) {
      const day = parseDay(d);
      const s = byKey.get(k);
      if (!s || day < from || day > last) continue;
      s.values[index(day)] += c;
      s.total += c;
    }
    const buckets = Array.from({ length: count }, (_, i) => from + i * size);
    return { series: series.sort((a, b) => b.total - a.total), buckets, size, unit, span };
  }

  /** Compares the later half of the window with the earlier half. */
  function biggestRise(series) {
    let best = null;
    for (const s of series) {
      const mid = Math.floor(s.values.length / 2);
      const before = s.values.slice(0, mid).reduce((a, b) => a + b, 0);
      const after = s.values.slice(mid).reduce((a, b) => a + b, 0);
      if (before + after < 8) continue;
      const change = after - before;
      if (!best || change > best.change) best = { label: s.label, change, before, after };
    }
    return best;
  }

  function renderTimeline() {
    const root = document.getElementById("timeline");
    if (!root) return;
    if (!timeline.data) {
      setChart("timeline", "Đang tải dòng thời gian…", "");
      return;
    }
    const start = parseDay(timeline.data.start);
    const collected = today - start + 1;
    const { series, buckets, size, unit, span } = timelineSeries();
    const rise = biggestRise(series);
    const VIEW = TIMELINE_VIEWS[timeline.view];
    const kind = VIEW.label;
    const ready = buckets.length >= 3;
    const plot = setChart(
      "timeline",
      !ready ? `Dòng thời gian bắt đầu từ ${dayLabel(start)}`
        : rise && rise.change > 0 ? `${rise.label} đang tăng: ${fmt(rise.before)} lên ${fmt(rise.after)} tin so với nửa đầu giai đoạn`
        : `${kind} ổn định trong ${span} ngày qua, chưa có bứt phá rõ rệt`,
      ready ? `Mỗi điểm là một ${unit}, tính từ ${dayLabel(start)}. Các ô dùng chung một thang đo nên so sánh trực tiếp được. Bấm vào một ô để lọc cả trang.`
        : `Đã có ${collected} ngày dữ liệu. Xu hướng sẽ rõ dần sau mỗi ngày.`,
    );

    const controls = el("div", "tl-controls");
    const viewTabs = el("div", "tabs");
    for (const [key, { label }] of Object.entries(TIMELINE_VIEWS)) {
      const b = el("button", "tab", label);
      b.type = "button";
      b.dataset.tlView = key;
      b.setAttribute("aria-selected", String(timeline.view === key));
      viewTabs.append(b);
    }
    const zoomTabs = el("div", "tabs");
    for (const [key, label] of [[30, "30 ngày"], [90, "90 ngày"], [365, "1 năm"], [0, "Tất cả"]]) {
      const b = el("button", "tab", label);
      b.type = "button";
      b.dataset.tlZoom = String(key);
      b.setAttribute("aria-selected", String(timeline.zoom === key));
      zoomTabs.append(b);
    }
    controls.append(viewTabs, zoomTabs);
    plot.append(controls);

    const visible = series.filter((s) => s.total > 0);
    setTable("timeline", [kind, "Tổng"], visible.map((s) => [s.label, s.total]));
    if (!visible.length) return;

    const max = Math.max(1, ...visible.flatMap((s) => s.values));
    const grid = el("div", `tl-grid${ready ? "" : " is-early"}`);
    const panelW = Math.max(150, Math.min(320, (plot.clientWidth - 24) / Math.max(1, Math.floor(plot.clientWidth / 240))));
    const W = Math.round(panelW - 24);
    const H = 72;
    const x = (i) => (buckets.length === 1 ? W / 2 : (i / (buckets.length - 1)) * (W - 8) + 4);
    const y = (v) => H - 4 - (v / max) * (H - 12);
    const active = state[VIEW.state];
    const crosshairs = [];

    for (const s of visible) {
      const panel = el("button", "tl-panel");
      panel.type = "button";
      panel.dataset[VIEW.state] = s.key;
      panel.setAttribute("aria-pressed", String(active === s.key));
      panel.classList.toggle("is-dim", !!active && active !== s.key);
      const head = el("span", "tl-head");
      head.append(el("span", "tl-name", s.label), el("span", "tl-total", fmt(s.total)));
      const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
      svg.append(svgEl("line", { x1: 0, x2: W, y1: H - 4, y2: H - 4, class: "ref" }));
      if (buckets.length > 1) {
        const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
        svg.append(svgEl("polygon", { points: `${x(0)},${H - 4} ${pts.join(" ")} ${x(buckets.length - 1)},${H - 4}`, class: "tl-area" }));
        svg.append(svgEl("polyline", { points: pts.join(" "), class: "tl-line" }));
      }
      const peakIdx = s.values.indexOf(Math.max(...s.values));
      svg.append(svgEl("circle", { cx: x(peakIdx), cy: y(s.values[peakIdx]), r: 4, class: "dot-mark is-peak" }));
      const hair = svgEl("line", { y1: 2, y2: H - 4, x1: -10, x2: -10, class: "tl-hair" });
      svg.append(hair);
      crosshairs.push(hair);
      panel.append(head, svg);
      panel._series = s;
      panel.addEventListener("pointermove", (event) => {
        const box = svg.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        const i = Math.round(ratio * (buckets.length - 1));
        for (const h of crosshairs) { h.setAttribute("x1", x(i)); h.setAttribute("x2", x(i)); }
        panel.dataset.tip = "";
        const label = size === 1 ? dayLabel(buckets[i]) : `${unit} từ ${dayLabel(buckets[i])}`;
        tip(panel, `${fmt(s.values[i])} tin`, `${s.label} · ${label}`, active === s.key ? "Bấm để bỏ lọc" : "Bấm để lọc cả trang");
      });
      panel.addEventListener("pointerleave", () => {
        for (const h of crosshairs) { h.setAttribute("x1", -10); h.setAttribute("x2", -10); }
      });
      panel.setAttribute("aria-label", `${s.label}: ${s.total} tin`);
      grid.append(panel);
    }
    plot.append(grid);

    const staying = timeline.data.staying.filter((r) => r[2] >= 2);
    if (staying.length) {
      const box = el("div", "tl-staying");
      box.append(el("h4", "", "Dự án trụ hạng lâu nhất"));
      const list = el("ol");
      for (const [title, url, days] of staying.slice(0, 5)) {
        const li = el("li");
        const a = el("a", "", title);
        a.href = /^https?:\/\//i.test(url) ? url : "#";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.append(a, el("span", "", `${days} ngày`));
        list.append(li);
      }
      box.append(list);
      plot.append(box);
    }
  }

  // ── 07 Sectors: banking stays highlighted whatever its rank ───────────────
  function renderSectors() {
    const items = slice({ sector: true });
    const counts = story.sectors.map((s, i) => ({ ...s, count: items.filter((p) => p[4].includes(i)).length }))
      .filter((s) => s.count > 0 || s.key === "banking")
      .sort((a, b) => b.count - a.count);
    const bank = counts.find((s) => s.key === "banking");
    const total = counts.reduce((sum, s) => sum + s.count, 0);
    const plot = setChart(
      "sectors",
      bank?.count ? `Ngân hàng & tài chính có ${fmt(bank.count)} tin ứng dụng AI, chiếm ${Math.round((bank.count / total) * 100)}% tin theo ngành` : "Chưa có tin ứng dụng AI theo ngành trong khoảng này",
      `Số tin trong ${rangeLabel()}. Ngân hàng được theo dõi sát hơn các ngành khác, nên so sánh giữa các ngành chỉ mang tính tham khảo. Bấm vào một ngành để xem danh sách.`,
    );
    const max = Math.max(1, ...counts.map((s) => s.count));
    const list = el("div", "hbars hbars-wide");
    for (const s of counts) {
      const row = el("button", "hbar");
      row.type = "button";
      row.dataset.sector = s.key;
      row.dataset.tip = "";
      row.setAttribute("aria-pressed", String(state.sector === s.key));
      row.classList.toggle("is-dim", !!state.sector && state.sector !== s.key);
      tip(row, `${fmt(s.count)} tin`, s.label, state.sector === s.key ? "Bấm để bỏ lọc" : "Bấm để lọc cả trang");
      const fill = el("span", `hbar-fill${s.key === "banking" ? " is-peak" : ""}`);
      const track = el("span", "hbar-track");
      track.append(fill);
      animateSize(fill, `sector-${s.key}`, "width", `${(s.count / max) * 100}%`);
      row.append(el("span", "hbar-name", s.label), track, el("span", "hbar-value", fmt(s.count)));
      list.append(row);
    }
    plot.append(list);
    setTable("sectors", ["Ngành", "Số tin"], counts.map((s) => [s.label, s.count]));
  }

  // ── 08 Banking: what banks use AI for, and which banks are named ──────────
  function bankingScope() {
    return story.banking.rows.filter(([t]) => (state.day !== null ? dayOf(t * 1000) === state.day : t * 1000 >= now - state.range * DAY));
  }

  function openBanking(theme, bank) {
    const { themes, banks } = story.banking;
    const ti = theme ? themes.findIndex((t) => t.key === theme) : -1;
    const bi = bank ? banks.indexOf(bank) : -1;
    const rows = bankingScope().filter((r) => (ti < 0 || r[1].includes(ti)) && (bi < 0 || r[2].includes(bi)));
    const label = ti >= 0 ? `Ngân hàng · ${themes[ti].label}` : `Ngân hàng · ${bank}`;
    openDrawer(label, rangeLabel(), rows.map((r) => ({ t: r[0] * 1000, n: r[3], u: r[4], s: story.sources[r[5]] || "" })));
  }

  function renderBanking() {
    const { themes, banks } = story.banking;
    const scoped = bankingScope();
    const themeCounts = themes.map((t, i) => ({ ...t, count: scoped.filter((r) => r[1].includes(i)).length }))
      .filter((t) => t.count > 0).sort((a, b) => b.count - a.count);
    const bankCounts = banks.map((label, i) => ({ label, count: scoped.filter((r) => r[2].includes(i)).length }))
      .filter((b) => b.count > 0).sort((a, b) => b.count - a.count);
    const topTheme = themeCounts[0];
    const plot = setChart(
      "banking",
      topTheme ? `${topTheme.label} là hướng ứng dụng được nhắc nhiều nhất, với ${fmt(topTheme.count)}/${fmt(scoped.length)} tin` : `${fmt(scoped.length)} tin về AI trong ngân hàng, chưa rõ hướng nổi bật`,
      `Trong ${rangeLabel()}. Một tin có thể thuộc nhiều hướng ứng dụng. Bấm vào một hướng hoặc một ngân hàng để xem danh sách.`,
    );
    const split = el("div", "bank-split");
    const left = el("div");
    left.append(el("h4", "bank-sub", "Hướng ứng dụng"));
    const max = Math.max(1, ...themeCounts.map((t) => t.count));
    const list = el("div", "hbars hbars-wide");
    themeCounts.forEach((t, i) => {
      const row = el("button", "hbar");
      row.type = "button";
      row.dataset.bankTheme = t.key;
      const fill = el("span", `hbar-fill${i === 0 ? " is-peak" : ""}`);
      const track = el("span", "hbar-track");
      track.append(fill);
      animateSize(fill, `theme-${t.key}`, "width", `${(t.count / max) * 100}%`);
      row.append(el("span", "hbar-name", t.label), track, el("span", "hbar-value", fmt(t.count)));
      list.append(row);
    });
    left.append(list);
    const right = el("div");
    right.append(el("h4", "bank-sub", "Ngân hàng được nhắc tên"));
    if (bankCounts.length) {
      const names = el("ul", "bank-names");
      for (const b of bankCounts.slice(0, 8)) {
        const li = el("li");
        const button = el("button", "bank-name");
        button.type = "button";
        button.dataset.bank = b.label;
        button.append(el("span", "", b.label), el("span", "bank-count", fmt(b.count)));
        li.append(button);
        names.append(li);
      }
      right.append(names);
    } else {
      right.append(el("p", "empty", "Chưa có ngân hàng nào được nhắc tên trong khoảng này."));
    }
    split.append(left, right);
    plot.append(split);
    setTable("banking", ["Hướng ứng dụng", "Số tin"], themeCounts.map((t) => [t.label, t.count]));
  }

  // ── Lists, KPIs and filter chips ──────────────────────────────────────────
  function rowMatches(row) {
    const topics = row.dataset.topics.split(" ");
    const orgs = (row.dataset.orgs || "").split(" ");
    const t = Number(row.dataset.t);
    if (state.day !== null) { if (dayOf(t) !== state.day) return false; }
    else if (t < now - state.range * DAY) return false;
    if (state.topic && !topics.includes(state.topic)) return false;
    if (state.org && !orgs.includes(state.org)) return false;
    if (state.sector && !(row.dataset.sectors || "").split(" ").includes(state.sector)) return false;
    return true;
  }

  function renderLists() {
    let mustCount = 0;
    $$("[data-lane]").forEach((lane, index) => {
      const showAll = lane.hasAttribute("data-all") || state.expanded.has(index);
      let matched = 0;
      for (const row of $$(".row", lane)) {
        const ok = rowMatches(row);
        if (ok) matched += 1;
        row.hidden = !ok || (!showAll && matched > LANE_LIMIT);
        const rank = $(".rank", row);
        if (rank && ok) rank.textContent = String(matched).padStart(2, "0");
      }
      if (lane.hasAttribute("data-all")) mustCount = matched;
      $(".empty", lane).hidden = matched > 0;
      const more = $(".more", lane);
      if (more) {
        const extra = matched - LANE_LIMIT;
        more.hidden = extra <= 0;
        more.textContent = showAll ? "Thu gọn" : `Xem thêm ${extra} mục`;
        more.dataset.laneIndex = String(index);
      }
    });
    const mustKpi = $("#kpi-must");
    if (mustKpi) mustKpi.textContent = String(mustCount);
  }

  function renderKpis() {
    const items = $("#kpi-items");
    if (items && story) items.textContent = fmt(slice().length);
    const range = $("[data-kpi-range]");
    if (range) range.textContent = rangeLabel();
  }

  function renderChips() {
    const box = $("#active-filters");
    box.replaceChildren();
    const add = (label, clear) => {
      const chip = el("button", "chip", `${label} ×`);
      chip.type = "button";
      chip.setAttribute("aria-label", `Bỏ lọc ${label}`);
      chip.addEventListener("click", () => { clear(); render(); });
      box.append(chip);
    };
    if (!story) return;
    if (state.day !== null) add(`Ngày ${dayLabel(state.day)}`, () => { state.day = null; });
    if (state.topic) add(story.topics[topicIndex(state.topic)].label, () => { state.topic = null; });
    if (state.org) add(story.orgs[orgIndex(state.org)].label, () => { state.org = null; });
    if (state.sector) add(story.sectors[sectorIndex(state.sector)].label, () => { state.sector = null; });
  }

  function render() {
    for (const btn of $$("[data-range]")) btn.setAttribute("aria-pressed", String(state.day === null && Number(btn.dataset.range) === state.range));
    if (story) {
      renderFlow();
      renderOrgs();
      renderHeat();
      renderTimeline();
      renderDebate();
      renderSectors();
      renderBanking();
    }
    renderKpis();
    renderLists();
    renderChips();
    tooltip.hidden = true;
  }

  // ── Unread ────────────────────────────────────────────────────────────────
  const lastVisit = Number(store.get(KEYS.visit)) || 0;
  let baseline = Number(store.get(KEYS.baseline)) || 0;
  if (!lastVisit) baseline = now; // First visit: everything is new, so mark nothing.
  else if (now - lastVisit > SESSION_GAP) baseline = lastVisit;
  store.set(KEYS.visit, now);
  store.set(KEYS.baseline, baseline);

  function paintUnread() {
    const seen = new Set();
    for (const node of $$("[data-seen]")) {
      const isNew = Number(node.dataset.seen) > baseline;
      node.classList.toggle("is-new", isNew);
      const href = isNew ? $("a", node)?.href : null;
      if (href) seen.add(href);
    }
    $("#unread").hidden = seen.size === 0;
    $("#unread-count").textContent = String(seen.size);
  }

  // ── Events ────────────────────────────────────────────────────────────────
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const { range, topic, org, sector, day, tab, laneIndex, tlView, tlZoom, bankTheme, bank } = target.dataset;
    if (target.classList.contains("chip")) return; // Chips handle themselves.
    if (target.id === "drawer-close") { closeDrawer(); return; }
    if (target.id === "kpi-items-button") { openSelection(); return; }
    if (bankTheme || bank) { openBanking(bankTheme, bank); return; }
    const fromTimeline = !!target.closest(".tl-panel");
    if (tlView) {
      timeline.view = tlView;
      renderTimeline();
      return;
    }
    if (tlZoom !== undefined) {
      timeline.zoom = Number(tlZoom);
      renderTimeline();
      return;
    }
    if (range) {
      state.range = Number(range);
      state.day = null;
      store.set(KEYS.range, state.range);
    } else if (tab) {
      state.tab = tab;
      renderMomentum();
      return;
    } else if (topic && day) {
      const same = state.topic === topic && state.day === Number(day);
      state.topic = same ? null : topic;
      state.day = same ? null : Number(day);
    } else if (topic) {
      state.topic = state.topic === topic ? null : topic;
    } else if (org) {
      state.org = state.org === org ? null : org;
    } else if (sector) {
      state.sector = state.sector === sector ? null : sector;
    } else if (day) {
      state.day = state.day === Number(day) ? null : Number(day);
    } else if (target.classList.contains("more")) {
      const index = Number(laneIndex);
      if (state.expanded.has(index)) state.expanded.delete(index);
      else state.expanded.add(index);
      renderLists();
      return;
    } else if (target.id === "mark-read") {
      baseline = Date.now();
      store.set(KEYS.baseline, baseline);
      paintUnread();
      return;
    } else if (target.id === "theme-toggle") {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === "dark"
        : matchMedia("(prefers-color-scheme: dark)").matches;
      const next = dark ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      store.set(KEYS.theme, next);
      return;
    } else {
      return;
    }
    render();
    // A selection opens its stories; clearing it closes them.
    const selected = (topic && state.topic) || (org && state.org) || (sector && state.sector) || (day && state.day !== null);
    if (!selected) closeDrawer();
    else openSelection({
      outsideOnly: !!org && !fromTimeline,
      note: fromTimeline ? "Danh sách gồm tin trong 14 ngày gần nhất" : "",
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer.hidden) closeDrawer();
  });

  // The HTML is cached at the edge, so recompute ages against this viewer's clock.
  for (const node of $$("time[data-t]")) node.textContent = relative(Number(node.dataset.t));

  // The scatter is drawn in real pixels, so it needs a redraw when its width changes.
  if (story) {
    let lastWidth = 0;
    const debatePlot = $("#debate [data-plot]");
    const observer = new ResizeObserver(() => {
      if (Math.abs(debatePlot.clientWidth - lastWidth) > 8) {
        lastWidth = debatePlot.clientWidth;
        renderDebate();
        renderTimeline();
      }
    });
    observer.observe(debatePlot);
    renderMomentum();
    // History grows for years, so it loads separately and never slows the first paint.
    fetch("/api/history.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          timeline.data = data;
          renderTimeline();
        } else {
          document.getElementById("timeline").hidden = true;
        }
      })
      .catch(() => { document.getElementById("timeline").hidden = true; });
  }

  paintUnread();
  render();
})();
