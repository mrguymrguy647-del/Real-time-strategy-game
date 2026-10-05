// Publish a built site to the gh-pages branch (ARCHITECTURE §13, T-12):
//   main            -> the site root
//   any other branch -> preview/<branch-slug>/   (so each push can be tried on a phone)
// It also keeps preview/index.html (a list of previews), puts a placeholder at the root until main
// has been published, and removes previews whose branch no longer exists.
//
//   node tools/publish-pages.mjs --push        (CI: uses GITHUB_REF_NAME, GITHUB_SHA, GITHUB_REPOSITORY)
//   node tools/publish-pages.mjs --branch x    (local dry run: commits to a temp worktree, no push)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setStrings, t } from '../src/util/i18n.js';
import { hashText } from '../src/util/hash.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER_MARKER = '<!-- gs-placeholder -->';

/** A safe folder name for a branch: "Feature/My Thing" -> "feature-my-thing". @param {string} branch */
export function slugify(branch) {
  return branch.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60) || 'branch';
}

/** @param {string} text */
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {string} cwd @param {...string} args @returns {string} */
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

/** @param {string} from @param {string} to */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

/** @typedef {{ slug: string, branch: string, sha: string, time: string }} Preview */
/** @typedef {{ main: { sha: string, time: string } | null, previews: Preview[] }} Meta */

/** @param {string} dir @returns {Meta} */
function readMeta(dir) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'preview', 'previews.json'), 'utf8'));
    return { main: meta.main ?? null, previews: Array.isArray(meta.previews) ? meta.previews : [] };
  } catch {
    return { main: null, previews: [] };
  }
}

/** @param {string} iso */
const when = (iso) => `${iso.replace('T', ' ').slice(0, 16)} UTC`;

const PAGE_STYLE = 'body{margin:0;background:#0b1a2b;color:#e8eef5;font:16px/1.5 system-ui,sans-serif}main{max-width:40rem;margin:0 auto;padding:1.5rem 1rem}a{color:#4cc9b0}li{margin:.75rem 0}small{color:#9fb0c3;display:block}h1{margin:0 0 .5rem}';

/** @param {string} title @param {string} body */
const page = (title, body) =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head><body><main>${body}</main></body></html>\n`;

/** @param {Meta} meta */
function previewIndexHtml(meta) {
  const items = meta.previews
    .map((p) => `<li><a href="./${encodeURIComponent(p.slug)}/">${escapeHtml(p.branch)}</a><small>${escapeHtml(p.sha.slice(0, 7))} · ${escapeHtml(t('previews.updated', { time: when(p.time) }))}</small></li>`)
    .join('');
  const main = meta.main ? `<p><a href="../">${escapeHtml(t('previews.main'))}</a></p>` : '';
  return page(t('previews.title'), `<h1>${escapeHtml(t('previews.title'))}</h1><p>${escapeHtml(t('previews.intro'))}</p>${items ? `<ul>${items}</ul>` : `<p>${escapeHtml(t('previews.none'))}</p>`}${main}`);
}

function placeholderHtml() {
  return `${PLACEHOLDER_MARKER}\n${page(t('previews.placeholder.title'), `<h1>${escapeHtml(t('previews.placeholder.title'))}</h1><p>${escapeHtml(t('previews.placeholder.body'))}</p><p><a href="./preview/">${escapeHtml(t('previews.placeholder.link'))}</a></p>`)}`;
}

/**
 * @typedef {object} PublishOptions
 * @property {string} dist the built site
 * @property {string} branch the branch that was built
 * @property {string} sha the commit that was built
 * @property {string} repoDir a git checkout whose remote credentials will be used
 * @property {string} [remote]
 * @property {string} [defaultBranch] published to the site root (default "main")
 * @property {string} [pagesBranch] default "gh-pages"
 * @property {boolean} [push] actually push (otherwise only commit in the temporary worktree)
 * @property {number} [keep] most previews to keep (default 12)
 * @property {Date} [now]
 * @property {string} [userName]
 * @property {string} [userEmail]
 */

/** One attempt: fetch, update a temporary worktree, commit, push. @param {PublishOptions} options */
function publishOnce(options) {
  const { dist, branch, sha, repoDir, remote = 'origin', defaultBranch = 'main', pagesBranch = 'gh-pages', push = false, keep = 12, now = new Date(), userName = 'github-actions[bot]', userEmail = '41898282+github-actions[bot]@users.noreply.github.com' } = options;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-pages-'));
  try {
    let existing = true;
    try {
      git(repoDir, 'fetch', '--no-tags', '--depth=1', remote, pagesBranch);
    } catch {
      existing = false;
    }
    if (existing) {
      git(repoDir, 'worktree', 'add', '--detach', work, 'FETCH_HEAD');
    } else {
      git(repoDir, 'worktree', 'add', '--detach', work, 'HEAD');
      git(work, 'checkout', '--orphan', 'pages-new');
      git(work, 'rm', '-rf', '-q', '--ignore-unmatch', '.');
    }

    const meta = readMeta(work);
    const isMain = branch === defaultBranch;
    if (isMain) {
      for (const entry of fs.readdirSync(work)) {
        if (entry !== '.git' && entry !== 'preview') fs.rmSync(path.join(work, entry), { recursive: true, force: true });
      }
      copyDir(dist, work);
      // Re-publishing the same commit keeps its timestamp, so it can be a true no-op.
      meta.main = { sha, time: meta.main?.sha === sha ? meta.main.time : now.toISOString() };
    } else {
      const known = meta.previews.find((p) => p.branch === branch);
      let slug = known?.slug ?? slugify(branch);
      if (!known && meta.previews.some((p) => p.slug === slug)) slug = `${slug}-${hashText(branch).slice(0, 6)}`; // two branches, one slug
      fs.rmSync(path.join(work, 'preview', slug), { recursive: true, force: true });
      copyDir(dist, path.join(work, 'preview', slug));
      meta.previews = meta.previews.filter((p) => p.branch !== branch);
      meta.previews.push({ slug, branch, sha, time: known?.sha === sha ? known.time : now.toISOString() });
    }

    // Remove previews of branches that are gone, then keep only the newest few.
    const live = new Set(
      git(repoDir, 'ls-remote', '--heads', remote)
        .split('\n')
        .map((line) => line.split('\t')[1]?.replace('refs/heads/', ''))
        .filter(Boolean),
    );
    meta.previews = meta.previews.filter((p) => {
      if (p.branch === branch || live.has(p.branch)) return true;
      fs.rmSync(path.join(work, 'preview', p.slug), { recursive: true, force: true });
      return false;
    });
    meta.previews.sort((a, b) => b.time.localeCompare(a.time));
    for (const old of meta.previews.splice(keep)) fs.rmSync(path.join(work, 'preview', old.slug), { recursive: true, force: true });

    fs.mkdirSync(path.join(work, 'preview'), { recursive: true });
    fs.writeFileSync(path.join(work, 'preview', 'previews.json'), `${JSON.stringify(meta, null, 2)}\n`);
    fs.writeFileSync(path.join(work, 'preview', 'index.html'), previewIndexHtml(meta));
    fs.writeFileSync(path.join(work, '.nojekyll'), '');
    if (!fs.existsSync(path.join(work, 'index.html'))) fs.writeFileSync(path.join(work, 'index.html'), placeholderHtml());

    git(work, 'add', '-A');
    let changed = true;
    try {
      git(work, 'diff', '--cached', '--quiet');
      changed = false;
    } catch {
      changed = true;
    }
    if (changed) {
      git(work, '-c', `user.name=${userName}`, '-c', `user.email=${userEmail}`, 'commit', '-q', '-m', `deploy: ${branch} @ ${sha.slice(0, 7)}`);
      if (push) git(work, 'push', remote, `HEAD:refs/heads/${pagesBranch}`);
    }
    const folder = isMain ? '' : `preview/${meta.previews.find((p) => p.branch === branch)?.slug}/`;
    return { changed, folder };
  } finally {
    try {
      git(repoDir, 'worktree', 'remove', '--force', work);
    } catch {
      fs.rmSync(work, { recursive: true, force: true });
      try {
        git(repoDir, 'worktree', 'prune');
      } catch {
        // nothing to prune
      }
    }
  }
}

/**
 * Publish with a few retries: if another deploy pushed first, start again from the newest state.
 * @param {PublishOptions} options
 */
export function publish(options) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return publishOnce(options);
    } catch (err) {
      lastError = err;
      console.warn(`publish attempt ${attempt} failed: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
      if (attempt < 3) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000 * attempt);
    }
  }
  throw lastError;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (/** @type {string} */ name, /** @type {string | undefined} */ fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  setStrings(JSON.parse(fs.readFileSync(path.join(root, 'data/i18n/en.json'), 'utf8')).strings);

  const branch = option('--branch', process.env.GITHUB_REF_NAME);
  if (!branch) throw new Error('No branch: pass --branch or run inside GitHub Actions');
  const sha = option('--sha', process.env.GITHUB_SHA ?? git(root, 'rev-parse', 'HEAD'));
  const result = publish({
    dist: path.resolve(root, option('--dist', 'dist')),
    branch,
    sha: /** @type {string} */ (sha),
    repoDir: root,
    remote: option('--remote', 'origin'),
    defaultBranch: option('--default-branch', 'main'),
    push: args.includes('--push'),
  });
  const repo = process.env.GITHUB_REPOSITORY?.split('/');
  const site = repo ? `https://${repo[0].toLowerCase()}.github.io/${repo[1]}/` : '(your site)/';
  console.log(result.changed ? `Published ${branch}${args.includes('--push') ? '' : ' (dry run, not pushed)'}: ${site}${result.folder}` : `Nothing to publish for ${branch}: the site is already up to date.`);
}
