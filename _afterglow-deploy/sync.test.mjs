import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tooling = new URL('./', import.meta.url);

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

test('sequential variant syncs retire tracked assets without changing the other site', async t => {
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
  await site(root, 'afterglowvintage', '/afterglowvintage/', 'old-current.css', 'Previous current');
  await site(root, 'afterglowvintage-original', '/afterglowvintage-original/', 'old-original.css', 'Previous original');
  git('init', '--quiet');
  git('add', '--all');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture baseline');
  await site(root, '_afterglow/dist', '/afterglowvintage/', 'new-current.css', 'Next current');
  await site(root, '_afterglow-original/dist', '/afterglowvintage-original/', 'new-original.css', 'Next original');

  const run = variant => execFileSync(process.execPath, ['_afterglow-deploy/sync.mjs'], {
    cwd: root,
    env: { ...process.env, AFTERGLOW_VARIANT: variant },
    encoding: 'utf8',
  });
  const originalBefore = await tree(path.join(root, 'afterglowvintage-original'));
  run('current');
  assert.deepEqual(await tree(path.join(root, 'afterglowvintage-original')), originalBefore);
  assert.deepEqual(await tree(path.join(root, 'afterglowvintage')), await tree(path.join(root, '_afterglow/dist')));
  assert.match(git('ls-files', '--deleted'), /afterglowvintage\/assets\/old-current\.css/);
  const currentAfter = await tree(path.join(root, 'afterglowvintage'));

  // Do not stage between syncs: git still tracks the retired current asset.
  run('original');
  assert.deepEqual(await tree(path.join(root, 'afterglowvintage')), currentAfter);
  assert.deepEqual(await tree(path.join(root, 'afterglowvintage-original')), await tree(path.join(root, '_afterglow-original/dist')));
  assert.match(git('ls-files', '--deleted'), /afterglowvintage-original\/assets\/old-original\.css/);
  assert.equal(git('diff', '--', 'CNAME', 'index.html', 'unrelated'), '');
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), '<h1>Existing homepage</h1>');
  assert.equal(await readFile(path.join(root, 'unrelated/notes.txt'), 'utf8'), 'Keep this content byte-for-byte.\n');
});
