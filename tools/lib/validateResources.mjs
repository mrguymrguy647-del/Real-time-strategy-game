// The resource checks of the data validator (DATA_SCHEMAS §9, rules 2, 5 and 9b). Each takes a `fail`
// callback so tools/lib/validate.mjs collects every message in one list.

/**
 * A country's `start.resources` is complete and sensible: an entry for every enabled resource, names
 * that exist, and a stock that fits the stores.
 * @param {any} country
 * @param {any[]} enabledResources the resources the game plays with
 * @param {Set<string>} resourceIds every resource id, enabled or not
 * @param {(message: string) => void} fail
 */
export function checkCountryResources(country, enabledResources, resourceIds, fail) {
  const flows = country.start.resources;
  for (const kind of /** @type {const} */ (['production', 'consumption', 'stockpile'])) {
    for (const { id } of enabledResources) if (!(id in flows[kind])) fail(`start.resources.${kind} is missing "${id}"`);
    for (const id of Object.keys(flows[kind])) if (!resourceIds.has(id)) fail(`start.resources.${kind} names unknown resource "${id}"`);
  }
  for (const id of Object.keys(flows.stateShare ?? {})) if (!resourceIds.has(id)) fail(`start.resources.stateShare names unknown resource "${id}"`);
  for (const resource of enabledResources) {
    const made = flows.production[resource.id] ?? 0;
    const used = flows.consumption[resource.id] ?? 0;
    const room = resource.storageMonths * Math.max(made, used);
    if ((flows.stockpile[resource.id] ?? 0) > room + 1e-9) fail(`the starting stock of "${resource.id}" (${flows.stockpile[resource.id]}) is more than its storage holds (${room})`);
  }
}

/**
 * The world starts in balance for each resource: what the countries and the rest of the world make is
 * about what they use (a slipped decimal point in one country would start the market in a crisis).
 * @param {Record<string, any>} files
 * @param {(where: string, message: string) => void} fail
 * @param {string} resourcesPath
 */
export function checkWorldBalance(files, fail, resourcesPath) {
  for (const resource of files.resources.items.filter((/** @type {any} */ r) => r.enabled)) {
    let supply = resource.restOfWorld.production;
    let demand = resource.restOfWorld.consumption;
    for (const country of files.countries.items) {
      supply += country.start.resources?.production[resource.id] ?? 0;
      demand += country.start.resources?.consumption[resource.id] ?? 0;
    }
    if (Math.abs(supply - demand) > 0.02 * demand) fail(`${resourcesPath} (${resource.id})`, `the world starts out of balance: it makes ${supply.toFixed(1)} and uses ${demand.toFixed(1)} a month (more than 2% apart)`);
  }
}

/**
 * The chokepoints: unique ids, control regions that exist, trade shares that name real resources.
 * @param {Record<string, any>} files
 * @param {Set<string>} schemaOk the files whose structure is sound
 * @param {(where: string, message: string) => void} fail
 * @param {string} where the chokepoints file's path
 * @param {(items: any[], where: string) => void} checkUniqueIds
 */
export function checkChokepoints(files, schemaOk, fail, where, checkUniqueIds) {
  checkUniqueIds(files.chokepoints.items, where);
  const regionIds = schemaOk.has('regions') ? new Set(files.regions.items.map((/** @type {any} */ r) => r.id)) : null;
  const resourceIds = schemaOk.has('resources') ? new Set(files.resources.items.map((/** @type {any} */ r) => r.id)) : null;
  for (const chokepoint of files.chokepoints.items) {
    const label = `${where} (${chokepoint.id})`;
    if (regionIds) for (const id of chokepoint.controlRegions) if (!regionIds.has(id)) fail(label, `control region "${id}" does not exist`);
    if (resourceIds) for (const id of Object.keys(chokepoint.worldTradeShare)) if (!resourceIds.has(id)) fail(label, `worldTradeShare names unknown resource "${id}"`);
  }
}
