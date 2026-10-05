// The build is the deployment, so it gets its own guard rails: the offline cache must be complete,
// nothing may depend on the network or on an absolute URL, and the page text must come from
// data/i18n/en.json (G-30).

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../../tools/build.mjs';
import { ROOT, readJsonFromDisk } from '../helpers/data.js';
import { importsOf, walk, withoutComments } from '../helpers/source.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-build-test-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const outA = path.join(tmp, 'a');
const outB = path.join(tmp, 'b');
const first = build({ outDir: outA });
const second = build({ outDir: outB, now: new Date(0) });

/** @param {string} dir @param {string} rel */
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const strings = (await readJsonFromDisk('data/i18n/en.json')).strings;

describe('build output', () => {
  it('contains everything the browser needs', () => {
    for (const file of [
      'index.html',
      'sw.js',
      'manifest.webmanifest',
      'build-info.json',
      '.nojekyll',
      'src/main.js',
      'src/ui/theme.css',
      'data/balance.json',
      'data/i18n/en.json',
      'vendor/phaser/phaser.esm.min.js',
      'assets/icons/icon-192.png',
      'assets/icons/icon-512.png',
      'assets/icons/icon-maskable-512.png',
      'assets/icons/apple-touch-icon.png',
    ]) {
      assert.ok(fs.existsSync(path.join(outA, file)), `${file} is missing`);
    }
  });

  it('leaves out development-only files', () => {
    const shipped = walk(outA, ['']).map((f) => path.relative(outA, f).split(path.sep).join('/'));
    assert.deepEqual(shipped.filter((f) => f.startsWith('data/schema/') || f.endsWith('.d.ts') || /^(tests|tools|docs|node_modules)\//.test(f)), []);
  });

  it('fills the static page from data/i18n/en.json, never hard-coded text', () => {
    const html = read(outA, 'index.html');
    assert.equal(/%[A-Z_]+%/.test(html), false, 'an unreplaced %TOKEN% is left in index.html');
    assert.ok(html.includes(`<title>${strings['app.title']}</title>`));
    assert.ok(html.includes(strings['app.noscript']));
    assert.ok(html.includes(strings['app.bootFailed.title']));
    assert.equal(/__[A-Z_]+__/.test(read(outA, 'sw.js')), false, 'an unreplaced __PLACEHOLDER__ is left in sw.js');
  });

  it('writes a valid web app manifest that works under any subpath', () => {
    const manifest = JSON.parse(read(outA, 'manifest.webmanifest'));
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.name, strings['app.title']);
    for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(outA, icon.src)), icon.src);
    assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  });

  it('declares the Phaser import map before the module script, pointing at a file that exists', () => {
    const html = read(outA, 'index.html');
    const importMap = html.indexOf('type="importmap"');
    const moduleScript = html.indexOf('type="module"');
    assert.ok(importMap > 0 && moduleScript > importMap, 'the import map must come first');
    assert.ok(html.includes('"phaser": "./vendor/phaser/phaser.esm.min.js"'));
  });

  it('precaches exactly the shipped files, so offline play is complete', () => {
    const worker = read(outA, 'sw.js');
    const precache = JSON.parse(/const PRECACHE = (\[.*\]);/.exec(worker)?.[1] ?? '[]');
    const info = JSON.parse(read(outA, 'build-info.json'));
    assert.deepEqual(precache, ['./', ...info.files.map((f) => f.path), 'build-info.json']);
    assert.equal(precache.includes('sw.js'), false);
    for (const entry of precache) if (entry !== './') assert.ok(fs.existsSync(path.join(outA, entry)), `${entry} is precached but missing`);
    assert.ok(worker.includes(`const CACHE = 'gs-${info.hash}'`), 'the cache name carries the content hash');
    assert.ok(precache.includes('data/i18n/en.json') && precache.includes('vendor/phaser/phaser.esm.min.js'));
  });

  it('uses only relative URLs and never reaches for the network (T-12, offline play)', () => {
    const offenders = [];
    const scan = (/** @type {string} */ rel, /** @type {string} */ code) => {
      const clean = withoutComments(code);
      const absolute = [
        /\b(?:fetch|register|import)\(\s*['"`]\//,
        /\bfrom\s+['"]\//,
        /\b(?:src|href|action)\s*[=:]\s*['"`]\/(?!\/)/,
        /url\(\s*['"]?\/(?!\/)/,
      ];
      for (const pattern of absolute) if (pattern.test(clean)) offenders.push(`${rel}: absolute URL ${pattern}`);
      for (const m of clean.matchAll(/https?:\/\/[^\s'")<>]+/g)) {
        if (!m[0].startsWith('http://www.w3.org/')) offenders.push(`${rel}: external URL ${m[0]}`);
      }
    };
    scan('index.html', read(outA, 'index.html'));
    for (const file of walk(path.join(outA, 'src'), ['.js', '.css'])) scan(path.relative(outA, file), fs.readFileSync(file, 'utf8'));
    assert.deepEqual(offenders, []);
  });

  it('only imports files that exist', () => {
    const missing = [];
    for (const file of walk(path.join(outA, 'src'))) {
      for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) {
        if (spec.startsWith('.') && !fs.existsSync(path.resolve(path.dirname(file), spec))) missing.push(`${path.relative(outA, file)} imports ${spec}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('minifies JSON content without changing it', () => {
    for (const rel of ['data/balance.json', 'data/governments.json', 'data/i18n/en.json']) {
      const shipped = read(outA, rel);
      assert.equal(shipped.includes('\n'), false, `${rel} still has line breaks`);
      assert.deepEqual(JSON.parse(shipped), JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
    }
  });

  it('is deterministic: the same files give the same hash, cache name and worker', () => {
    assert.equal(first.info.hash, second.info.hash);
    assert.equal(read(outA, 'sw.js'), read(outB, 'sw.js'));
    assert.deepEqual(first.info.files, second.info.files);
  });

  it('changes the hash and cache name when any file changes', () => {
    const copy = path.join(tmp, 'release2');
    for (const entry of ['package.json', 'index.html', 'src', 'data', 'vendor', 'assets', 'tools/sw.template.js']) {
      fs.cpSync(path.join(ROOT, entry), path.join(copy, entry), { recursive: true });
    }
    fs.appendFileSync(path.join(copy, 'src/ui/theme.css'), '\n/* changed */\n');
    const changed = build({ outDir: path.join(tmp, 'c'), source: copy });
    assert.notEqual(changed.info.hash, first.info.hash);
    assert.ok(read(path.join(tmp, 'c'), 'sw.js').includes(`gs-${changed.info.hash}`));
  });
});
