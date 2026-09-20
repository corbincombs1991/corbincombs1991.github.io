/* Market Notes: published feed, calendar dates, filters, and linked chart. */
"use strict";

const STANCES = ["VERY BEARISH", "BEARISH", "NEUTRAL", "BULLISH", "VERY BULLISH"];
const COLORS = ["var(--bear)", "var(--bear-soft)", "var(--neut)", "var(--bull-soft)", "var(--bull)"];
const CLASSES = ["very-bear", "bear", "neut", "bull", "very-bull"];

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function fmtDate(value) {
  const date = calendarDate(value);
  return date ? new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
  }).format(date) : String(value || "Date unavailable");
}

function stance(value) {
  const label = String(value || "").toUpperCase();
  return STANCES.includes(label) ? label : "NEUTRAL";
}

function score(value) { return (STANCES.indexOf(stance(value)) - 2) / 2; }
function sentimentClass(value) { return CLASSES[STANCES.indexOf(stance(value))]; }
function sentimentColor(value) { return COLORS[STANCES.indexOf(stance(value))]; }

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function sourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname) ? url.href : null;
  } catch (_) { return null; }
}

function filterItems(items, { query = "", year = "", sentiment = "" } = {}) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    const haystack = [item.title, item.reason, item.summary].join(" ").toLowerCase();
    return (!year || item.date.slice(0, 4) === year) &&
      (!sentiment || stance(item.sentiment) === sentiment) && terms.every(term => haystack.includes(term));
  });
}

function feedStatus(data, items) {
  const count = items.length;
  const parts = [`${count} published ${count === 1 ? "summary" : "summaries"}`];
  if (count) parts.push(`Latest video: ${fmtDate(items[0].date)}`);
  const generated = typeof data.generated === "string" ? new Date(data.generated) : null;
  if (generated && Number.isFinite(generated.getTime())) {
    parts.push("Feed updated: " + new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
    }).format(generated));
  }
  return parts.join(" · ");
}

function chartMarkup(items) {
  const chrono = items.slice().sort((a, b) => a.date.localeCompare(b.date));
  const W = 800, H = 260, PL = 106, PR = 28, PT = 24, PB = 36;
  const iw = W - PL - PR, ih = H - PT - PB;
  if (!chrono.length) return "";
  const first = calendarDate(chrono[0].date).getTime();
  const span = calendarDate(chrono[chrono.length - 1].date).getTime() - first;
  const x = item => PL + (span ? (calendarDate(item.date).getTime() - first) / span * iw : iw / 2);
  const y = value => PT + ih / 2 - value / 1.2 * ih / 2;
  let svg = "";
  [[1, "Very bullish"], [0.5, "Bullish"], [0, "Neutral"], [-0.5, "Bearish"], [-1, "Very bearish"]].forEach(([value, label]) => {
    svg += `<line class="grid-line${value === 0 ? " zero-line" : ""}" x1="${PL}" x2="${W - PR}" y1="${y(value)}" y2="${y(value)}"/><text x="${PL - 10}" y="${y(value) + 4}" text-anchor="end">${label}</text>`;
  });
  // Limit labels by their actual positions so irregular publication dates cannot overlap.
  let lastLabelX = -Infinity;
  chrono.forEach((item, index) => {
    const cx = x(item);
    if (cx - lastLabelX < 125 || (index < chrono.length - 1 && W - PR - cx < 90)) return;
    const date = calendarDate(item.date);
    const label = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
    svg += `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle">${esc(label)}</text>`;
    lastLabelX = cx;
  });
  const avg = chrono.map((item, i) => {
    const window = chrono.slice(Math.max(0, i - 3), i + 1);
    return window.reduce((sum, entry) => sum + score(entry.sentiment), 0) / window.length;
  });
  const trend = avg.map((value, i) => `${i ? "L" : "M"}${x(chrono[i]).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  svg += `<path class="trend" d="${trend}"/>`;
  chrono.forEach((item, index) => {
    const cx = x(item).toFixed(1), cy = y(score(item.sentiment)).toFixed(1);
    const label = `${fmtDate(item.date)} — ${stance(item.sentiment)}: ${item.title}. Read summary.`;
    svg += `<a class="chart-point" href="#summary-${item._index}" data-summary-index="${item._index}" tabindex="${index === chrono.length - 1 ? 0 : -1}" aria-label="${esc(label)}"><title>${esc(label)}</title><circle cx="${cx}" cy="${cy}" r="12" fill="transparent"/><circle class="dot ${sentimentClass(item.sentiment)}" cx="${cx}" cy="${cy}" r="5" fill="${sentimentColor(item.sentiment)}"/></a>`;
  });
  return svg;
}

async function initMarketNotes() {
  const list = document.getElementById("list");
  const feed = document.getElementById("feed-status");
  const query = document.getElementById("summary-search");
  const year = document.getElementById("summary-year");
  const sentiment = document.getElementById("summary-sentiment");
  const reset = document.getElementById("reset-filters");
  const resultCount = document.getElementById("result-count");
  const chart = document.getElementById("sentiment-chart");
  let data;
  try {
    const response = await fetch("/ciovacco-summaries.json", { cache: "no-store" });
    if (!response.ok) throw new Error("The published feed is unavailable.");
    data = await response.json();
    if (!Array.isArray(data.summaries)) throw new Error("The published feed could not be read.");
  } catch (_) {
    feed.textContent = "The published notes could not be loaded.";
    list.innerHTML = '<p class="empty">Please refresh to try again, or <a class="source-link" href="https://www.youtube.com/@ciovaccocapital" target="_blank" rel="noopener">visit Ciovacco Capital on YouTube</a>.</p>';
    return;
  }
  const items = data.summaries.filter(item => item && calendarDate(item.date)).slice()
    .sort((a, b) => b.date.localeCompare(a.date)).map((item, index) => ({ ...item, _index: index }));
  feed.textContent = feedStatus(data, items);
  if (!items.length) {
    list.innerHTML = '<p class="empty">No summaries are available yet. Check back after the next video.</p>';
    return;
  }

  [...new Set(items.map(item => item.date.slice(0, 4)))].forEach(value => {
    const option = document.createElement("option");
    option.value = option.textContent = value;
    year.append(option);
  });
  document.getElementById("filters").hidden = false;
  chart.innerHTML = chartMarkup(items);
  document.getElementById("chart").hidden = false;

  function renderList(message = "") {
    const filtered = filterItems(items, { query: query.value, year: year.value, sentiment: sentiment.value });
    const active = Boolean(query.value.trim() || year.value || sentiment.value);
    reset.hidden = !active;
    resultCount.textContent = `${message}${filtered.length} of ${items.length} summaries${active ? " match your filters" : " shown"}.`;
    list.innerHTML = filtered.length ? filtered.map(item => {
      const url = sourceUrl(item.url);
      const source = url ? `<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener">Watch the original video ↗</a>` : "";
      return `<article class="card" id="summary-${item._index}"><details><summary><div class="card-head"><div class="card-main"><h3 class="card-title">${esc(item.title)}</h3><p class="card-meta"><time datetime="${esc(item.date)}">${fmtDate(item.date)}</time></p><span class="badge ${sentimentClass(item.sentiment)}">${stance(item.sentiment)}</span>${item.reason ? `<p class="card-reason">${esc(item.reason)}</p>` : ""}</div><span class="expand-hint" aria-hidden="true">▾</span></div></summary><div class="card-body"><p class="summary-text">${esc(item.summary)}</p>${source}</div></details></article>`;
    }).join("") : '<p class="empty">No notes match these filters. Try a different keyword or clear the filters.</p>';
  }

  function clearFilters() { query.value = year.value = sentiment.value = ""; }
  query.addEventListener("input", () => renderList());
  year.addEventListener("change", () => renderList());
  sentiment.addEventListener("change", () => renderList());
  reset.addEventListener("click", () => { clearFilters(); renderList(); query.focus(); });

  function openSummary(index) {
    const id = `summary-${index}`;
    if (!document.getElementById(id)) { clearFilters(); renderList("Filters cleared. "); }
    const card = document.getElementById(id);
    if (!card) return;
    card.querySelector("details").open = true;
    card.querySelector("summary").focus({ preventScroll: true });
    card.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  chart.addEventListener("click", event => {
    const point = event.target.closest("[data-summary-index]");
    if (!point) return;
    event.preventDefault();
    openSummary(point.dataset.summaryIndex);
  });
  chart.addEventListener("keydown", event => {
    const point = event.target.closest("[data-summary-index]");
    if (!point) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault(); openSummary(point.dataset.summaryIndex); return;
    }
    const points = Array.from(chart.querySelectorAll("[data-summary-index]"));
    const index = points.indexOf(point);
    let next;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(points.length - 1, index + 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, index - 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = points.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    points.forEach((entry, i) => entry.setAttribute("tabindex", i === next ? "0" : "-1"));
    points[next].focus();
  });
  renderList();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { calendarDate, fmtDate, score, filterItems, feedStatus, chartMarkup, sourceUrl };
} else {
  initMarketNotes();
}
