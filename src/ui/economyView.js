// What the screens show of a country's economy: its numbers at the start of a scenario (straight from
// the data) or as they are now in a running game. Both have the same shape, so a panel does not care
// which it is given. Money is in USD millions, GDP in billions (G-25).

import { startIncomeShare } from '../formulas/market.js';
import { countryFlows, resourceIncomeOf } from '../systems/resourceFlows.js';

/**
 * @typedef {{ gdpBn: number, taxRate: number, resourceShare: number, treasuryMn: number, debtMn: number }} EconomyView
 *   `taxRate` is the taxes alone; `resourceShare` is what the state earns from selling resources abroad, as a share of GDP a year
 */

/**
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 * @returns {EconomyView}
 */
export function startEconomy(data, countryId) {
  const { start } = data.countries.byId[countryId];
  const { economy } = start;
  return { gdpBn: economy.gdpBn, taxRate: economy.taxRate, resourceShare: startIncomeShare(start, data.activeResources, data.balance.market), treasuryMn: economy.treasuryMn, debtMn: economy.debtPctGdp * economy.gdpBn * 1000 };
}

/**
 * @param {any} state a running game's state
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 * @returns {EconomyView | null} null for a country that is not in the game
 */
export function liveEconomy(state, data, countryId) {
  if (!Object.hasOwn(state.countries, countryId)) return null;
  const { economy } = state.countries[countryId];
  const income = resourceIncomeOf(countryFlows(state, data, countryId)).value;
  return { gdpBn: economy.gdpBn, taxRate: economy.taxRate, resourceShare: (income * 12) / (economy.gdpBn * 1000), treasuryMn: economy.treasuryMn, debtMn: economy.debtMn };
}
