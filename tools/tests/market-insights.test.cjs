const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const viewerPath = path.resolve(__dirname, '../../market-insights/viewer.js');
const { formatDate, safeAsset, filterReports, chartMarkup, latestRequest } = require(viewerPath);
const fixture = require('../../market-insights/reports/synthetic-query-2024-01-01.json');

test('dates remain calendar-correct in US and positive-offset time zones', () => {
  for (const TZ of ['America/Indiana/Indianapolis', 'America/Los_Angeles', 'Pacific/Auckland']) {
    const result = execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(viewerPath)}).formatDate('2026-09-19'))`], { env: { ...process.env, TZ }, encoding: 'utf8' }).trim();
    assert.equal(result, 'Sep 19, 2026');
  }
  assert.equal(formatDate(null), 'Not supplied');
  assert.equal(formatDate('not a date'), 'Not supplied');
});

test('fixture lines fill available plot width on desktop and mobile', () => {
  for (const width of [760, 300]) {
    const svg = chartMarkup(fixture, width);
    const lines = [...svg.matchAll(/<polyline[^>]*points="([^"]+)"/g)];
    assert.equal(lines.length, 3);
    for (const line of lines) {
      const points = line[1].split(' ').map(point => point.split(',').map(Number));
      assert.equal(points[0][0], 45);
      assert.equal(points.at(-1)[0], width - 22);
      assert.ok(points.every(point => point.every(Number.isFinite)));
    }
    assert.match(svg, /Normalized value/);
    assert.match(svg, /Observation number/);
  }
});

test('empty, malformed and single-point chart data never create invalid SVG coordinates', () => {
  assert.match(chartMarkup({}, 300), /does not include chart values/);
  assert.match(chartMarkup({ query: { normalized: [0, 'bad'] } }, 300), /does not include chart values/);
  const svg = chartMarkup({ query: { normalized: [0] } }, 300);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  assert.match(svg, /<circle/);
});

test('match-count filtering preserves original report indices', () => {
  const reports = [{ k: 3 }, { k: 5 }, { k: 3 }];
  assert.deepEqual(filterReports(reports, '3').map(row => row.index), [0, 2]);
  assert.deepEqual(filterReports(reports, '5').map(row => row.index), [1]);
  assert.equal(filterReports(reports, '').length, 3);
  assert.equal(filterReports(reports, '8').length, 0);
});

test('sample URLs stay within the local reports directory', () => {
  assert.equal(safeAsset('reports/synthetic-query-2024-01-01.json'), 'reports/synthetic-query-2024-01-01.json');
  for (const value of ['../secret.json', 'reports/../secret.json', 'https://example.com/data.json', null]) assert.equal(safeAsset(value), null);
});

test('a late response or failure cannot replace a newer selection', async () => {
  const results = [], errors = [];
  const run = latestRequest(value => results.push(value), error => errors.push(error));
  let resolveOld, oldSignal;
  const old = run(({ signal }) => { oldSignal = signal; return new Promise(resolve => { resolveOld = resolve; }); });
  await run(async () => 'new selection');
  assert.equal(oldSignal.aborted, true);
  resolveOld('old selection');
  await old;
  assert.deepEqual(results, ['new selection']);
  let rejectOld;
  const failing = run(() => new Promise((resolve, reject) => { rejectOld = reject; }));
  await run(async () => 'newest selection');
  rejectOld(new Error('late failure'));
  await failing;
  assert.deepEqual(results, ['new selection', 'newest selection']);
  assert.deepEqual(errors, []);
  await run(async () => { throw new Error('current failure'); });
  assert.equal(errors[0].message, 'current failure');
});
