import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { root, source, destination, origin, base, routeFor, validate } from './files.mjs';

const production = process.argv.includes('--production');
const directory = production ? destination : source;
const { names, pages } = await validate(directory);
console.log(`Validated ${pages.length} static routes, canonical URLs, metadata, and local asset/navigation targets.`);

if (production) {
  const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');
  const checks = [
    { url: '/', file: path.join(root, 'index.html') },
    ...names.map(name => ({ url: name.endsWith('.html') ? routeFor(name) : base + name, file: path.join(directory, name) })),
  ];
  // Exact byte checks prove the new revision is live and the existing homepage is preserved.
  for (const check of checks) {
    const response = await fetch(origin + check.url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${check.url}: HTTP ${response.status}`);
    const remote = Buffer.from(await response.arrayBuffer());
    const local = await readFile(check.file);
    if (fingerprint(remote) !== fingerprint(local)) throw new Error(`${check.url}: published content differs from the checked revision`);
  }
  console.log(`Production verified: the original homepage plus all ${names.length} Afterglow files match the repository byte-for-byte over HTTPS.`);
}
