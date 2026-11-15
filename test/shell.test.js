// Guards the offline shell: the service worker's file list must match what is on disk and what the page loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listed = [...sw.matchAll(/^\s+'([^']+)',?$/gm)].map((m) => m[1]).filter((p) => p !== './' && !p.startsWith('clearance'));

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [relative(root, p)];
  });
}

test('every file in the service worker list exists', () => {
  for (const f of listed) assert.ok(existsSync(join(root, f)), `${f} is listed in sw.js but missing`);
});

test('every app file on disk is in the service worker list (so it works offline)', () => {
  const onDisk = ['css', 'js', 'vendor', 'fonts', 'icons'].flatMap((d) => walk(join(root, d)))
    .filter((f) => !/\.(txt|md)$/i.test(f));
  for (const f of onDisk) assert.ok(listed.includes(f), `${f} is not in sw.js ASSETS`);
});

test('manifest icons and page links point at real files', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  for (const i of m.icons) assert.ok(existsSync(join(root, i.src)), i.src);
  assert.equal(m.display, 'standalone');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const [, href] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    if (/^https?:/.test(href)) assert.fail('page must not load anything from the network: ' + href);
    assert.ok(existsSync(join(root, href)), href);
  }
});

test('no JS file reaches for a remote script or font', () => {
  for (const f of walk(join(root, 'js'))) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.ok(!/from\s+['"]https?:/.test(src) && !/import\(['"]https?:/.test(src), f);
  }
  const css = readFileSync(join(root, 'css/app.css'), 'utf8');
  assert.ok(!/url\(['"]?https?:/.test(css), 'css must not load remote files');
});
