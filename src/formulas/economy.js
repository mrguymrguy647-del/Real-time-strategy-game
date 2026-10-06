// The economy skeleton (GAME_DESIGN §4.1, G-35). Pure functions: numbers in, numbers out, every
// tunable in `params` (data/balance.json → economy). Each one returns { value, op, parts } so the
// report can say why. Money is in USD millions, GDP in USD billions a year, rates are fractions a
// year (G-25).
//
// A month, in order: the state collects taxes and what it earns from the resources it sells abroad
// (formulas/market.js), pays for its budget and the interest on its debt; what is left goes into the
// treasury, and a shortfall comes out of it. The treasury never goes below
// zero: what it cannot cover is borrowed at once. Debt is repaid only when the player says so (the
// REPAY_DEBT command), never by itself, so the treasury moves by exactly what the month earned or
// lost. The economy then grows by this month's share of its yearly growth rate.

import { limitSum, modifierPart, productOf, sumOf } from './explain.js';

/** The four spending categories the player sets, as shares of GDP. */
export const BUDGET_CATEGORIES = /** @type {const} */ (['military', 'research', 'welfare', 'infrastructure']);

/** @typedef {typeof BUDGET_CATEGORIES[number]} BudgetCategory */
/** @typedef {Record<BudgetCategory, number>} Budget */

/** What a modifier list that does nothing comes to. */
const NO_MODIFIERS = { add: 0, mul: 1 };

/** GDP of one month, in USD millions. @param {number} gdpBn */
export const monthlyGdpMn = (gdpBn) => (gdpBn * 1000) / 12;

/**
 * Taxes collected in a month: this month's GDP × the tax rate × a multiplier that is 1 unless a
 * difficulty setting says otherwise.
 * @param {{ gdpBn: number, taxRate: number, incomeMultiplier?: number }} input
 * @returns {import('./explain.js').Explained}
 */
export function taxRevenue({ gdpBn, taxRate, incomeMultiplier = 1 }) {
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
 * it, and world prices help a country that sells resources and hurt one that buys them. A
 * government's growth modifiers then apply, then those of the shortages the country is in, and the
 * result stays within sane bounds.
 *
 * @param {{
 *   trend: number, taxRate: number, budget: Budget, debtRatio: number,
 *   reference: { taxRate: number, budget: Budget, debtRatio: number },
 *   resourcePrices?: number,
 *   modifiers?: { add: number, mul: number },
 *   shortages?: { add: number, mul: number },
 * }} input
 *   `resourcePrices`: what world prices do to income, as a share of GDP a year (formulas/market.js priceWindfall)
 * @param {{ taxDrag: number, infrastructure: number, research: number, debtDrag: number, resourcePrices: number, min: number, max: number }} params
 * @returns {import('./explain.js').Explained}
 */
export function growthRate({ trend, taxRate, budget, debtRatio, reference, resourcePrices = 0, modifiers = NO_MODIFIERS, shortages = NO_MODIFIERS }, params) {
  const terms = [
    { id: 'trend', value: trend },
    { id: 'taxes', value: params.taxDrag * (reference.taxRate - taxRate) },
    { id: 'infrastructure', value: params.infrastructure * (budget.infrastructure - reference.budget.infrastructure) },
    { id: 'research', value: params.research * (budget.research - reference.budget.research) },
    { id: 'debtLoad', value: params.debtDrag * (reference.debtRatio - debtRatio) },
  ];
  // these two parts appear only when they do something, so a list of reasons is not padded with zeros
  if (resourcePrices !== 0) terms.push({ id: 'resourcePrices', value: params.resourcePrices * resourcePrices });
  const subtotal = terms.reduce((total, term) => total + term.value, 0);
  const government = modifierPart(subtotal, modifiers);
  terms.push({ id: 'government', value: government });
  const shortage = modifierPart(subtotal + government, shortages);
  if (shortage !== 0) terms.push({ id: 'shortages', value: shortage });
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
 *   shortages?: { add: number, mul: number },
 *   incomeMultiplier?: number,
 *   resourceIncome?: import('./explain.js').Explained | null,
 *   resourcePrices?: number,
 * }} input
 *   `resourceIncome`: what the state earns from the resources it sells abroad this month, in USD millions, with its parts
 *   (systems/resources.js; the same difficulty multiplier applies to it as to taxes);
 *   `resourcePrices`: what world prices do to its income, as a share of GDP a year
 * @param {{ interest: Parameters<typeof interestRate>[1], growth: Parameters<typeof growthRate>[1] }} params
 */
export function economyMonth({ economy, budget, trend, reference, modifiers, shortages, incomeMultiplier = 1, resourceIncome = null, resourcePrices = 0 }, params) {
  const { gdpBn, taxRate, treasuryMn, debtMn } = economy;
  const taxes = taxRevenue({ gdpBn, taxRate, incomeMultiplier });
  const resources = resourceIncome
    ? sumOf(incomeMultiplier === 1 ? resourceIncome.parts : [...resourceIncome.parts, { id: 'difficulty', value: resourceIncome.value * (incomeMultiplier - 1) }])
    : sumOf([]);
  const income = sumOf([
    { id: 'taxes', value: taxes.value },
    { id: 'resources', value: resources.value },
  ]);
  const costs = spending({ gdpBn, budget });
  const rate = interestRate({ debtMn, gdpBn }, params.interest);
  const interestPaid = interest({ debtMn, rate: rate.value });
  const growth = growthRate({ trend, taxRate, budget, debtRatio: debtMn / (gdpBn * 1000), reference, resourcePrices, modifiers, shortages }, params.growth);

  const balanceMn = income.value - costs.value - interestPaid.value;
  // The treasury takes the surplus and pays the shortfall; what it cannot pay is borrowed.
  const borrowedMn = Math.max(0, -(treasuryMn + balanceMn));
  const next = {
    gdpBn: gdpBn * (1 + growth.value / 12),
    treasuryMn: Math.max(0, treasuryMn + balanceMn),
    debtMn: debtMn + borrowedMn,
    growth: growth.value,
  };
  return { taxes, resources, revenue: income, spending: costs, interestRate: rate, interest: interestPaid, growth, balanceMn, borrowedMn, next };
}

/**
 * What the two Repay buttons pay: a share of the debt (a tenth, say), or as much as the treasury
 * allows. Never more than is owed or held.
 * @param {{ debtMn: number, treasuryMn: number }} economy
 * @param {number} share the share of the debt the first button pays
 * @returns {{ shareMn: number, allMn: number }}
 */
export function repayAmounts({ debtMn, treasuryMn }, share) {
  return { shareMn: Math.min(debtMn * share, treasuryMn), allMn: Math.min(debtMn, treasuryMn) };
}

/** Rounds to four decimals, so a share such as 0.1 + 0.005 stays 0.105 and not 0.10500000000000001 (and never gives -0, which a save file would turn into 0). @param {number} value */
export const tidy = (value) => Math.round(value * 10000) / 10000 + 0; // + 0 turns a -0 into 0

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
