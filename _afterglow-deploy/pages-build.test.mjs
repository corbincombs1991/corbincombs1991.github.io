import assert from 'node:assert/strict';
import test from 'node:test';
import { requestPagesBuild } from './pages-build.mjs';

const revision = 'target-revision';
const build = (id, status, commit = revision) => ({
  url: `https://api.github.com/repos/owner/repository/pages/builds/${id}`,
  status,
  commit,
  error: { message: status === 'errored' ? 'Build failed' : null },
});

function fixture(builds) {
  let time = 0;
  const calls = [];
  const api = async (endpoint, method = 'GET') => {
    calls.push([endpoint, method]);
    if (method === 'POST') return { url: '/builds/latest', status: 'queued' };
    assert.ok(builds.length, 'Unexpected extra build poll');
    return builds.shift();
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

test('waits through a superseded same-revision error for the requested build', async () => {
  const { api, calls, options } = fixture([
    build(1, 'building'),
    build(1, 'errored'),
    build(2, 'building'),
    build(2, 'built'),
  ]);
  await requestPagesBuild(api, revision, options);
  assert.deepEqual(calls, [
    ['/builds/latest', 'GET'],
    ['/builds', 'POST'],
    ['/builds/latest', 'GET'],
    ['/builds/latest', 'GET'],
    ['/builds/latest', 'GET'],
  ]);
});

test('reports a terminal failure from the replacement build', async () => {
  const { api, options } = fixture([build(1, 'errored'), build(2, 'errored')]);
  await assert.rejects(requestPagesBuild(api, revision, options), /Pages build failed: Build failed/);
});

test('times out when the requested revision never gets a new successful build', async () => {
  const { api, options } = fixture([
    build(1, 'built'),
    build(1, 'built'),
    build(2, 'built', 'other-revision'),
    build(3, 'building'),
  ]);
  await assert.rejects(requestPagesBuild(api, revision, options), /Timed out waiting for Pages revision target-revision.*\(building\)/);
});
