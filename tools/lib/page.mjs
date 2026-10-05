// Pieces shared by the two builders (tools/build.mjs and tools/bundle-single.mjs): filling the
// static page from data/i18n/en.json (G-30), hashing, walking folders and naming the commit.

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Tokens in index.html and the strings that fill them. */
export const INDEX_TOKENS = {
  APP_TITLE: 'app.title',
  TAGLINE: 'app.tagline',
  LOADING: 'app.loading',
  NOSCRIPT: 'app.noscript',
  BOOT_FAILED_TITLE: 'app.bootFailed.title',
  BOOT_FAILED_BODY: 'app.bootFailed.body',
  BOOT_FAILED_RETRY: 'app.bootFailed.retry',
};

export const sha256 = (/** @type {string | Buffer} */ data) => crypto.createHash('sha256').update(data).digest('hex');

/** @param {string} text */
export const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Fill the %TOKENS% of index.html. A token without a string is a mistake worth failing the build for.
 * @param {string} html
 * @param {Record<string, string>} strings
 */
export function fillIndexTokens(html, strings) {
  return html.replace(/%([A-Z_]+)%/g, (token, name) => {
    const key = /** @type {Record<string, string>} */ (INDEX_TOKENS)[name];
    if (!key) throw new Error(`index.html uses the unknown token ${token}`);
    if (!(key in strings)) throw new Error(`index.html needs "${key}" in data/i18n/en.json`);
    return escapeHtml(strings[key]);
  });
}

/** All files under a directory as posix paths relative to `base`. @param {string} dir @param {string} base @returns {string[]} */
export function walk(dir, base) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

/** The short commit id of a checkout ("dev" when it is not a git checkout). @param {string} cwd */
export function gitCommit(cwd) {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}
