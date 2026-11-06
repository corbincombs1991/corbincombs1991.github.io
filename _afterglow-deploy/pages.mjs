import { execFileSync } from 'node:child_process';
import { root, variants } from './files.mjs';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
if (repository !== 'corbincombs1991/corbincombs1991.github.io' || !token) {
  throw new Error('Run only in the existing domain repository with GH_TOKEN set.');
}
async function api(endpoint, method = 'GET') {
  const response = await fetch(`https://api.github.com/repos/${repository}/pages${endpoint}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Pages ${method} ${endpoint}: HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}
const settings = await api('');
if (settings.cname !== 'corbincombs.com' || settings.build_type !== 'legacy' || settings.source?.branch !== 'main' || settings.source?.path !== '/' || !settings.https_enforced) {
  throw new Error('Pages settings changed. Refusing to alter or replace the existing publishing configuration.');
}
console.log('Existing GitHub Pages source, custom domain, and HTTPS configuration verified.');
if (process.argv.includes('--request')) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  await api('/builds', 'POST');
  console.log(`Requested existing Pages pipeline for ${revision}.`);
  const deadline = Date.now() + 12 * 60 * 1000;
  let built = false;
  while (Date.now() < deadline) {
    const latest = await api('/builds/latest');
    if (latest.commit === revision && latest.status === 'built') { built = true; break; }
    if (latest.commit === revision && latest.status === 'errored') throw new Error(`Pages build failed: ${latest.error?.message || 'see Pages build logs'}`);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  if (!built) throw new Error(`Timed out waiting for Pages revision ${revision}.`);
  // Deployment/CDN propagation can lag the build status briefly.
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      for (const variant of Object.keys(variants)) {
        execFileSync(process.execPath, ['_afterglow-deploy/verify.mjs', '--production'], {
          cwd: root,
          stdio: 'inherit',
          env: { ...process.env, AFTERGLOW_VARIANT: variant },
        });
      }
      console.log('Deployment and production verification complete.');
      process.exit(0);
    } catch (error) {
      if (attempt === 11) throw error;
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}
