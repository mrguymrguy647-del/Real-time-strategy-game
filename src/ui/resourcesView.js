// What the screens show of a country's resources: its figures at the start of a scenario (straight from
// the data) or as they are now in a running game. Both have the same shape, so a panel does not care
// which it is given (like economyView.js). Quantities are the game units of resources.json a month.

import { countryFlows } from '../systems/resourceFlows.js';

/**
 * @typedef {{ id: string, production: number, consumption: number, stock: number }} ResourceLine
 */

/**
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 * @returns {ResourceLine[]}
 */
export function startResources(data, countryId) {
  const { resources } = data.countries.byId[countryId].start;
  return data.activeResources.map((resource) => ({ id: resource.id, production: resources.production[resource.id], consumption: resources.consumption[resource.id], stock: resources.stockpile[resource.id] }));
}

/**
 * @param {any} state a running game's state
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 * @returns {ResourceLine[] | null} null for a country that is not in the game
 */
export function liveResources(state, data, countryId) {
  if (!Object.hasOwn(state.countries, countryId)) return null;
  const { byResource } = countryFlows(state, data, countryId);
  return data.activeResources.map((resource) => ({ id: resource.id, production: byResource[resource.id].production, consumption: byResource[resource.id].consumption, stock: byResource[resource.id].stock }));
}
