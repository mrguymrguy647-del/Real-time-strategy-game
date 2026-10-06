// What a scenario puts on the board (DATA_SCHEMAS §8): the countries it simulates are all those in
// its theaters, and the player may pick any of them unless the scenario lists fewer.

/**
 * @param {import('./data.js').GameData} data
 * @param {any} scenario
 * @returns {string[]} country ids in the order of countries.json
 */
export function countriesOf(data, scenario) {
  return data.countries.items.filter((/** @type {any} */ country) => scenario.theaters.includes(country.theater)).map((/** @type {any} */ country) => country.id);
}

/**
 * @param {import('./data.js').GameData} data
 * @param {any} scenario
 * @returns {string[]}
 */
export function playableOf(data, scenario) {
  return scenario.playable ?? countriesOf(data, scenario);
}
