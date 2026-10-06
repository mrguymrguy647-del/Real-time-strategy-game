import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setStrings } from '../../src/util/i18n.js';
import { economyMonth } from '../../src/formulas/economy.js';
import { whyLines } from '../../src/ui/components/why.js';
import { formatMoneyMn, formatParams, formatPercent, newsText, toneOf } from '../../src/ui/format.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();

before(() => setStrings(data.i18n.strings));
afterEach(() => setStrings(data.i18n.strings));

describe('money for the report', () => {
  it('writes millions with three significant digits, from millions up to trillions', () => {
    const cases = [
      [0, '$0 million'],
      [850, '$850 million'],
      [999.4, '$999 million'],
      [999.6, '$1 billion'],
      [1_000, '$1 billion'],
      [29_810, '$29.8 billion'],
      [99_940, '$99.9 billion'],
      [152_300, '$152 billion'],
      [998_000, '$998 billion'],
      [1_310_000, '$1.31 trillion'],
      [2_000_000, '$2 trillion'],
    ];
    for (const [millions, text] of cases) assert.equal(formatMoneyMn(millions), text, String(millions));
  });

  it('signs amounts with a real minus sign when asked, and never shows -0', () => {
    assert.equal(formatMoneyMn(29_810, { signed: true }), '+$29.8 billion');
    assert.equal(formatMoneyMn(-1_200, { signed: true }), '−$1.2 billion');
    assert.equal(formatMoneyMn(0, { signed: true }), '$0 million');
    assert.equal(formatMoneyMn(0.3, { signed: true }), '$0 million', 'an amount that rounds to nothing has no sign');
    assert.equal(formatMoneyMn(-0.3, { signed: true }), '$0 million');
    assert.equal(formatMoneyMn(-0.3), '$0 million');
    assert.equal(formatMoneyMn(-1_200), '−$1.2 billion');
  });
});

describe('percentages', () => {
  it('trims to the decimals asked for and signs on request', () => {
    assert.equal(formatPercent(0.27), '27%');
    assert.equal(formatPercent(0.275), '27.5%');
    assert.equal(formatPercent(0.0075, { decimals: 2 }), '0.75%');
    assert.equal(formatPercent(0.0033333, { decimals: 2 }), '0.33%');
    assert.equal(formatPercent(0.275, { decimals: 0 }), '28%');
    assert.equal(formatPercent(0.039, { signed: true }), '+3.9%');
    assert.equal(formatPercent(-0.002, { signed: true }), '−0.2%');
    assert.equal(formatPercent(0, { signed: true }), '0%');
  });

  it('toneOf colors by sign, with a dead zone around zero', () => {
    assert.deepEqual([toneOf(10), toneOf(-10), toneOf(0.2), toneOf(-0.2), toneOf(0)], ['pos', 'neg', '', '', '']);
  });
});

describe('texts with numbers in them', () => {
  it('writes params named ...Mn as money and leaves the rest alone', () => {
    assert.deepEqual(formatParams({ amountMn: 3_400, percent: 105, name: 'x' }), { amountMn: '$3.4 billion', percent: 105, name: 'x' });
    assert.deepEqual(formatParams(undefined), {});
  });

  it('fills a news template', () => {
    assert.equal(newsText({ template: 'news.economy.borrowing', params: { amountMn: 3_400 } }), 'The treasury ran dry. The state borrowed $3.4 billion to pay its bills.');
    assert.equal(newsText({ template: 'news.economy.debtHigh', params: { percent: 101 } }), 'Public debt passed 101% of GDP.');
    assert.equal(newsText({ template: 'news.economy.solvent' }), 'The treasury is paying its own way again.');
  });
});

describe('the "why" of a number', () => {
  const budget = { military: 0.02, research: 0.005, welfare: 0.15, infrastructure: 0.04 };
  const month = economyMonth(
    { economy: { gdpBn: 1200, taxRate: 0.27, treasuryMn: 10_000, debtMn: 360_000 }, budget, trend: 0.035, reference: { taxRate: 0.25, budget, debtRatio: 0.3 }, modifiers: { add: 0, mul: 1.1 } },
    { interest: data.balance.economy.interest, growth: data.balance.economy.growth },
  );

  it('income: GDP this month times the tax rate, ending in the total', () => {
    assert.deepEqual(whyLines('revenue', month.revenue), [
      { label: 'GDP this month', text: '$100 billion' },
      { label: '× Tax rate', text: '27%' },
      { label: 'Total', text: '$27 billion', total: true },
    ]);
  });

  it('spending: one line per category', () => {
    const lines = whyLines('spending', month.spending);
    assert.deepEqual(lines.map((line) => line.label), ['Military', 'Research', 'Welfare and services', 'Infrastructure', 'Total']);
    assert.equal(lines.at(-1).text, '$21.5 billion');
  });

  it('interest: the debt times the monthly rate, and the yearly rate it comes from', () => {
    assert.deepEqual(whyLines('interest', month.interest).map((line) => line.text), ['$360 billion', '0.33%', '$1.2 billion']);
    assert.deepEqual(whyLines('interestRate', month.interestRate).map((line) => line.text), ['4%', '0%', '4%']);
  });

  it('growth: signed percentages that add up to the total', () => {
    const lines = whyLines('growth', month.growth);
    assert.deepEqual(lines.map((line) => line.label), [
      "The country's own trend",
      'Taxes compared with the start',
      'Infrastructure compared with the start',
      'Research compared with the start',
      'Debt compared with the start',
      'Type of government',
      'Total',
    ]);
    assert.equal(lines[0].text, '+3.5%');
    assert.match(lines[1].text, /^−/, 'higher taxes than at the start slow growth');
    assert.equal(lines.at(-1).text, '+3%'); // (3.5% − 0.8% for the heavier taxes) × 1.1 for a democracy = 2.97%
  });

  it('refuses a number it has no words for', () => {
    assert.throws(() => whyLines('mystery', month.revenue), /Unknown number "mystery"/);
  });
});
