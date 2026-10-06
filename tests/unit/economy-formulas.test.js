import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, seedRngState } from '../../src/core/rng.js';
import { limitSum, modifierPart, productOf, sumOf } from '../../src/formulas/explain.js';
import {
  BUDGET_CATEGORIES,
  budgetBounds,
  economyMonth,
  growthRate,
  interest,
  interestRate,
  monthlyGdpMn,
  repayAmounts,
  runwayMonths,
  spending,
  stepValue,
  taxBounds,
  taxRevenue,
  tidy,
} from '../../src/formulas/economy.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();
const params = data.balance.economy;
const monthParams = { interest: params.interest, growth: params.growth };

const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} is not close to ${expected}`);

/** The parts of an explained value reproduce it (T-08, ARCHITECTURE §6.8). */
function assertReproduces(explained, label = '') {
  const rebuilt = explained.op === 'sum' ? explained.parts.reduce((a, p) => a + p.value, 0) : explained.parts.reduce((a, p) => a * p.value, 1);
  close(rebuilt, explained.value, 1e-9);
  assert.ok(Number.isFinite(explained.value), `${label} is finite`);
  for (const part of explained.parts) assert.ok(Number.isFinite(part.value) && typeof part.id === 'string', `${label} part ${part.id}`);
}

const budget = { military: 0.02, research: 0.005, welfare: 0.15, infrastructure: 0.04 };
const reference = { taxRate: 0.25, budget, debtRatio: 0.4 };

describe('explained values', () => {
  it('sum and product reproduce their value', () => {
    close(sumOf([{ id: 'a', value: 2 }, { id: 'b', value: -0.5 }]).value, 1.5);
    close(productOf([{ id: 'a', value: 2 }, { id: 'b', value: 0.25 }]).value, 0.5);
  });

  it('limitSum adds a corrective part only when a bound bites', () => {
    const sum = sumOf([{ id: 'a', value: 0.3 }, { id: 'b', value: 0.4 }]);
    assert.equal(limitSum(sum, 0, 1), sum);
    const capped = limitSum(sum, 0, 0.5);
    assert.equal(capped.value, 0.5);
    assert.deepEqual(capped.parts.at(-1).id, 'limit');
    assertReproduces(capped);
    assertReproduces(limitSum(sum, 0.9, 2));
  });

  it('modifierPart: a multiplier works on the size of the value, add comes first', () => {
    close(modifierPart(0.02, { add: 0, mul: 1.1 }), 0.002);
    close(modifierPart(-0.02, { add: 0, mul: 1.1 }), 0.002, 1e-9); // a bonus shrinks a loss
    close(modifierPart(0.02, { add: 0.01, mul: 1 }), 0.01);
    close(0.02 + modifierPart(0.02, { add: 0.01, mul: 2 }), (0.02 + 0.01) * 2);
    assert.equal(modifierPart(0.5, { add: 0, mul: 1 }), 0);
  });
});

describe('taxes and spending', () => {
  it('taxes are this month\'s GDP times the tax rate', () => {
    const result = taxRevenue({ gdpBn: 1200, taxRate: 0.25 });
    close(monthlyGdpMn(1200), 100_000);
    close(result.value, 25_000);
    assertReproduces(result, 'taxes');
    assert.deepEqual(result.parts.map((p) => p.id), ['gdp', 'taxRate']);
  });

  it('shows a difficulty multiplier as its own part, and only when it is not 1', () => {
    const result = taxRevenue({ gdpBn: 1200, taxRate: 0.25, incomeMultiplier: 1.15 });
    close(result.value, 28_750);
    assert.deepEqual(result.parts.map((p) => p.id), ['gdp', 'taxRate', 'difficulty']);
  });

  it('spending adds the four categories', () => {
    const result = spending({ gdpBn: 1200, budget });
    close(result.value, 100_000 * (0.02 + 0.005 + 0.15 + 0.04));
    assert.deepEqual(result.parts.map((p) => p.id), [...BUDGET_CATEGORIES]);
    assertReproduces(result, 'spending');
  });
});

describe('interest', () => {
  const rate = (debtMn, gdpBn = 1000) => interestRate({ debtMn, gdpBn }, params.interest);

  it('is the base rate up to a comfortable debt, then rises, then stops at the ceiling', () => {
    close(rate(0).value, params.interest.base);
    close(rate(0.6 * 1_000_000).value, params.interest.base);
    close(rate(1.1 * 1_000_000).value, params.interest.base + params.interest.riskSlope * 0.5);
    close(rate(1_000 * 1_000_000).value, params.interest.max);
    for (const debt of [0, 100_000, 800_000, 3_000_000, 50_000_000]) assertReproduces(rate(debt), `rate at ${debt}`);
  });

  it('never falls as debt grows', () => {
    let last = -1;
    for (let debt = 0; debt <= 5_000_000; debt += 250_000) {
      const value = rate(debt).value;
      assert.ok(value >= last, `at ${debt}`);
      last = value;
    }
  });

  it('a month of interest is the debt times a twelfth of the yearly rate', () => {
    close(interest({ debtMn: 120_000, rate: 0.05 }).value, 500);
    assertReproduces(interest({ debtMn: 120_000, rate: 0.05 }), 'interest');
  });
});

describe('growth', () => {
  const growth = (changes = {}) => growthRate({ trend: 0.03, taxRate: 0.25, budget, debtRatio: 0.4, reference, ...changes }, params.growth);

  it('is the country\'s own trend while its policies are what they started as', () => {
    close(growth().value, 0.03);
    assertReproduces(growth(), 'growth');
  });

  it('heavier taxes slow it, public investment and research speed it, more debt slows it', () => {
    assert.ok(growth({ taxRate: 0.3 }).value < 0.03);
    assert.ok(growth({ taxRate: 0.2 }).value > 0.03);
    assert.ok(growth({ budget: { ...budget, infrastructure: 0.05 } }).value > 0.03);
    assert.ok(growth({ budget: { ...budget, research: 0.01 } }).value > 0.03);
    assert.ok(growth({ budget: { ...budget, military: 0.06, welfare: 0.2 } }).value === growth().value, 'military and welfare have no direct effect yet');
    assert.ok(growth({ debtRatio: 1.2 }).value < 0.03);
    assert.ok(growth({ debtRatio: 0.1 }).value > 0.03);
  });

  it('a government multiplier helps whether growth is positive or negative', () => {
    const up = growth({ modifiers: { add: 0, mul: 1.1 } });
    close(up.value, 0.033);
    assert.equal(up.parts.at(-1).id, 'government');
    const negative = growth({ trend: -0.02, modifiers: { add: 0, mul: 1.1 } });
    close(negative.value, -0.018);
    assertReproduces(negative, 'negative growth');
  });

  it('world prices help a seller of resources and hurt a buyer, and the part only appears when it does something', () => {
    assert.deepEqual(growth().parts.map((p) => p.id), ['trend', 'taxes', 'infrastructure', 'research', 'debtLoad', 'government']);
    const windfall = growth({ resourcePrices: 0.04 }); // prices have added 4% of GDP a year to its income
    close(windfall.value, 0.03 + params.growth.resourcePrices * 0.04);
    assert.ok(windfall.parts.some((p) => p.id === 'resourcePrices'));
    assert.ok(growth({ resourcePrices: -0.04 }).value < 0.03);
    assertReproduces(windfall, 'windfall');
  });

  it('a shortage multiplies growth after the government does, and shows as its own part', () => {
    const famine = growth({ shortages: { add: 0, mul: 0.8 } });
    close(famine.value, 0.03 * 0.8);
    assert.equal(famine.parts.at(-1).id, 'shortages');
    assertReproduces(famine, 'famine');
    const both = growth({ modifiers: { add: 0, mul: 1.1 }, shortages: { add: 0, mul: 0.8 } });
    close(both.value, 0.03 * 1.1 * 0.8);
    assert.deepEqual(growth({ shortages: { add: 0, mul: 1 } }).parts.map((p) => p.id), growth().parts.map((p) => p.id), 'no shortage, no part');
  });

  it('stays within the configured bounds, and the parts still add up', () => {
    const low = growth({ taxRate: 0.6, debtRatio: 20, trend: -0.1 });
    assert.equal(low.value, params.growth.min);
    assertReproduces(low, 'low');
    const high = growth({ trend: 0.3, budget: { ...budget, infrastructure: 0.2, research: 0.2 } });
    assert.equal(high.value, params.growth.max);
    assertReproduces(high, 'high');
  });
});

describe('one month of the economy', () => {
  /** @param {object} economy */
  const month = (economy, extra = {}) => economyMonth({ economy: { gdpBn: 1200, taxRate: 0.25, treasuryMn: 10_000, debtMn: 0, ...economy }, budget, trend: 0.03, reference, ...extra }, monthParams);

  it('a surplus goes into the treasury', () => {
    const result = month({ taxRate: 0.3 });
    const expected = 100_000 * (0.3 - 0.215);
    close(result.balanceMn, expected);
    close(result.next.treasuryMn, 10_000 + expected);
    assert.equal(result.borrowedMn, 0);
  });

  it('and it stays there while there is debt: debt is repaid only by order, never by itself', () => {
    const result = month({ taxRate: 0.3, debtMn: 5_000 });
    close(result.next.treasuryMn, 10_000 + result.balanceMn);
    assert.equal(result.next.debtMn, 5_000);
    assert.equal('repaidMn' in result, false);
  });

  it('a deficit eats the treasury', () => {
    const result = month({ taxRate: 0.2 });
    assert.ok(result.balanceMn < 0);
    close(result.next.treasuryMn, 10_000 + result.balanceMn);
    assert.equal(result.borrowedMn, 0);
  });

  it('what the treasury cannot pay is borrowed, and the treasury never goes below zero', () => {
    const result = month({ taxRate: 0.2, treasuryMn: 1_000 });
    assert.equal(result.next.treasuryMn, 0);
    close(result.borrowedMn, -(1_000 + result.balanceMn));
    close(result.next.debtMn, result.borrowedMn);
  });

  it('the economy grows by a twelfth of its yearly rate', () => {
    const result = month({});
    close(result.next.gdpBn, 1200 * (1 + result.growth.value / 12));
  });

  it('every explanation reproduces its value', () => {
    const result = month({ debtMn: 700_000 }, { resourceIncome: sumOf([{ id: 'oil', value: 4_000 }]) });
    for (const key of ['taxes', 'resources', 'revenue', 'spending', 'interestRate', 'interest', 'growth']) assertReproduces(result[key], key);
  });

  it('income is taxes plus what the state earns from resources, and the balance counts both', () => {
    const without = month({ taxRate: 0.2 });
    const income = sumOf([{ id: 'oil', value: 5_000 }, { id: 'steel', value: 300 }]);
    const withOil = month({ taxRate: 0.2 }, { resourceIncome: income });
    assert.deepEqual(withOil.revenue.parts.map((p) => p.id), ['taxes', 'resources']);
    close(withOil.revenue.value, without.revenue.value + 5_300);
    close(withOil.balanceMn, without.balanceMn + 5_300);
    assert.equal(withOil.resources.value, 5_300);
    assert.deepEqual(withOil.resources.parts.map((p) => p.id), ['oil', 'steel']);
    assert.equal(without.resources.value, 0, 'no resource income given, none counted');
  });

  it('the difficulty multiplier applies to resource income as to taxes, and its part keeps the sum exact', () => {
    const income = sumOf([{ id: 'oil', value: 5_000 }]);
    const hard = month({ taxRate: 0.2 }, { resourceIncome: income, incomeMultiplier: 1.15 });
    close(hard.resources.value, 5_750);
    assert.deepEqual(hard.resources.parts.map((p) => p.id), ['oil', 'difficulty']);
    assertReproduces(hard.resources, 'hard resources');
    close(hard.taxes.value, 100_000 * 0.2 * 1.15);
  });

  it('a windfall from prices speeds the economy up (and the forecast of growth carries it)', () => {
    const base = month({});
    const windfall = month({}, { resourcePrices: 0.05 });
    assert.ok(windfall.growth.value > base.growth.value);
  });

  it('keeps money in balance for any mix of inputs: treasury and debt change by exactly the flows, nothing goes negative or NaN', () => {
    const rng = createRng(seedRngState(2026));
    for (let i = 0; i < 400; i++) {
      const economy = {
        gdpBn: 5 + rng.next() * 2000,
        taxRate: rng.next() * 0.6,
        treasuryMn: rng.chance(0.2) ? 0 : rng.next() * 300_000,
        debtMn: rng.chance(0.3) ? 0 : rng.next() * 3_000_000,
      };
      const b = { military: rng.next() * 0.12, research: rng.next() * 0.04, welfare: rng.next() * 0.3, infrastructure: rng.next() * 0.1 };
      const result = month(economy, { budget: b });
      const label = JSON.stringify({ economy, b });
      assert.ok(result.next.treasuryMn >= 0 && result.next.debtMn >= 0 && result.next.gdpBn > 0, label);
      assert.ok(result.borrowedMn >= 0, label);
      assert.ok(!(result.borrowedMn > 0 && result.next.treasuryMn > 0), `it only borrows when the treasury is empty: ${label}`);
      close(result.next.treasuryMn - economy.treasuryMn, result.balanceMn + result.borrowedMn, 1e-9);
      close(result.next.debtMn - economy.debtMn, result.borrowedMn, 1e-9);
      for (const value of Object.values(result.next)) assert.ok(Number.isFinite(value), label);
    }
  });

  it('raising taxes is worth more money now and less growth later', () => {
    const base = month({});
    const taxed = month({ taxRate: 0.3 });
    assert.ok(taxed.balanceMn > base.balanceMn);
    assert.ok(taxed.growth.value < base.growth.value);
  });
});

describe('the repay buttons', () => {
  it('pay a share of the debt, or all the treasury allows, never more than is owed or held', () => {
    assert.deepEqual(repayAmounts({ debtMn: 390_000, treasuryMn: 150_000 }, 0.1), { shareMn: 39_000, allMn: 150_000 });
    assert.deepEqual(repayAmounts({ debtMn: 390_000, treasuryMn: 20_000 }, 0.1), { shareMn: 20_000, allMn: 20_000 }, 'the treasury limits the share');
    assert.deepEqual(repayAmounts({ debtMn: 5_000, treasuryMn: 150_000 }, 0.1), { shareMn: 500, allMn: 5_000 }, 'the debt limits "all"');
    assert.deepEqual(repayAmounts({ debtMn: 0, treasuryMn: 150_000 }, 0.1), { shareMn: 0, allMn: 0 });
    assert.deepEqual(repayAmounts({ debtMn: 390_000, treasuryMn: 0 }, 0.1), { shareMn: 0, allMn: 0 });
  });
});

describe('treasury runway', () => {
  it('counts whole months at the current deficit, and is null when the treasury is not shrinking', () => {
    assert.equal(runwayMonths({ treasuryMn: 10_000, balanceMn: -3_000 }), 3);
    assert.equal(runwayMonths({ treasuryMn: 0, balanceMn: -1 }), 0);
    assert.equal(runwayMonths({ treasuryMn: 10_000, balanceMn: 0 }), null);
    assert.equal(runwayMonths({ treasuryMn: 10_000, balanceMn: 500 }), null);
  });
});

describe('the levers\' bounds and steps', () => {
  it('tidy removes floating-point tails, and never gives negative zero', () => {
    assert.equal(tidy(0.1 + 0.005), 0.105);
    assert.equal(tidy(0.27 + 0.03), 0.3);
    assert.ok(Object.is(tidy(-0.00004), 0));
    assert.ok(Object.is(tidy(-0), 0));
  });

  it('a tax rate may move 10 points either way, within the absolute limits', () => {
    assert.deepEqual(taxBounds(0.27, params), { min: 0.17, max: 0.37, step: 0.005 });
    assert.equal(taxBounds(0.1, params).min, params.taxMin);
    assert.equal(taxBounds(0.58, params).max, params.taxMax);
  });

  it('a budget share may go to nothing or up to its ceiling above the start', () => {
    assert.deepEqual(budgetBounds('military', 0.07, params), { min: 0, max: 0.12, step: 0.005 });
    assert.deepEqual(budgetBounds('research', 0.006, params), { min: 0, max: 0.026, step: 0.0025 });
  });

  it('stepValue moves one step and stops at the bounds', () => {
    const bounds = { min: 0, max: 0.02, step: 0.005 };
    assert.equal(stepValue(0.01, 1, bounds), 0.015);
    assert.equal(stepValue(0.0025, -1, bounds), 0);
    assert.equal(stepValue(0.02, 1, bounds), 0.02);
    assert.equal(stepValue(0, -1, bounds), 0);
    let value = 0;
    for (let i = 0; i < 4; i++) value = stepValue(value, 1, bounds);
    assert.equal(value, 0.02, 'four steps of 0.005 land exactly on 0.02');
  });
});
