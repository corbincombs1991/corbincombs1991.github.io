const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const notes = require("../../js/ciovacco.js");
const scriptPath = path.resolve(__dirname, "../../js/ciovacco.js");

test("publication dates stay on the same calendar day across time zones", () => {
  for (const TZ of ["America/Indiana/Indianapolis", "America/Los_Angeles", "Pacific/Kiritimati", "UTC"]) {
    const result = spawnSync(process.execPath, ["-e", `const {fmtDate}=require(${JSON.stringify(scriptPath)}); process.stdout.write(JSON.stringify([fmtDate('2026-09-19'),fmtDate('2026-01-01'),fmtDate('2024-02-29')]));`], {
      env: { ...process.env, TZ }, encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ["Sep 19, 2026", "Jan 1, 2026", "Feb 29, 2024"], TZ);
  }
});

test("invalid calendar dates do not silently roll into another month", () => {
  for (const value of ["2026-02-29", "2026-13-01", "2026-04-31", "not a date", null]) {
    assert.equal(notes.calendarDate(value), null);
  }
  assert.equal(notes.calendarDate("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
});

const items = [
  { _index: 0, date: "2026-09-19", title: "Credit & growth", reason: "Strong credit markets", summary: "Technology leadership", sentiment: "BULLISH" },
  { _index: 1, date: "2026-09-12", title: "Inflation", reason: "Credit risks", summary: "A cautious outlook", sentiment: "BEARISH" },
  { _index: 2, date: "2025-09-26", title: "Credit outlook", reason: "Mixed signals", summary: "Technology stocks", sentiment: "NEUTRAL" }
];

test("search, year and stance filters combine and clearing restores all entries", () => {
  assert.deepEqual(notes.filterItems(items, { query: " CREDIT   technology ", year: "2026", sentiment: "BULLISH" }).map(item => item._index), [0]);
  assert.equal(notes.filterItems(items, { query: "credit", sentiment: "NEUTRAL" }).length, 1);
  assert.equal(notes.filterItems(items, { year: "2025", sentiment: "BULLISH" }).length, 0);
  assert.equal(notes.filterItems(items, { query: "  " }).length, 3);
  assert.deepEqual(notes.filterItems(items), items);
});

test("freshness uses the published entries and the feed generation timestamp", () => {
  const value = notes.feedStatus({ count: 56, generated: "2026-09-19T09:01:23-04:00" }, items);
  assert.match(value, /^3 published summaries · Latest video: Sep 19, 2026 · Feed updated:/);
  assert.doesNotMatch(value, /56 published/);
  assert.equal(notes.feedStatus({ generated: "invalid" }, []), "0 published summaries");
});

test("chart points retain their corresponding summaries and have one keyboard entry point", () => {
  const markup = notes.chartMarkup(items);
  assert.equal((markup.match(/class="chart-point"/g) || []).length, 3);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 1);
  assert.match(markup, /href="#summary-0" data-summary-index="0" tabindex="0"/);
  assert.match(markup, /Credit &amp; growth/);
  assert.ok(markup.indexOf('href="#summary-2"') < markup.indexOf('href="#summary-0"'));
  assert.doesNotMatch(markup, /NaN|Infinity/);
  assert.doesNotMatch(notes.chartMarkup([items[0]]), /NaN|Infinity/);
  assert.equal(notes.chartMarkup([]), "");
});

test("source links permit real HTTPS YouTube links only", () => {
  assert.equal(notes.sourceUrl("https://www.youtube.com/watch?v=abc"), "https://www.youtube.com/watch?v=abc");
  assert.equal(notes.sourceUrl("https://youtu.be/abc"), "https://youtu.be/abc");
  for (const value of ["javascript:alert(1)", "https://youtube.com.example.com/video", "http://youtube.com/video", null]) {
    assert.equal(notes.sourceUrl(value), null);
  }
});
