// Build the deployable site into dist/ (ARCHITECTURE §13). There is no bundler (T-01): the build
// copies files, minifies JSON, fills the static page from data/i18n/en.json (G-30), writes the
// PWA manifest, and generates the service worker with a precache list. dist/ is exactly what
// gets served, so development and production are the same thing.
//
//   npm run build                 -> dist/
//   node tools/build.mjs --out x  -> x/

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COPY_DIRS = ['src', 'data', 'vendor', 'assets'];
const skip = (/** @type {string} */ rel) => rel.startsWith('data/schema/') || rel.endsWith('.d.ts') || rel.endsWith('.DS_Store');

/** Tokens in index.html and the strings that fill them. */
const INDEX_TOKENS = {
  APP_TITLE: 'app.title',
  TAGLINE: 'app.tagline',
  LOADING: 'app.loading',
  NOSCRIPT: 'app.noscript',
  BOOT_FAILED_TITLE: 'app.bootFailed.title',
  BOOT_FAILED_BODY: 'app.bootFailed.body',
  BOOT_FAILED_RETRY: 'app.bootFailed.retry',
};

const sha256 = (/** @type {string | Buffer} */ data) => crypto.createHash('sha256').update(data).digest('hex');

/** @param {string} text */
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** All files under a directory as posix paths relative to `base`. @param {string} dir @param {string} base @returns {string[]} */
function walk(dir, base) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

/** @param {string} cwd */
function gitCommit(cwd) {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

/** @param {Record<string, string>} strings */
function makeManifest(strings) {
  return {
    id: './',
    name: strings['app.title'],
    short_name: strings['app.shortTitle'],
    description: strings['app.tagline'],
    lang: 'en',
    dir: 'ltr',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b1a2b',
    theme_color: '#0b1a2b',
    categories: ['games'],
    icons: [
      { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'assets/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/**
 * @param {{ outDir?: string, source?: string, now?: Date }} [options]
 *   `source` is the repository root to build from (tests use a modified copy to simulate a new release)
 */
export function build({ outDir = path.join(root, 'dist'), source = root, now = new Date() } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  /** @type {Record<string, string>} */
  const strings = JSON.parse(fs.readFileSync(path.join(source, 'data/i18n/en.json'), 'utf8')).strings;

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  /** @type {Map<string, Buffer>} */
  const written = new Map();
  /** @param {string} rel @param {string | Buffer} content */
  function write(rel, content) {
    const target = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    written.set(rel, Buffer.from(content));
  }

  // The static page: every visible word comes from en.json.
  const html = fs.readFileSync(path.join(source, 'index.html'), 'utf8').replace(/%([A-Z_]+)%/g, (token, name) => {
    const key = /** @type {Record<string, string>} */ (INDEX_TOKENS)[name];
    if (!key) throw new Error(`index.html uses the unknown token ${token}`);
    if (!(key in strings)) throw new Error(`index.html needs "${key}" in data/i18n/en.json`);
    return escapeHtml(strings[key]);
  });
  write('index.html', html);

  for (const dir of COPY_DIRS) {
    for (const rel of walk(path.join(source, dir), source)) {
      if (skip(rel)) continue;
      const file = path.join(source, rel);
      if (rel.endsWith('.json')) write(rel, JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'))));
      else write(rel, fs.readFileSync(file));
    }
  }

  write('manifest.webmanifest', JSON.stringify(makeManifest(strings), null, 2));

  const files = [...written.entries()]
    .map(([file, buffer]) => ({ path: file, bytes: buffer.length, sha256: sha256(buffer) }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  // The hash covers file contents only (not the commit or the time), so an unchanged site keeps its cache.
  const hash = sha256(files.map((f) => `${f.path}:${f.sha256}`).join('\n')).slice(0, 12);

  const info = { appId: 'grand-strategy', version: pkg.version, commit: gitCommit(source), builtAt: now.toISOString(), hash, files };
  write('build-info.json', JSON.stringify(info));

  const precache = ['./', ...files.map((f) => f.path), 'build-info.json'];
  const worker = fs
    .readFileSync(path.join(source, 'tools/sw.template.js'), 'utf8')
    .replace('__CACHE_NAME__', `gs-${hash}`)
    .replace('__PRECACHE__', JSON.stringify(precache));
  write('sw.js', worker);
  write('.nojekyll', '');

  return { outDir, info, precache };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--out');
  const outDir = path.resolve(root, i >= 0 ? process.argv[i + 1] : 'dist');
  const { info } = build({ outDir });
  const total = info.files.reduce((sum, f) => sum + f.bytes, 0);
  console.log(`Built ${path.relative(root, outDir) || '.'}: ${info.files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB, hash ${info.hash}, commit ${info.commit}`);
}
