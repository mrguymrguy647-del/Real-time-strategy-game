// The economy skeleton (GAME_DESIGN §4.1, G-35). Pure functions: numbers in, numbers out, every
// tunable in `params` (data/balance.json → economy). Each one returns { value, op, parts } so the
// report can say why. Money is in USD millions, GDP in USD billions a year, rates are fractions a
// year (G-25).
//
// A month, in order: the state collects taxes, pays for its budget and the interest on its debt;
// what is left (or missing) changes the treasury; a missing amount is borrowed, a surplus first
// repays debt; the economy grows by this month's share of its yearly growth rate.

import { limitSum, modifierPart, productOf, sumOf } from './explain.js';

/** The four spending categories the player sets, as shares of GDP. */
export const BUDGET_CATEGORIES = /** @type {const} */ (['military', 'research', 'welfare', 'infrastructure']);

/** @typedef {typeof BUDGET_CATEGORIES[number]} BudgetCategory */
/** @typedef {Record<BudgetCategory, number>} Budget */

/** GDP of one month, in USD millions. @param {number} gdpBn */
export const monthlyGdpMn = (gdpBn) => (gdpBn * 1000) / 12;

/**
 * Taxes collected in a month: this month's GDP × the tax rate × a multiplier that is 1 unless a
 * difficulty setting says otherwise.
 * @param {{ gdpBn: number, taxRate: number, incomeMultiplier?: number }} input
 * @returns {import('./explain.js').Explained}
 */
export function revenue({ gdpBn, taxRate, incomeMultiplier = 1 }) {
  const parts = [
    { id: 'gdp', value: monthlyGdpMn(gdpBn) },
    { id: 'taxRate', value: taxRate },
  ];
  if (incomeMultiplier !== 1) parts.push({ id: 'difficulty', value: incomeMultiplier });
  return productOf(parts);
}

/**
 * What the four budget categories cost in a month.
 * @param {{ gdpBn: number, budget: Budget }} input
 * @returns {import('./explain.js').Explained}
 */
export function spending({ gdpBn, budget }) {
  const gdp = monthlyGdpMn(gdpBn);
  return sumOf(BUDGET_CATEGORIES.map((id) => ({ id, value: gdp * budget[id] })));
}

/**
 * The yearly interest rate on the debt: a base rate, plus a risk premium that grows with the debt
 * above a comfortable share of GDP, up to a ceiling.
 * @param {{ debtMn: number, gdpBn: number }} input
 * @param {{ base: number, riskStart: number, riskSlope: number, max: number }} params
 * @returns {import('./explain.js').Explained}
 */
export function interestRate({ debtMn, gdpBn }, params) {
  const ratio = debtMn / (gdpBn * 1000);
  return limitSum(
    sumOf([
      { id: 'base', value: params.base },
      { id: 'risk', value: params.riskSlope * Math.max(0, ratio - params.riskStart) },
    ]),
    0,
    params.max,
  );
}

/**
 * Interest paid in a month: the debt × one twelfth of the yearly rate.
 * @param {{ debtMn: number, rate: number }} input
 * @returns {import('./explain.js').Explained}
 */
export function interest({ debtMn, rate }) {
  return productOf([
    { id: 'debt', value: debtMn },
    { id: 'rate', value: rate / 12 },
  ]);
}

/**
 * The yearly growth rate of the economy. It starts from the country's own trend (which already
 * includes its starting policies) and moves with how far today's policies are from those: heavier
 * taxes slow it, public investment and research speed it, a debt heavier than at the start slows
 * it. A government's growth modifiers then apply, and the result stays within sane bounds.
 *
 * @param {{
 *   trend: number, taxRate: number, budget: Budget, debtRatio: number,
 *   reference: { taxRate: number, budget: Budget, debtRatio: number },
 *   modifiers?: { add: number, mul: number },
 * }} input
 * @param {{ taxDrag: number, infrastructure: number, research: number, debtDrag: number, min: number, max: number }} params
 * @returns {import('./explain.js').Explained}
 */
export function growthRate({ trend, taxRate, budget, debtRatio, reference, modifiers = { add: 0, mul: 1 } }, params) {
  const terms = [
    { id: 'trend', value: trend },
    { id: 'taxes', value: params.taxDrag * (reference.taxRate - taxRate) },
    { id: 'infrastructure', value: params.infrastructure * (budget.infrastructure - reference.budget.infrastructure) },
    { id: 'research', value: params.research * (budget.research - reference.budget.research) },
    { id: 'debtLoad', value: params.debtDrag * (reference.debtRatio - debtRatio) },
  ];
  const subtotal = terms.reduce((total, term) => total + term.value, 0);
  terms.push({ id: 'government', value: modifierPart(subtotal, modifiers) });
  return limitSum(sumOf(terms), params.min, params.max);
}

/**
 * Everything one month does to one country's economy.
 *
 * @param {{
 *   economy: { gdpBn: number, taxRate: number, treasuryMn: number, debtMn: number },
 *   budget: Budget,
 *   trend: number,
 *   reference: { taxRate: number, budget: Budget, debtRatio: number },
 *   modifiers?: { add: number, mul: number },
 *   incomeMultiplier?: number,
 * }} input
 * @param {{ interest: Parameters<typeof interestRate>[1], growth: Parameters<typeof growthRate>[1] }} params
 */
export function economyMonth({ economy, budget, trend, reference, modifiers, incomeMultiplier }, params) {
  const { gdpBn, taxRate, treasuryMn, debtMn } = economy;
  const income = revenue({ gdpBn, taxRate, incomeMultiplier });
  const costs = spending({ gdpBn, budget });
  const rate = interestRate({ debtMn, gdpBn }, params.interest);
  const interestPaid = interest({ debtMn, rate: rate.value });
  const growth = growthRate({ trend, taxRate, budget, debtRatio: debtMn / (gdpBn * 1000), reference, modifiers }, params.growth);

  const balanceMn = income.value - costs.value - interestPaid.value;
  // The treasury never goes below zero: a shortfall is borrowed at once, a surplus repays debt first.
  const repaidMn = Math.min(debtMn, Math.max(0, balanceMn));
  const borrowedMn = Math.max(0, -(treasuryMn + balanceMn));
  const next = {
    gdpBn: gdpBn * (1 + growth.value / 12),
    treasuryMn: Math.max(0, treasuryMn + balanceMn - repaidMn),
    debtMn: debtMn - repaidMn + borrowedMn,
    growth: growth.value,
  };
  return { revenue: income, spending: costs, interestRate: rate, interest: interestPaid, growth, balanceMn, borrowedMn, repaidMn, next };
}

/** Rounds to four decimals, so a share such as 0.1 + 0.005 stays 0.105 and not 0.10500000000000001. @param {number} value */
export const tidy = (value) => Math.round(value * 10000) / 10000;

/**
 * How far a tax rate may be moved from where the country started, and in what steps. Rates change
 * a little at a time; the range keeps the lever sensible for a country that starts very high or low.
 * @param {number} startRate
 * @param {{ taxRange: number, taxMin: number, taxMax: number, taxStep: number }} params
 */
export function taxBounds(startRate, params) {
  return { min: Math.max(params.taxMin, tidy(startRate - params.taxRange)), max: Math.min(params.taxMax, tidy(startRate + params.taxRange)), step: params.taxStep };
}

/**
 * The same for one budget category: from nothing up to a ceiling above the starting share.
 * @param {BudgetCategory} category
 * @param {number} startShare
 * @param {{ budgetRange: Budget, budgetStep: Budget }} params
 */
export function budgetBounds(category, startShare, params) {
  return { min: 0, max: tidy(startShare + params.budgetRange[category]), step: params.budgetStep[category] };
}

/**
 * One tap on a plus or minus button: a step up or down, kept within the bounds.
 * @param {number} value
 * @param {1 | -1} direction
 * @param {{ min: number, max: number, step: number }} bounds
 */
export function stepValue(value, direction, { min, max, step }) {
  return Math.min(max, Math.max(min, tidy(value + direction * step)));
}

/**
 * How many whole months the treasury lasts if every month looks like this one, or null when it is
 * not shrinking.
 * @param {{ treasuryMn: number, balanceMn: number }} input
 * @returns {number | null}
 */
export function runwayMonths({ treasuryMn, balanceMn }) {
  if (balanceMn >= 0) return null;
  return Math.floor(treasuryMn / -balanceMn);
}
