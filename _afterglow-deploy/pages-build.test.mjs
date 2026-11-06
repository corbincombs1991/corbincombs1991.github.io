import assert from 'node:assert/strict';
import test from 'node:test';
import { requestPagesBuild } from './pages-build.mjs';

const revision = 'target-revision';
const endpoint = `/actions/runs?head_sha=${revision}&per_page=100`;
const run = (id, status, conclusion = null, overrides = {}) => ({
  id,
  path: 'dynamic/pages/pages-build-deployment',
  html_url: `https://github.com/owner/repository/actions/runs/${id}`,
  status,
  conclusion,
  head_sha: revision,
  ...overrides,
});

function fixture(polls) {
  let time = 0;
  const calls = [];
  const api = async (path, method = 'GET') => {
    calls.push([path, method]);
    if (method === 'POST') {
      assert.equal(path, '/pages/builds');
      return { url: '/pages/builds/latest', status: 'queued' };
    }
    assert.equal(path, endpoint);
    assert.ok(polls.length, 'Unexpected extra workflow poll');
    return { workflow_runs: polls.shift() };
  };
  return {
    api,
    calls,
    options: {
      now: () => time,
      sleep: async milliseconds => { time += milliseconds; },
      timeoutMs: 30,
      pollMs: 10,
    },
  };
}

test('waits through a newly observed cancelled Pages run for its successful replacement', async () => {
  const cancelled = run(2, 'completed', 'cancelled');
  const { api, calls, options } = fixture([
    [run(1, 'completed', 'success', { head_sha: 'older-revision' })],
    [cancelled],
    [cancelled, run(3, 'queued')],
    [cancelled, run(3, 'completed', 'success')],
  ]);
  await requestPagesBuild(api, revision, options);
  assert.deepEqual(calls, [
    [endpoint, 'GET'],
    ['/pages/builds', 'POST'],
    [endpoint, 'GET'],
    [endpoint, 'GET'],
    [endpoint, 'GET'],
  ]);
});

test('does not accept a previous success of the same SHA or an unrelated workflow', async () => {
  const previous = run(1, 'completed', 'success');
  const unrelated = run(2, 'completed', 'success', { path: '.github/workflows/afterglow-publish.yml' });
  const { api, calls, options } = fixture([
    [previous],
    [previous, unrelated],
    [run(3, 'in_progress'), previous, unrelated],
    [run(3, 'completed', 'success'), previous, unrelated],
  ]);
  await requestPagesBuild(api, revision, options);
  assert.equal(calls.length, 5);
});

test('reports a genuine terminal failure from the new Pages workflow', async () => {
  const { api, options } = fixture([[], [run(2, 'completed', 'failure')]]);
  await assert.rejects(requestPagesBuild(api, revision, options), /Pages workflow failed: failure.*actions\/runs\/2/);
});

test('times out with diagnostics if cancellation never gets a successful replacement', async () => {
  const cancelled = run(2, 'completed', 'cancelled');
  const { api, options } = fixture([
    [],
    [run(1, 'completed', 'success', { head_sha: 'other-revision' })],
    [cancelled],
    [cancelled],
  ]);
  await assert.rejects(requestPagesBuild(api, revision, options), /Timed out waiting for Pages revision target-revision.*completed\/cancelled/);
});
