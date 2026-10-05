// The publisher's git mechanics, tested against real local repositories: a bare "origin" and a
// working checkout. Nothing here touches the network.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publish, slugify } from '../../tools/publish-pages.mjs';
import { setStrings } from '../../src/util/i18n.js';
import { readJsonFromDisk } from '../helpers/data.js';

const strings = (await readJsonFromDisk('data/i18n/en.json')).strings;
setStrings(strings);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-publish-test-'));
const origin = path.join(tmp, 'origin.git');
const repo = path.join(tmp, 'repo');
const sha = (/** @type {string} */ c) => c.repeat(40);

/** @param {string} cwd @param {...string} args */
function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

/** A built-site folder. @param {string} name @param {Record<string, string>} files */
function makeDist(name, files) {
  const dir = path.join(tmp, 'dist-' + name);
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

/** Fresh checkout of the gh-pages branch, to look at what was published. */
function view() {
  const dir = path.join(tmp, 'view');
  fs.rmSync(dir, { recursive: true, force: true });
  git(tmp, 'clone', '-q', '--branch', 'gh-pages', origin, dir);
  return dir;
}
const read = (/** @type {string} */ dir, /** @type {string} */ rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const pagesHead = () => git(origin, 'rev-parse', 'gh-pages');

/** Create a branch on origin so the publisher sees it as alive. @param {string} name */
const pushBranch = (name) => git(repo, 'push', '-q', 'origin', `HEAD:refs/heads/${name}`);

before(() => {
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  git(tmp, 'init', '-q', '-b', 'main', repo);
  fs.writeFileSync(path.join(repo, 'README'), 'source');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'remote', 'add', 'origin', origin);
  git(repo, 'push', '-q', 'origin', 'main');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('slugify', () => {
  it('makes safe folder names', () => {
    assert.equal(slugify('feature/My Thing'), 'feature-my-thing');
    assert.equal(slugify('ccr-5ed68e3d-6cg5fd'), 'ccr-5ed68e3d-6cg5fd');
    assert.equal(slugify('///'), 'branch');
    assert.equal(slugify('A'.repeat(100)).length, 60);
    assert.equal(slugify('v1.2_x'), 'v1.2_x');
  });
});

describe('publishing to gh-pages', () => {
  const base = { repoDir: repo, push: true, remote: 'origin' };

  it('publishes a preview first, with a placeholder at the root', () => {
    pushBranch('feature/cool-thing');
    const dist = makeDist('p1', { 'index.html': 'preview v1', 'old.js': 'old', 'assets/a.txt': 'a' });
    const result = publish({ ...base, dist, branch: 'feature/cool-thing', sha: sha('a') });
    assert.deepEqual(result, { changed: true, folder: 'preview/feature-cool-thing/' });

    const site = view();
    assert.equal(read(site, 'preview/feature-cool-thing/index.html'), 'preview v1');
    assert.equal(read(site, 'preview/feature-cool-thing/assets/a.txt'), 'a');
    assert.ok(read(site, 'index.html').includes('gs-placeholder'), 'a placeholder stands in for the main site');
    assert.ok(fs.existsSync(path.join(site, '.nojekyll')));
    const list = read(site, 'preview/index.html');
    assert.ok(list.includes('feature/cool-thing') && list.includes('aaaaaaa'));
  });

  it('publishes main to the root and keeps the previews', () => {
    const dist = makeDist('m1', { 'index.html': 'main v1', 'app.js': 'app', '.nojekyll': '' });
    assert.deepEqual(publish({ ...base, dist, branch: 'main', sha: sha('b') }), { changed: true, folder: '' });

    const site = view();
    assert.equal(read(site, 'index.html'), 'main v1');
    assert.equal(read(site, 'app.js'), 'app');
    assert.equal(read(site, 'preview/feature-cool-thing/index.html'), 'preview v1', 'the preview survived');
    assert.ok(read(site, 'preview/index.html').includes(strings['previews.main']), 'the list links to the main version');
  });

  it('replaces a preview in place and drops files that no longer exist', () => {
    const dist = makeDist('p2', { 'index.html': 'preview v2' });
    publish({ ...base, dist, branch: 'feature/cool-thing', sha: sha('c') });
    const site = view();
    assert.equal(read(site, 'preview/feature-cool-thing/index.html'), 'preview v2');
    assert.equal(fs.existsSync(path.join(site, 'preview/feature-cool-thing/old.js')), false);
    assert.equal(read(site, 'index.html'), 'main v1', 'main is untouched by a preview deploy');
    assert.equal(JSON.parse(read(site, 'preview/previews.json')).previews.length, 1);
  });

  it('does nothing when the same commit is published again', () => {
    const dist = makeDist('p2', { 'index.html': 'preview v2' });
    const before = pagesHead();
    assert.equal(publish({ ...base, dist, branch: 'feature/cool-thing', sha: sha('c') }).changed, false);
    assert.equal(pagesHead(), before, 'no empty commit');
  });

  it('removes the preview of a branch that was deleted', () => {
    git(repo, 'push', '-q', 'origin', '--delete', 'feature/cool-thing');
    const dist = makeDist('m2', { 'index.html': 'main v2', '.nojekyll': '' });
    publish({ ...base, dist, branch: 'main', sha: sha('d') });
    const site = view();
    assert.equal(fs.existsSync(path.join(site, 'preview/feature-cool-thing')), false);
    assert.deepEqual(JSON.parse(read(site, 'preview/previews.json')).previews, []);
    assert.ok(read(site, 'preview/index.html').includes(strings['previews.none']));
    assert.equal(read(site, 'index.html'), 'main v2');
  });

  it('gives two branches that slugify alike separate folders', () => {
    pushBranch('Feat/a');
    pushBranch('feat-a');
    const dist = makeDist('p3', { 'index.html': 'x' });
    const one = publish({ ...base, dist, branch: 'Feat/a', sha: sha('e') });
    const two = publish({ ...base, dist, branch: 'feat-a', sha: sha('f') });
    assert.equal(one.folder, 'preview/feat-a/');
    assert.match(two.folder, /^preview\/feat-a-[0-9a-f]{6}\/$/);
    const site = view();
    assert.ok(fs.existsSync(path.join(site, one.folder)) && fs.existsSync(path.join(site, two.folder)));
  });

  it('keeps only the newest previews', () => {
    for (const name of ['one', 'two', 'three']) pushBranch(`keep/${name}`);
    const dist = makeDist('p4', { 'index.html': 'k' });
    publish({ ...base, dist, branch: 'keep/one', sha: sha('1'), keep: 2, now: new Date('2030-01-01T00:00:00Z') });
    publish({ ...base, dist, branch: 'keep/two', sha: sha('2'), keep: 2, now: new Date('2030-01-02T00:00:00Z') });
    publish({ ...base, dist, branch: 'keep/three', sha: sha('3'), keep: 2, now: new Date('2030-01-03T00:00:00Z') });
    const site = view();
    const slugs = JSON.parse(read(site, 'preview/previews.json')).previews.map((/** @type {any} */ p) => p.slug);
    assert.deepEqual(slugs, ['keep-three', 'keep-two']);
    assert.equal(fs.existsSync(path.join(site, 'preview/keep-one')), false);
  });

  it('does not push on a dry run', () => {
    const before = pagesHead();
    const dist = makeDist('p5', { 'index.html': 'dry' });
    const result = publish({ ...base, push: false, dist, branch: 'keep/three', sha: sha('9') });
    assert.equal(result.changed, true);
    assert.equal(pagesHead(), before);
  });
});
