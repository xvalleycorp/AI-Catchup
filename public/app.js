(() => {
  "use strict";
  const DAY = 86400000;
  const LANE_LIMIT = window.innerWidth < 720 ? 5 : 10;
  const SESSION_GAP = 30 * 60000;
  const KEYS = { range: "catchup.range", visit: "catchup.lastVisit", baseline: "catchup.baseline" };

  // Browser storage can throw or come back empty; everything below works without it.
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* per-viewer convenience only */ } },
  };

  const now = Date.now();
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  document.documentElement.classList.add("js");

  const state = {
    range: Number(store.get(KEYS.range)) || 3,
    topic: null,
    expanded: new Set(),
  };

  // Unread: a new session (30+ minutes after the last visit) moves the baseline forward.
  const lastVisit = Number(store.get(KEYS.visit)) || 0;
  let baseline = Number(store.get(KEYS.baseline)) || 0;
  if (!lastVisit) baseline = now; // First visit: everything is new, so mark nothing.
  else if (now - lastVisit > SESSION_GAP) baseline = lastVisit;
  store.set(KEYS.visit, now);
  store.set(KEYS.baseline, baseline);

  function paintUnread() {
    const seen = new Set();
    let count = 0;
    for (const el of $$("[data-seen]")) {
      const isNew = Number(el.dataset.seen) > baseline;
      el.classList.toggle("is-new", isNew);
      if (isNew) {
        const key = el.querySelector("a")?.href;
        if (key && !seen.has(key)) { seen.add(key); count += 1; }
      }
    }
    const box = document.getElementById("unread");
    if (box) {
      box.hidden = count === 0;
      document.getElementById("unread-count").textContent = String(count);
    }
  }

  function applyFilters() {
    const cutoff = now - state.range * DAY;
    $$("[data-lane]").forEach((lane, index) => {
      const showAll = lane.hasAttribute("data-all") || state.expanded.has(index);
      const rows = $$(".row", lane);
      let matched = 0;
      for (const row of rows) {
        const inRange = Number(row.dataset.t) >= cutoff;
        const inTopic = !state.topic || row.dataset.topics.split(" ").includes(state.topic);
        const ok = inRange && inTopic;
        if (ok) matched += 1;
        row.hidden = !ok || (!showAll && matched > LANE_LIMIT);
      }
      lane.querySelector(".empty").hidden = matched > 0;
      const more = lane.querySelector(".more");
      if (more) {
        const extra = matched - LANE_LIMIT;
        more.hidden = extra <= 0;
        more.textContent = showAll ? "Thu gọn" : `Xem thêm ${extra} mục`;
        more.dataset.lane = String(index);
      }
    });
    for (const btn of $$("[data-range]")) btn.setAttribute("aria-pressed", String(Number(btn.dataset.range) === state.range));
    for (const btn of $$("[data-topic]")) btn.setAttribute("aria-pressed", String(btn.dataset.topic === state.topic));
  }

  function relative(t) {
    const min = Math.max(0, Math.round((now - t) / 60000));
    if (min < 60) return `${Math.max(1, min)} phút`;
    const h = Math.round(min / 60);
    return h < 24 ? `${h} giờ` : `${Math.round(h / 24)} ngày`;
  }
  // The HTML is cached at the edge, so recompute ages against this viewer's clock.
  for (const el of $$("time[data-t]")) el.textContent = relative(Number(el.dataset.t));

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.range) {
      state.range = Number(target.dataset.range);
      store.set(KEYS.range, state.range);
    } else if (target.dataset.topic) {
      state.topic = state.topic === target.dataset.topic ? null : target.dataset.topic;
    } else if (target.classList.contains("more")) {
      const index = Number(target.dataset.lane);
      if (state.expanded.has(index)) state.expanded.delete(index);
      else state.expanded.add(index);
    } else if (target.id === "mark-read") {
      baseline = Date.now();
      store.set(KEYS.baseline, baseline);
      paintUnread();
      return;
    } else {
      return;
    }
    applyFilters();
  });

  paintUnread();
  applyFilters();
})();
