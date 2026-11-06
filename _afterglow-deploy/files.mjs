import { lstat, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const source = path.join(root, '_afterglow/dist');
export const destination = path.join(root, 'afterglowvintage');
export const origin = 'https://corbincombs.com';
export const base = '/afterglowvintage/';

export async function files(directory, prefix = '') {
  const result = [];
  for (const name of (await readdir(directory)).sort()) {
    const relative = path.posix.join(prefix, name);
    const absolute = path.join(directory, name);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not publishable: ${relative}`);
    if (stat.isDirectory()) result.push(...await files(absolute, relative));
    else if (stat.isFile()) result.push(relative);
    else throw new Error(`Unexpected file type: ${relative}`);
  }
  return result;
}

export function routeFor(file) {
  return base + file.replace(/(^|\/)index\.html$/, '$1');
}

export async function validate(directory = source) {
  const names = await files(directory);
  const known = new Set(names);
  if (!known.has('index.html')) throw new Error('The build must contain index.html.');
  const staticExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.webmanifest', '.mp4', '.webm', '.pdf']);
  for (const name of names) {
    if (name.split('/').some(part => /^[._]/.test(part) || part === 'node_modules') || /(?:^|\/)(?:package(?:-lock)?\.json|astro\.config\..*)$/.test(name) || !staticExtensions.has(path.extname(name).toLowerCase())) {
      throw new Error(`Source, dependency, or Jekyll-excluded file in build: ${name}`);
    }
  }
  const checkReference = (reference, page, asset = false) => {
    if (!reference || reference.startsWith('#') || /^(?:mailto:|tel:|data:|blob:|javascript:)/.test(reference)) return;
    const url = new URL(reference.replaceAll('&amp;', '&'), origin + routeFor(page));
    if (url.origin !== origin) return;
    if (!url.pathname.startsWith(base)) throw new Error(`${page}: URL escapes ${base}: ${reference}`);
    let relative = decodeURIComponent(url.pathname.slice(base.length));
    if (relative.endsWith('/') || !relative) relative += 'index.html';
    if (!known.has(relative)) throw new Error(`${page}: missing ${asset ? 'asset' : 'link target'} ${reference}`);
  };
  const pages = names.filter(name => name.endsWith('.html'));
  for (const page of pages) {
    const html = await readFile(path.join(directory, page), 'utf8');
    const canonical = /<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1];
    const expected = origin + routeFor(page);
    if (canonical !== expected) throw new Error(`${page}: canonical must be ${expected}, received ${canonical}`);
    if (!/<title>[^<]+<\/title>/i.test(html)) throw new Error(`${page}: missing title`);
    if (!/<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["'][^"']+["'])[^>]*>/i.test(html)) throw new Error(`${page}: missing description`);
    const socialUrl = /<meta\b(?=[^>]*\bproperty=["']og:url["'])(?=[^>]*\bcontent=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1];
    if (socialUrl !== expected) throw new Error(`${page}: og:url must match its canonical URL`);
    for (const match of html.matchAll(/<meta\b(?=[^>]*\b(?:property|name)=["'](?:og:image|twitter:image)["'])(?=[^>]*\bcontent=["']([^"']+)["'])[^>]*>/gi)) {
      checkReference(match[1], page, true);
    }
    for (const match of html.matchAll(/\b(href|src|poster|action)=["']([^"']+)["']/gi)) checkReference(match[2], page, match[1] !== 'href');
    for (const match of html.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
      for (const item of match[1].split(',')) checkReference(item.trim().split(/\s+/)[0], page, true);
    }
  }
  for (const stylesheet of names.filter(name => name.endsWith('.css'))) {
    const css = await readFile(path.join(directory, stylesheet), 'utf8');
    // Consume an entire quoted data URI before looking for another url(), so
    // SVG filter references inside inline images are not treated as files.
    for (const match of css.matchAll(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s)'";]+))\s*\)/g)) {
      checkReference(match[1] ?? match[2] ?? match[3], stylesheet, true);
    }
  }
  return { names, pages };
}
