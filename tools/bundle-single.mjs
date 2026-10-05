// Build one self-contained HTML file: the whole app, its data and its styles in a single page that
// runs from a plain file, with no server, no install and no network (ARCHITECTURE T-18). It exists
// so a phone can try the game from a download. The real product is still the installable web app
// from tools/build.mjs; this file cannot be installed and cannot update itself.
//
//   npm run build:single                     -> dist-single/grand-strategy.html
//   node tools/bundle-single.mjs --out x.html
//
// How it works: the native TypeScript compiler (already a dev dependency) turns every module in
// src/ into plain CommonJS; tools/single.runtime.js runs them. The JSON in data/ and the small SVG
// icons are inlined, and the page sets globalThis.__GS_INLINE__ so the app reads them from memory
// instead of fetching. Phaser is left out (the Diagnostics map speed test says so).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fillIndexTokens, gitCommit, sha256, walk } from './lib/page.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUT = 'dist-single/grand-strategy.html';

/** The parts of index.html that differ between the web app and the single file. */
const WEB_ONLY = /<!-- web-only:[^]*?-->[^]*?<!-- \/web-only -->\n?/g;
const HEAD_MARKER = '<!-- single-head -->';
const BODY_MARKER = '<!-- single-body -->';

/**
 * Replace the one place `find` occurs. Anything else means index.html drifted from this tool, which
 * should fail loudly instead of producing a page that quietly does not work.
 * @param {string} html @param {string | RegExp} find @param {string} replacement @param {string} what
 */
function replaceOnce(html, find, replacement, what) {
  const count = typeof find === 'string' ? html.split(find).length - 1 : (html.match(find) ?? []).length;
  if (count !== 1) throw new Error(`index.html must contain ${what} exactly once (found ${count})`);
  return html.replace(find, () => replacement);
}

/** Text that could end or confuse the inline <script> or <style> around it. @param {string} what @param {string} text @param {'script' | 'style'} tag */
function assertInlineSafe(what, text, tag) {
  if (text.toLowerCase().includes(`</${tag}`) || text.includes('<!--')) throw new Error(`${what} contains "</${tag}" or "<!--", which cannot sit inside an inline <${tag}>`);
}

/** JSON that is safe inside an inline script: "<" can never start a closing tag. @param {unknown} value */
const inlineJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * Turn every module in src/ into plain CommonJS with the native TypeScript compiler.
 * @param {string} source repository root
 * @returns {Map<string, string>} module id (path inside src/) -> code
 */
function compileModules(source) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-single-'));
  try {
    const srcDir = path.join(source, 'src');
    const outDir = path.join(work, 'out');
    const config = path.join(work, 'tsconfig.json');
    fs.writeFileSync(
      config,
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'commonjs', allowJs: true, checkJs: false, noCheck: true, noEmitOnError: false, removeComments: true, skipLibCheck: true, types: [], rootDir: srcDir, outDir },
        include: [`${srcDir.split(path.sep).join('/')}/**/*.js`],
      }),
    );
    try {
      execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', config], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      const failure = /** @type {{ stdout?: Buffer, stderr?: Buffer }} */ (err);
      throw new Error(`The TypeScript compiler failed:\n${failure.stdout ?? ''}${failure.stderr ?? ''}`);
    }
    return new Map(
      walk(outDir, outDir)
        .filter((rel) => rel.endsWith('.js'))
        .sort()
        .map((rel) => [rel, fs.readFileSync(path.join(outDir, rel), 'utf8')]),
    );
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Every JSON file the app can read, by the path it asks for. @param {string} source */
function readData(source) {
  /** @type {Record<string, any>} */
  const files = {};
  for (const rel of walk(path.join(source, 'data'), source).sort()) {
    if (rel.startsWith('data/schema/') || !rel.endsWith('.json')) continue;
    files[rel] = JSON.parse(fs.readFileSync(path.join(source, rel), 'utf8'));
  }
  return files;
}

/** Small images (SVG only) as data: URLs. PNG icons are for installing, which this file cannot do. @param {string} source */
function readAssets(source) {
  /** @type {Record<string, string>} */
  const assets = {};
  for (const rel of walk(path.join(source, 'assets'), source).sort()) {
    if (rel.endsWith('.svg')) assets[rel] = `data:image/svg+xml;base64,${fs.readFileSync(path.join(source, rel)).toString('base64')}`;
  }
  return assets;
}

/**
 * @param {{ source?: string, now?: Date }} [options]
 *   `source` is the repository root to bundle (tests use a modified copy)
 */
export function bundleSingle({ source = root, now = new Date() } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  /** @type {Record<string, string>} */
  const strings = JSON.parse(fs.readFileSync(path.join(source, 'data/i18n/en.json'), 'utf8')).strings;

  const modules = compileModules(source);
  if (!modules.has('main.js')) throw new Error('src/main.js is missing, so there is nothing to start');
  const files = readData(source);
  const assets = readAssets(source);
  const icon = assets['assets/icons/icon.svg'];
  if (!icon) throw new Error('assets/icons/icon.svg is missing');
  const css = fs.readFileSync(path.join(source, 'src/ui/theme.css'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'tools/single.runtime.js'), 'utf8');
  const template = fs.readFileSync(path.join(source, 'index.html'), 'utf8');

  // Like the web build, the hash covers content only, so an unchanged app keeps its identity.
  const hash = sha256(
    [
      ...[...modules].map(([id, code]) => `${id}:${sha256(code)}`),
      ...Object.entries(files).map(([file, value]) => `${file}:${sha256(JSON.stringify(value))}`),
      `css:${sha256(css)}`,
      `runtime:${sha256(runtime)}`,
      `page:${sha256(template)}`,
    ].join('\n'),
  ).slice(0, 12);
  const info = { appId: 'grand-strategy', version: pkg.version, commit: gitCommit(source), builtAt: now.toISOString(), hash, files: [], single: true };
  files['build-info.json'] = info;

  const modulesLiteral = `{\n${[...modules].map(([id, code]) => `${JSON.stringify(id)}: function (exports, require, module) {\n${code}\n}`).join(',\n')}\n}`;
  const script = `globalThis.__GS_INLINE__ = ${inlineJson({ files, assets })};\n${runtime.replace('/*__MODULES__*/', () => modulesLiteral)}`;
  assertInlineSafe('The bundled code', script, 'script');
  assertInlineSafe('src/ui/theme.css', css, 'style');

  let html = fillIndexTokens(template, strings);
  html = replaceOnce(html, WEB_ONLY, '', 'one web-only block');
  html = replaceOnce(html, HEAD_MARKER, `<link rel="icon" href="${icon}" type="image/svg+xml">\n  <style>\n${css}\n  </style>`, `the ${HEAD_MARKER} marker`);
  html = replaceOnce(html, BODY_MARKER, `<script>\n${script}\n</script>`, `the ${BODY_MARKER} marker`);

  return { html, info, bytes: Buffer.byteLength(html) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--out');
  const out = path.resolve(root, i >= 0 ? process.argv[i + 1] : DEFAULT_OUT);
  const { html, info, bytes } = bundleSingle();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`Built ${path.relative(root, out)}: ${(bytes / 1024).toFixed(0)} KB, hash ${info.hash}, commit ${info.commit}`);
}
