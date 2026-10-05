// The download publisher only drives the GitHub CLI, so it is tested with a stand-in that records
// every command. What matters: one stable release per branch, created once, then updated in place.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downloadTag, downloadUrls, publishDownload } from '../../tools/publish-download.mjs';

const sha = 'a'.repeat(40);

/** A fake `gh` that remembers which releases exist. @param {string[]} existing tags that already exist */
function fakeGh(existing = []) {
  /** @type {string[][]} */
  const calls = [];
  const tags = new Set(existing);
  const run = (/** @type {string[]} */ args) => {
    calls.push(args);
    const [, verb, tag] = args;
    if (verb === 'view' && !tags.has(tag)) throw new Error('release not found');
    if (verb === 'create') tags.add(tag);
    return '';
  };
  return { calls, run };
}

describe('download tags and links', () => {
  it('names the release after the branch, safely', () => {
    assert.equal(downloadTag('ccr-5ed68e3d-6cg5fd'), 'download-ccr-5ed68e3d-6cg5fd');
    assert.equal(downloadTag('Feature/My Thing'), 'download-feature-my-thing');
    assert.equal(downloadTag('main'), 'download-main');
  });

  it('builds the release page and the direct download link', () => {
    const urls = downloadUrls({ repo: 'owner/repo', tag: 'download-main', name: 'grand-strategy.html' });
    assert.equal(urls.page, 'https://github.com/owner/repo/releases/tag/download-main');
    assert.equal(urls.file, 'https://github.com/owner/repo/releases/download/download-main/grand-strategy.html');
  });
});

describe('publishing the download', () => {
  it('creates the branch release the first time, as a prerelease at the built commit', () => {
    const gh = fakeGh();
    const result = publishDownload({ file: '/x/grand-strategy.html', branch: 'feature/a', sha, run: gh.run });
    assert.deepEqual(result, { tag: 'download-feature-a', name: 'grand-strategy.html', created: true });
    assert.deepEqual(gh.calls[0], ['release', 'view', 'download-feature-a']);
    const create = gh.calls[1];
    assert.deepEqual(create.slice(0, 3), ['release', 'create', 'download-feature-a']);
    assert.ok(create.includes('/x/grand-strategy.html'));
    assert.equal(create[create.indexOf('--target') + 1], sha);
    assert.ok(create.includes('--prerelease'), 'a test build must never become the "latest release"');
    assert.ok(create[create.indexOf('--notes') + 1].includes('aaaaaaa'), 'the notes name the commit');
    assert.equal(gh.calls.length, 2);
  });

  it('replaces the file in the existing release afterwards instead of creating another', () => {
    const gh = fakeGh(['download-feature-a']);
    const result = publishDownload({ file: '/x/grand-strategy.html', branch: 'feature/a', sha, run: gh.run });
    assert.equal(result.created, false);
    assert.deepEqual(gh.calls.map((c) => c[1]), ['view', 'upload', 'edit']);
    assert.ok(gh.calls[1].includes('--clobber'), 'the old file is overwritten');
    assert.equal(gh.calls.some((c) => c[1] === 'create'), false);
  });

  it('is repeatable: publishing twice creates once and updates once', () => {
    const gh = fakeGh();
    publishDownload({ file: 'f.html', branch: 'b', sha, run: gh.run });
    publishDownload({ file: 'f.html', branch: 'b', sha, run: gh.run });
    assert.deepEqual(gh.calls.map((c) => c[1]), ['view', 'create', 'view', 'upload', 'edit']);
  });

  it('does not hide a failure to publish', () => {
    const run = (/** @type {string[]} */ args) => {
      if (args[1] === 'create') throw new Error('HTTP 403');
      throw new Error('release not found');
    };
    assert.throws(() => publishDownload({ file: 'f.html', branch: 'b', sha, run }), /403/);
  });
});
