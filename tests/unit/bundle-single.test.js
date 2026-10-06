// The single-file download (T-18) has no server, no service worker and no network, so the build must
// produce a page that is complete on its own. These tests check the page itself; the end-to-end
// test (tests/e2e/singlefile.e2e.mjs) opens it in a browser.

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { bundleSingle } from '../../tools/bundle-single.mjs';
import { DATA_FILES } from '../../src/core/data.js';
import { ROOT, readJsonFromDisk } from '../helpers/data.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-single-test-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const strings = (await readJsonFromDisk('data/i18n/en.json')).strings;
const balance = await readJsonFromDisk('data/balance.json');
const first = bundleSingle({ now: new Date(0) });
const second = bundleSingle({ now: new Date(0) });
const html = first.html;

/** The page's one inline script. */
const script = (() => {
  const blocks = [...html.matchAll(/<script>([^]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, 'exactly one inline script');
  return blocks[0][1];
})();

/** The data the page carries: the first statement of the script, run on its own. */
const inline = (() => {
  const sandbox = /** @type {any} */ ({});
  vm.runInNewContext(script.trimStart().split('\n')[0], sandbox);
  return JSON.parse(JSON.stringify(sandbox.__GS_INLINE__)); // back into this realm, so deepEqual compares plain objects
})();

/** Module id -> code, read back out of the page. */
const modules = (() => {
  const found = new Map();
  const starts = [...script.matchAll(/^"([^"\n]+\.js)": function \(exports, require, module\) \{$/gm)];
  starts.forEach((m, i) => found.set(m[1], script.slice(m.index + m[0].length, starts[i + 1]?.index ?? script.length)));
  return found;
})();

describe('single-file build', () => {
  it('is one self-contained page: no files to fetch, no install, no module graph', () => {
    assert.equal(/<script[^>]*\ssrc=/i.test(html), false, 'an external script');
    assert.equal(/type="module"|type="importmap"/.test(html), false, 'a module script or import map');
    assert.equal(/rel="(manifest|stylesheet|apple-touch-icon)"/.test(html), false, 'a linked file');
    assert.equal((html.match(/<style>/g) ?? []).length, 1);
    assert.equal(/href="(?!data:|#)/.test(html), false, 'a link that is not a data: URL');
  });

  it('fills the page text from data/i18n/en.json and leaves no template markers behind', () => {
    assert.ok(html.includes(`<title>${strings['app.title']}</title>`));
    assert.ok(html.includes(strings['app.bootFailed.title']));
    assert.equal(/%[A-Z_]+%/.test(html), false, 'an unreplaced %TOKEN%');
    assert.equal(/web-only|single-head|single-body/.test(html), false, 'a template marker');
  });

  it('carries a script that parses', () => {
    assert.doesNotThrow(() => new vm.Script(script));
  });

  it('inlines every data file the game reads, plus its build info, and no schemas', () => {
    for (const file of DATA_FILES) assert.ok(file.path in inline.files, `${file.path} is missing`);
    assert.ok('build-info.json' in inline.files);
    assert.deepEqual(Object.keys(inline.files).filter((f) => f.startsWith('data/schema/')), []);
    assert.deepEqual(inline.files['data/balance.json'], balance);
    const info = inline.files['build-info.json'];
    assert.equal(info.appId, 'grand-strategy');
    assert.equal(info.single, true);
    assert.match(info.hash, /^[0-9a-f]{12}$/);
    assert.equal(info.builtAt, '1970-01-01T00:00:00.000Z');
  });

  it('inlines the app icon as a data URL so no image is fetched', () => {
    assert.match(inline.assets['assets/icons/icon.svg'], /^data:image\/svg\+xml;base64,/);
    assert.ok(html.includes('<link rel="icon" href="data:image/svg+xml;base64,'));
  });

  it('carries Phaser inside the page, byte for byte and with its license, as an inert element read only on demand', () => {
    const holder = html.match(/<script type="application\/octet-stream" id="gs-phaser">([A-Za-z0-9+/=]+)<\/script>/);
    assert.ok(holder, 'the element that holds Phaser');
    const vendored = fs.readFileSync(path.join(ROOT, 'vendor/phaser/phaser.esm.min.js'));
    assert.ok(Buffer.from(holder[1], 'base64').equals(vendored), 'the embedded bytes are the vendored build');
    assert.ok(html.includes('The MIT License (MIT)') && html.includes('Richard Davey'), 'the license travels with it');
    assert.ok(script.includes('__GS_LOAD_PHASER__ = function'), 'the page supplies the loader that src/ui/phaser.js looks for');
    assert.equal(/\bgs-phaser\b/.test(script.slice(0, script.indexOf('__GS_LOAD_PHASER__'))), false, 'nothing touches the element before the map asks');
  });

  it('changes its hash when the embedded Phaser changes', () => {
    const copy = path.join(tmp, 'new-phaser');
    for (const entry of ['package.json', 'index.html', 'src', 'data', 'assets', 'vendor']) fs.cpSync(path.join(ROOT, entry), path.join(copy, entry), { recursive: true });
    fs.appendFileSync(path.join(copy, 'vendor/phaser/phaser.esm.min.js'), '\n// patched\n');
    assert.notEqual(bundleSingle({ source: copy, now: new Date(0) }).info.hash, first.info.hash);
  });

  it('fails loudly when Phaser has not been vendored', () => {
    const copy = path.join(tmp, 'no-phaser');
    for (const entry of ['package.json', 'index.html', 'src', 'data', 'assets']) fs.cpSync(path.join(ROOT, entry), path.join(copy, entry), { recursive: true });
    assert.throws(() => bundleSingle({ source: copy }), /vendor\/phaser\/ is missing/);
  });

  it('bundles every module of src/ and every require() can be resolved', () => {
    const onDisk = [];
    const walk = (/** @type {string} */ dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) onDisk.push(path.relative(path.join(ROOT, 'src'), full).split(path.sep).join('/'));
      }
    };
    walk(path.join(ROOT, 'src'));
    assert.deepEqual([...modules.keys()].sort(), onDisk.sort());

    const unresolved = [];
    for (const [id, code] of modules) {
      for (const m of code.matchAll(/\brequire\("([^"]+)"\)|\brequire\('([^']+)'\)/g)) {
        const spec = m[1] ?? m[2];
        if (!spec.startsWith('.')) {
          if (spec !== 'phaser') unresolved.push(`${id} needs the outside package ${spec}`); // only Phaser, loaded on demand, is left out
          continue;
        }
        const target = path.posix.join(path.posix.dirname(id), spec);
        if (!modules.has(target)) unresolved.push(`${id} requires ${spec}, which is not in the bundle`);
      }
    }
    assert.deepEqual(unresolved, []);
  });

  it('does not use native ES module syntax that a plain script cannot run', () => {
    for (const [id, code] of modules) {
      assert.equal(/^\s*(import|export)\s/m.test(code), false, `${id} still has import/export statements`);
      assert.equal(/\bimport\.meta\b/.test(code), false, `${id} uses import.meta`);
    }
  });

  it('never reaches for the network on its own', () => {
    // Only the app's normal fetch-based reader (main.js, used by the web build) may call fetch.
    const fetchers = [...modules].filter(([, code]) => /\bfetch\(/.test(code)).map(([id]) => id);
    assert.deepEqual(fetchers, ['main.js']);
    assert.equal(/https?:\/\/(?!www\.w3\.org)/.test(script.replace(/"[^"]*https?:\/\/[^"]*"/g, '')), false);
  });

  it('is deterministic', () => {
    assert.equal(first.html, second.html);
    assert.equal(first.info.hash, second.info.hash);
  });

  it('changes its hash when any source file changes', () => {
    const copy = path.join(tmp, 'changed');
    for (const entry of ['package.json', 'index.html', 'src', 'data', 'assets', 'vendor']) fs.cpSync(path.join(ROOT, entry), path.join(copy, entry), { recursive: true });
    fs.appendFileSync(path.join(copy, 'src/ui/theme.css'), '\n/* changed */\n');
    assert.notEqual(bundleSingle({ source: copy, now: new Date(0) }).info.hash, first.info.hash);
  });

  it('fails loudly when index.html no longer has the markers the bundler needs', () => {
    for (const marker of ['<!-- single-head -->', '<!-- single-body -->', '<!-- /web-only -->']) {
      const copy = path.join(tmp, `broken-${marker.replace(/\W+/g, '')}`);
      for (const entry of ['package.json', 'index.html', 'src', 'data', 'assets', 'vendor']) fs.cpSync(path.join(ROOT, entry), path.join(copy, entry), { recursive: true });
      const page = path.join(copy, 'index.html');
      fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace(marker, ''));
      assert.throws(() => bundleSingle({ source: copy }), /index\.html must contain/, marker);
    }
  });
});
