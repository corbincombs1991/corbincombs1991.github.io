const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const isPagesRun = run => run.path === 'dynamic/pages/pages-build-deployment';

export async function requestPagesBuild(api, revision, {
  now = Date.now,
  sleep = delay,
  timeoutMs = 12 * 60 * 1000,
  pollMs = 10000,
} = {}) {
  // Legacy /pages/builds can report errored even after the native Pages Actions
  // workflow succeeds. Track that workflow instead, excluding earlier runs of
  // this SHA so a manual rebuild cannot pass on an old deployment's success.
  const endpoint = `/actions/runs?head_sha=${encodeURIComponent(revision)}&per_page=100`;
  const previous = await api(endpoint);
  const previousIds = new Set(previous.workflow_runs.map(run => run.id));
  await api('/pages/builds', 'POST');
  console.log(`Requested existing Pages pipeline for ${revision}.`);
  const deadline = now() + timeoutMs;
  let latest;
  while (now() < deadline) {
    const response = await api(endpoint);
    latest = response.workflow_runs
      .filter(run => isPagesRun(run) && run.head_sha === revision && !previousIds.has(run.id))
      .sort((a, b) => b.id - a.id)[0];
    if (latest?.status === 'completed') {
      if (latest.conclusion === 'success') return;
      // Requesting a rebuild can cancel the automatically triggered Pages run
      // before its replacement appears in the list. Keep waiting for that run.
      if (latest.conclusion !== 'cancelled') {
        throw new Error(`Pages workflow failed: ${latest.conclusion || 'unknown conclusion'}. See ${latest.html_url}`);
      }
    }
    await sleep(pollMs);
  }
  const lastStatus = latest
    ? ` Last observed Pages workflow: ${latest.html_url} (${latest.status}${latest.conclusion ? `/${latest.conclusion}` : ''}).`
    : ' No new Pages workflow was observed.';
  throw new Error(`Timed out waiting for Pages revision ${revision}.${lastStatus}`);
}
