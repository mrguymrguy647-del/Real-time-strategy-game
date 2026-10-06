// The monthly economy (turn order 50, G-35). Every country collects its taxes and what it earns
// from the resources it sells abroad (G-39), pays for its budget and the interest on its debt, and
// its treasury, debt and GDP move accordingly (formulas/economy.js does the arithmetic; this file
// only reads the state, applies the result and tells the news). The player's country also keeps the
// explanation of each number for the report's "why?".

import { modifiersFor, shortageModifiers } from '../core/modifiers.js';
import { economyMonth, runwayMonths } from '../formulas/economy.js';
import { countryFlows, resourceIncomeOf, resourceWindfallOf } from './resourceFlows.js';

/**
 * Everything economyMonth needs for one country, read from the state and the data.
 * @param {any} state
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 */
function inputsFor(state, data, countryId) {
  const country = state.countries[countryId];
  const { start } = data.countries.byId[countryId];
  const params = data.balance.economy;
  const difficulty = data.balance.difficulty[state.meta.difficulty] ?? {};
  const flows = countryFlows(state, data, countryId); // the month's resources, which the resources system (55) settles after this
  return {
    input: {
      economy: country.economy,
      budget: country.budget,
      trend: start.economy.growth,
      reference: { taxRate: start.economy.taxRate, budget: start.budget, debtRatio: start.economy.debtPctGdp },
      modifiers: modifiersFor(data, country, 'country.economy.growth'),
      shortages: shortageModifiers(data, country, 'country.economy.growth'),
      incomeMultiplier: countryId === state.player.countryId ? 1 : (difficulty.aiIncome ?? 1),
      resourceIncome: resourceIncomeOf(flows),
      resourcePrices: resourceWindfallOf(data, flows, country.economy.gdpBn).value,
    },
    params: { interest: params.interest, growth: params.growth },
  };
}

/**
 * What next month would do to a country with its standing orders as they are now. Changes nothing:
 * this is the what-if of ARCHITECTURE §6.8, and the turn itself uses the same function.
 * @param {any} state
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 */
export function previewEconomy(state, data, countryId) {
  const { input, params } = inputsFor(state, data, countryId);
  return economyMonth(input, params);
}

/**
 * Warnings about a country's money, for the report and the budget screen (GAME_DESIGN §1: alerts and
 * forecasts). Read-only. Money values are USD millions in params whose names end in "Mn".
 * @param {any} state
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 * @returns {Array<{ id: 'borrowing' | 'runway' | 'debt', params: Record<string, number> }>}
 */
export function economyAlerts(state, data, countryId) {
  const { economy } = state.countries[countryId];
  const forecast = previewEconomy(state, data, countryId);
  const warnings = data.balance.economy.warnings;
  /** @type {Array<{ id: 'borrowing' | 'runway' | 'debt', params: Record<string, number> }>} */
  const alerts = [];
  if (forecast.borrowedMn >= 1) {
    alerts.push({ id: 'borrowing', params: { amountMn: forecast.borrowedMn } });
  } else {
    // The treasury covers next month (or the state would be borrowing); how many months more at this rate?
    const months = runwayMonths({ treasuryMn: economy.treasuryMn, balanceMn: forecast.balanceMn });
    if (months !== null && months <= warnings.runwayMonths) alerts.push({ id: 'runway', params: { n: months } });
  }
  const ratio = economy.debtMn / (economy.gdpBn * 1000);
  if (ratio >= warnings.debtRatio) alerts.push({ id: 'debt', params: { percent: Math.round(ratio * 100), interestMn: forecast.interest.value } });
  return alerts;
}

/** @type {import('../core/turn.js').System} */
export const economySystem = {
  id: 'economy',
  order: 50,
  cadence: 'monthly',
  step(ctx) {
    const { state, data } = ctx;
    const debtLimit = data.balance.economy.warnings.debtRatio;
    for (const id of Object.keys(state.countries)) {
      const { economy } = state.countries[id];
      const result = previewEconomy(state, data, id);
      const previous = economy.last;
      const ratioBefore = economy.debtMn / (economy.gdpBn * 1000);

      economy.gdpBn = result.next.gdpBn;
      economy.treasuryMn = result.next.treasuryMn;
      economy.debtMn = result.next.debtMn;
      economy.last = {
        period: { year: state.clock.year, month: state.clock.month }, // its own object: state never shares references
        revenueMn: result.revenue.value,
        taxMn: result.taxes.value,
        resourceMn: result.resources.value,
        spendingMn: result.spending.value,
        interestMn: result.interest.value,
        rate: result.interestRate.value,
        growth: result.growth.value,
        balanceMn: result.balanceMn,
        borrowedMn: result.borrowedMn,
      };
      if (id !== state.player.countryId) continue;

      economy.last.why = { taxes: result.taxes, resources: result.resources, spending: result.spending, interestRate: result.interestRate, interest: result.interest, growth: result.growth };
      const borrowedBefore = (previous?.borrowedMn ?? 0) >= 1;
      const borrowedNow = result.borrowedMn >= 1;
      if (borrowedNow && !borrowedBefore) {
        ctx.news({ importance: 3, template: 'news.economy.borrowing', params: { amountMn: result.borrowedMn }, refs: [id] });
      } else if (borrowedBefore && !borrowedNow) {
        ctx.news({ importance: 2, template: 'news.economy.solvent', refs: [id] });
      }
      const ratioAfter = economy.debtMn / (economy.gdpBn * 1000);
      if (ratioBefore < debtLimit && ratioAfter >= debtLimit) {
        ctx.news({ importance: 2, template: 'news.economy.debtHigh', params: { percent: Math.round(ratioAfter * 100) }, refs: [id] });
      }
    }
  },
};
