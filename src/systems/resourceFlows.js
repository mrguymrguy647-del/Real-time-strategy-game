// What a country's resources do in a month, read from the state as it stands (G-37). This is the one
// place that knows where a country's production, consumption and stock come from and what stands in
// the way of its trade, so the monthly step, the budget forecast, the screens and the what-if
// previews all agree. It changes nothing.
//
// Production and consumption are the country's starting figures for now; when wars arrive (M1.3) the
// regions a country holds change them here, and nothing else needs to learn about occupation.

import { sumOf } from '../formulas/explain.js';
import { blockedShare, countryMonth, exportIncome, priceWindfall, shortageStep, startPrice } from '../formulas/market.js';

/**
 * How much of each chokepoint's traffic is stopped.
 * @param {any} state
 * @returns {Record<string, number>}
 */
export function blockadesOf(state) {
  return Object.fromEntries(Object.entries(state.world.chokepoints).map(([id, entry]) => [id, /** @type {any} */ (entry).blockade]));
}

/**
 * One resource in one country for one month, given what it makes and uses. The monthly step reads
 * the figures from the state; the what-if previews change them (a captured region, say) and ask again.
 * @param {any} resource its definition in resources.json
 * @param {{ production: number, consumption: number, stock: number, blocked: number, price: number, stateShare: number }} input
 */
export function resourceMonth(resource, { production, consumption, stock, blocked, price, stateShare }) {
  const capacity = resource.storageMonths * Math.max(production, consumption);
  const month = countryMonth({ production, consumption, stock, capacity, blocked });
  return {
    production,
    consumption,
    stock,
    capacity,
    blocked,
    price,
    stateShare,
    ...month,
    income: exportIncome({ exports: month.exports, price, stateShare }),
    step: shortageStep(resource.shortage, month.coverage),
  };
}

/**
 * The share of a resource's trade the state takes in a country: its own figure, or the resource's default.
 * @param {any} country its entry in countries.json
 * @param {any} resource
 */
export const stateShareOf = (country, resource) => country.start.resources.stateShare?.[resource.id] ?? resource.defaultStateShare;

/**
 * The month ahead for every resource of one country, from the state as it is now.
 * @param {any} state
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 * @param {{ blockades?: Record<string, number> }} [options] the blockades to assume (default: the ones in the state)
 */
export function countryFlows(state, data, countryId, { blockades = blockadesOf(state) } = {}) {
  const country = state.countries[countryId];
  const entry = data.countries.byId[countryId];
  const blocked = blockedShare(entry.chokepoints ?? {}, blockades);
  /** @type {Record<string, ReturnType<typeof resourceMonth>>} */
  const byResource = {};
  for (const resource of data.activeResources) {
    byResource[resource.id] = resourceMonth(resource, {
      production: entry.start.resources.production[resource.id],
      consumption: entry.start.resources.consumption[resource.id],
      stock: country.resources[resource.id].stock,
      blocked,
      price: state.world.market[resource.id].price,
      stateShare: stateShareOf(entry, resource),
    });
  }
  return { blocked, byResource };
}

/**
 * What the state earns from the resources it sells abroad this month, with a part for each resource
 * that earns anything.
 * @param {ReturnType<typeof countryFlows>} flows
 * @returns {import('../formulas/explain.js').Explained} USD millions
 */
export function resourceIncomeOf(flows) {
  return sumOf(
    Object.entries(flows.byResource)
      .filter(([, flow]) => flow.income.value > 0)
      .map(([id, flow]) => ({ id, value: flow.income.value })),
  );
}

/**
 * The price the world started at, for each resource: what a price is compared with to tell a windfall
 * from a loss.
 * @param {import('../core/data.js').GameData} data
 * @param {any} resource
 */
export const referencePrice = (data, resource) => startPrice(resource, data.balance.market.startTension, data.balance.market);

/**
 * What world prices do to a country's income, as a share of its GDP a year (formulas/market.js).
 * @param {import('../core/data.js').GameData} data
 * @param {ReturnType<typeof countryFlows>} flows
 * @param {number} gdpBn
 */
export function resourceWindfallOf(data, flows, gdpBn) {
  return priceWindfall(
    Object.entries(flows.byResource).map(([id, flow]) => ({ id, traded: flow.exports - flow.imports, price: flow.price, reference: referencePrice(data, data.resources.byId[id]) })),
    gdpBn,
  );
}
