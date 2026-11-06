import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tooling = new URL('./', import.meta.url);
const sites = [
  { variant: 'current', source: '_afterglow', output: 'afterglowvintage' },
  { variant: 'original', source: '_afterglow-original', output: 'afterglowvintage-original' },
  { variant: 'retro', source: '_afterglow-90s', output: 'afterglowvintage-90s' },
];

async function tree(directory) {
  const result = {};
  for (const item of await readdir(directory, { withFileTypes: true })) {
    result[item.name] = item.isDirectory()
      ? await tree(path.join(directory, item.name))
      : await readFile(path.join(directory, item.name), 'utf8');
  }
  return result;
}

async function site(root, directory, base, asset, label) {
  const output = path.join(root, directory);
  await mkdir(path.join(output, 'assets'), { recursive: true });
  await writeFile(path.join(output, `assets/${asset}`), `/* ${label} */ body { color: black; }`);
  await writeFile(path.join(output, 'index.html'), `<!doctype html><html><head>
    <title>${label}</title><meta name="description" content="${label}">
    <link rel="canonical" href="https://corbincombs.com${base}">
    <meta property="og:url" content="https://corbincombs.com${base}">
    <link rel="stylesheet" href="${base}assets/${asset}">
    </head><body>${label}</body></html>`);
}

test('three sequential variant syncs retire tracked assets without changing other sites', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afterglow-sync-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  await mkdir(path.join(root, '_afterglow-deploy'));
  for (const name of ['files.mjs', 'sync.mjs']) {
    await cp(new URL(name, tooling), path.join(root, '_afterglow-deploy', name));
  }
  await writeFile(path.join(root, 'CNAME'), 'corbincombs.com\n');
  await writeFile(path.join(root, 'index.html'), '<h1>Existing homepage</h1>');
  await mkdir(path.join(root, 'unrelated'));
  await writeFile(path.join(root, 'unrelated', 'notes.txt'), 'Keep this content byte-for-byte.\n');
  for (const { variant, output } of sites) {
    await site(root, output, `/${output}/`, `old-${variant}.css`, `Previous ${variant}`);
  }
  git('init', '--quiet');
  git('add', '--all');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture baseline');
  for (const { variant, source, output } of sites) {
    await site(root, `${source}/dist`, `/${output}/`, `new-${variant}.css`, `Next ${variant}`);
  }

  const run = variant => execFileSync(process.execPath, ['_afterglow-deploy/sync.mjs'], {
    cwd: root,
    env: { ...process.env, AFTERGLOW_VARIANT: variant },
    encoding: 'utf8',
  });
  for (const selected of sites) {
    const others = sites.filter(item => item !== selected);
    const before = await Promise.all(others.map(item => tree(path.join(root, item.output))));
    // Do not stage between syncs: git still tracks every retired asset.
    run(selected.variant);
    assert.deepEqual(await tree(path.join(root, selected.output)), await tree(path.join(root, selected.source, 'dist')));
    assert.ok(git('ls-files', '--deleted').split('\n').includes(`${selected.output}/assets/old-${selected.variant}.css`));
    for (const [index, item] of others.entries()) {
      assert.deepEqual(await tree(path.join(root, item.output)), before[index], `${selected.variant} sync changed ${item.variant}`);
    }
    assert.equal(git('diff', '--', 'CNAME', 'index.html', 'unrelated'), '');
  }
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), '<h1>Existing homepage</h1>');
  assert.equal(await readFile(path.join(root, 'unrelated/notes.txt'), 'utf8'), 'Keep this content byte-for-byte.\n');
});

test('invalid variant selectors are rejected before accessing a publishing directory', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afterglow-selector-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '_afterglow-deploy'));
  for (const name of ['files.mjs', 'sync.mjs']) {
    await cp(new URL(name, tooling), path.join(root, '_afterglow-deploy', name));
  }
  const before = await tree(root);
  for (const variant of ['', 'unknown', '../../', '/afterglowvintage-90s/', '__proto__', 'constructor']) {
    const result = spawnSync(process.execPath, ['_afterglow-deploy/sync.mjs'], {
      cwd: root,
      env: { ...process.env, AFTERGLOW_VARIANT: variant },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, `Selector ${JSON.stringify(variant)} was not rejected`);
    assert.match(result.stderr, /Unknown AFTERGLOW_VARIANT:/);
    assert.deepEqual(await tree(root), before);
  }
});
