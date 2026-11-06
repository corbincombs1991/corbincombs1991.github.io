import { cp, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { root, source, destination, validate } from './files.mjs';

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
if ((await readFile(path.join(root, 'CNAME'), 'utf8')).trim() !== 'corbincombs.com') {
  throw new Error('Refusing to sync outside the existing corbincombs.com repository.');
}
if (path.resolve(git('rev-parse', '--show-toplevel').trim()) !== path.resolve(root)) {
  throw new Error('Repository root mismatch.');
}
const tracked = git('ls-files', '-z').split('\0').filter(name => name && !name.startsWith('afterglowvintage/'));
const snapshot = async () => {
  const hash = createHash('sha256');
  for (const name of tracked) {
    hash.update(name);
    hash.update(await readFile(path.join(root, name)));
  }
  return hash.digest('hex');
};
const { names, pages } = await validate(source);
const before = await snapshot();
const temporary = await mkdtemp(path.join(root, '.afterglow-sync-'));
try {
  await cp(source, path.join(temporary, 'next'), { recursive: true });
  try { await rename(destination, path.join(temporary, 'previous')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await rename(path.join(temporary, 'next'), destination); }
  catch (error) {
    await rename(path.join(temporary, 'previous'), destination).catch(() => {});
    throw error;
  }
  if (await snapshot() !== before) throw new Error('Existing content outside afterglowvintage changed.');
  console.log(`Synced ${names.length} files and ${pages.length} static pages. All ${tracked.length} existing tracked files remain byte-for-byte unchanged.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
