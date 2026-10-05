// Publish the single-file download (tools/bundle-single.mjs, T-18) as a GitHub Release asset, so
// there is a plain link that downloads it on any phone: no GitHub Pages setting and no sign-in.
// One release per branch, tagged "download-<branch-slug>"; every push replaces the file.
//
//   node tools/publish-download.mjs --file dist-single/grand-strategy.html
//     (CI: GITHUB_REF_NAME, GITHUB_SHA and GITHUB_REPOSITORY are read; `gh` signs in through GH_TOKEN)

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { slugify } from './publish-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The release tag for a branch: "ccr-abc" -> "download-ccr-abc". @param {string} branch */
export const downloadTag = (branch) => `download-${slugify(branch)}`;

/**
 * The two links worth sharing: the release page, and the file itself (a tap downloads it).
 * @param {{ repo: string, tag: string, name: string }} options repo is "owner/name"
 */
export function downloadUrls({ repo, tag, name }) {
  const base = `https://github.com/${repo}/releases`;
  return { page: `${base}/tag/${tag}`, file: `${base}/download/${tag}/${encodeURIComponent(name)}` };
}

/** Run the GitHub CLI. @param {string[]} args @returns {string} */
const gh = (args) => execFileSync('gh', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

/**
 * Create the branch's release the first time, afterwards replace the file in it.
 * @param {{ file: string, branch: string, sha: string, run?: (args: string[]) => string }} options `run` is `gh`, replaceable in tests
 */
export function publishDownload({ file, branch, sha, run = gh }) {
  const tag = downloadTag(branch);
  const notes = `Test build of the branch ${branch} (commit ${sha.slice(0, 7)}). One file: download it and open it with your phone's browser. It plays offline; it cannot be installed or update itself. For the installable app, use the web link.`;

  let exists = true;
  try {
    run(['release', 'view', tag]);
  } catch {
    exists = false;
  }
  if (exists) {
    run(['release', 'upload', tag, file, '--clobber']);
    run(['release', 'edit', tag, '--notes', notes, '--prerelease']);
  } else {
    run(['release', 'create', tag, file, '--target', sha, '--prerelease', '--title', `Test build: ${branch}`, '--notes', notes]);
  }
  return { tag, name: path.basename(file), created: !exists };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (/** @type {string} */ name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const file = option('--file');
  const branch = option('--branch') ?? process.env.GITHUB_REF_NAME;
  const sha = option('--sha') ?? process.env.GITHUB_SHA;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!file || !branch || !sha || !repo) throw new Error('Needs --file, and a branch, commit and repository (GITHUB_REF_NAME, GITHUB_SHA, GITHUB_REPOSITORY) from GitHub Actions');
  const result = publishDownload({ file: path.resolve(root, file), branch, sha });
  const urls = downloadUrls({ repo, tag: result.tag, name: result.name });
  console.log(`${result.created ? 'Created' : 'Updated'} the download for ${branch}.\nRelease page: ${urls.page}\nDirect download: ${urls.file}`);
}
