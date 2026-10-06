// What the screens show of a country's economy: its numbers at the start of a scenario (straight from
// the data) or as they are now in a running game. Both have the same shape, so a panel does not care
// which it is given. Money is in USD millions, GDP in billions (G-25).

/**
 * @typedef {{ gdpBn: number, taxRate: number, treasuryMn: number, debtMn: number }} EconomyView
 */

/**
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 * @returns {EconomyView}
 */
export function startEconomy(data, countryId) {
  const { economy } = data.countries.byId[countryId].start;
  return { gdpBn: economy.gdpBn, taxRate: economy.taxRate, treasuryMn: economy.treasuryMn, debtMn: economy.debtPctGdp * economy.gdpBn * 1000 };
}

/**
 * @param {any} state a running game's state
 * @param {string} countryId
 * @returns {EconomyView | null} null for a country that is not in the game
 */
export function liveEconomy(state, countryId) {
  const economy = state.countries[countryId]?.economy;
  return economy ? { gdpBn: economy.gdpBn, taxRate: economy.taxRate, treasuryMn: economy.treasuryMn, debtMn: economy.debtMn } : null;
}
