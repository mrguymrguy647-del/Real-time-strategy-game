import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJsonFromDisk } from '../helpers/data.js';
import { economyMonth, BUDGET_CATEGORIES } from '../../src/formulas/economy.js';
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

  it('has a sentence for every news template the systems write', async () => {
    const { strings } = await readJsonFromDisk('data/i18n/en.json');
    const missing = [];
    for (const file of sourceFiles(path.join(ROOT, 'src/systems'))) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/template:\s*'([^']+)'/g)) if (!(match[1] in strings)) missing.push(`${path.relative(ROOT, file)}: ${match[1]}`);
    }
    assert.deepEqual(missing, []);
  });

  it('has the strings for the economy screens: alerts, budget levers, roles, and every part of every explained number', async () => {
    const { strings } = await readJsonFromDisk('data/i18n/en.json');
    const data = await (await import('../helpers/data.js')).loadTestData();
    const need = (key) => assert.ok(strings[key], key);

    for (const id of ['borrowing', 'debt']) need(`alert.${id}`);
    need('alert.runway.one');
    need('alert.runway.other');
    for (const lever of ['tax', ...BUDGET_CATEGORIES]) {
      need(`budget.${lever}`);
      need(`budget.${lever}.hint`);
    }
    for (const tier of [1, 2, 3]) need(`map.role.${tier}`);

    // Run the economy where every kind of part shows up: a difficulty bonus, the growth and rate limits, a government.
    const params = { interest: data.balance.economy.interest, growth: data.balance.economy.growth };
    const budget = { military: 0.02, research: 0.005, welfare: 0.15, infrastructure: 0.04 };
    const reference = { taxRate: 0.25, budget, debtRatio: 0.4 };
    const seen = new Set();
    for (const [economy, extra] of [
      [{ gdpBn: 100, taxRate: 0.25, treasuryMn: 1000, debtMn: 10_000 }, { incomeMultiplier: 1.1, modifiers: { add: 0, mul: 1.1 } }],
      [{ gdpBn: 100, taxRate: 0.6, treasuryMn: 1000, debtMn: 5_000_000 }, { trend: -0.2 }],
      [{ gdpBn: 100, taxRate: 0.1, treasuryMn: 1000, debtMn: 0 }, { trend: 0.4, budget: { ...budget, infrastructure: 0.3 } }],
    ]) {
      const result = economyMonth({ economy, budget, trend: 0.03, reference, ...extra }, params);
      for (const context of ['revenue', 'spending', 'interestRate', 'interest', 'growth']) for (const part of result[context].parts) seen.add(`why.${context}.${part.id}`);
    }
    assert.equal(seen.size, 19, `saw ${seen.size} kinds of part (3 revenue, 4 spending, 3 rate, 2 interest, 7 growth)`);
    for (const key of seen) need(key);
    for (const key of ['why.total', 'why.caption.interest', 'why.caption.interestRate']) need(key);
  });
});
