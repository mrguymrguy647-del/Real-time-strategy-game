import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJsonFromDisk } from '../helpers/data.js';
import { hasKey, setMissingHandler, setStrings, t, tn } from '../../src/util/i18n.js';

afterEach(() => {
  setStrings({});
  setMissingHandler(() => {});
});

describe('t() and tn()', () => {
  it('looks up text and fills placeholders', () => {
    setStrings({ 'greet.you': 'Hello, {name}! You have {n} turns.' });
    assert.equal(t('greet.you', { name: 'Ada', n: 3 }), 'Hello, Ada! You have 3 turns.');
  });

  it('leaves unknown placeholders visible and ignores extra params', () => {
    setStrings({ 'a.b': 'Value {x} and {y}' });
    assert.equal(t('a.b', { x: 1, extra: 2 }), 'Value 1 and {y}');
  });

  it('marks missing keys and reports each one once', () => {
    const reported = [];
    setMissingHandler((key) => reported.push(key));
    assert.equal(t('nope.key'), '⟦nope.key⟧');
    t('nope.key');
    t('other.key');
    assert.deepEqual(reported, ['nope.key', 'other.key']);
  });

  it('does not treat prototype properties as keys', () => {
    setStrings({});
    assert.equal(hasKey('constructor'), false);
    assert.equal(t('constructor'), '⟦constructor⟧');
  });

  it('picks .one or .other by number and always provides {n}', () => {
    setStrings({ 'saves.count.one': '{n} save', 'saves.count.other': '{n} saves' });
    assert.equal(tn('saves.count', 1), '1 save');
    assert.equal(tn('saves.count', 0), '0 saves');
    assert.equal(tn('saves.count', 5), '5 saves');
  });
});

/** All .js files under a directory. @param {string} dir @returns {string[]} */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

describe('the real string table (G-30)', () => {
  it('contains every key that the source code looks up', async () => {
    const { strings } = (await readJsonFromDisk('data/i18n/en.json'));
    const missing = [];
    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
      if (file.endsWith(path.join('util', 'i18n.js'))) continue;
      const code = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      for (const match of code.matchAll(/(?<![\w.$])tn?\(\s*(['"])([^'"$`]+)\1/g)) {
        const call = match[0].startsWith('tn') ? 'tn' : 't';
        const key = match[2];
        const keys = call === 'tn' ? [`${key}.one`, `${key}.other`] : [key];
        for (const k of keys) if (!(k in strings)) missing.push(`${path.relative(ROOT, file)}: ${k}`);
      }
    }
    assert.deepEqual(missing, [], `keys used in code but missing from data/i18n/en.json:\n${missing.join('\n')}`);
  });

  it('has the twelve month names', async () => {
    const { strings } = await readJsonFromDisk('data/i18n/en.json');
    for (let m = 1; m <= 12; m++) assert.ok(strings[`month.${m}`], `month.${m}`);
  });

  it('has the strings whose keys are built from data: text sizes, platforms, save errors', async () => {
    const { strings } = await readJsonFromDisk('data/i18n/en.json');
    const { TEXT_SCALES } = await import('../../src/ui/settings.js');
    for (const { key } of TEXT_SCALES) assert.ok(strings[`settings.textSize.${key}`], `settings.textSize.${key}`);
    for (const name of ['ios', 'android', 'generic']) assert.ok(strings[`diag.platform.${name}`], `diag.platform.${name}`);

    // every error code the core can throw has a message the player can read
    const codes = new Set();
    for (const file of sourceFiles(path.join(ROOT, 'src/core'))) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/new SaveError\(\s*'([a-z_]+)'/g)) codes.add(m[1]);
    }
    assert.ok(codes.size >= 6);
    for (const code of codes) assert.ok(strings[`saves.error.${code}`], `saves.error.${code}`);
  });
});
