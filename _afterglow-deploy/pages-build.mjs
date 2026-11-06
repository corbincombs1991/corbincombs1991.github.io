const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function requestPagesBuild(api, revision, {
  now = Date.now,
  sleep = delay,
  timeoutMs = 12 * 60 * 1000,
  pollMs = 10000,
} = {}) {
  // /builds/latest can keep returning the superseded build while the requested
  // build is queued. Two builds of the same commit still have different URLs.
  const previous = await api('/builds/latest');
  await api('/builds', 'POST');
  console.log(`Requested existing Pages pipeline for ${revision}.`);
  const deadline = now() + timeoutMs;
  let latest;
  while (now() < deadline) {
    latest = await api('/builds/latest');
    if (latest.url !== previous.url && latest.commit === revision) {
      if (latest.status === 'built') return;
      if (latest.status === 'errored') {
        throw new Error(`Pages build failed: ${latest.error?.message || 'see Pages build logs'}`);
      }
    }
    await sleep(pollMs);
  }
  const lastStatus = latest ? ` Last observed build: ${latest.url} (${latest.status}).` : '';
  throw new Error(`Timed out waiting for Pages revision ${revision}.${lastStatus}`);
}
