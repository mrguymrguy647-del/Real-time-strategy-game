// What-if previews for the resources (ARCHITECTURE §6.8, GAME_DESIGN §5 "UI requirement"). They run the
// real formulas on a copy of the state, or on adjusted figures, and answer questions the player asks
// before acting: "what is this region worth to me?" and "what would closing that strait do?". They
// never change the state and never draw from the real random generator (a copy has its own).

import { createRng } from '../core/rng.js';
import { coverMonths } from '../formulas/market.js';
import { previewEconomy } from './economy.js';
import { resourcesSystem } from './resources.js';
import { countryFlows, resourceMonth } from './resourceFlows.js';

/**
 * Run the resources system for some months on a copy of the state.
 * @param {any} state
 * @param {import('../core/data.js').GameData} data
 * @param {number} months
 * @param {string | null} closed a chokepoint to close completely, or null for none
 */
function simulate(state, data, months, closed) {
  const copy = structuredClone(state);
  if (closed) copy.world.chokepoints[closed].blockade = 1;
  const ctx = /** @type {any} */ ({ state: copy, data, rng: createRng(copy.rng), news() {} });
  for (let i = 0; i < months; i++) resourcesSystem.step(ctx);
  return copy;
}

/**
 * What it would do to the world and to one country if a chokepoint were closed for some months, set
 * against the same months with it open (so the random mood of the market does not blur the answer).
 * @param {any} state
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 * @param {string} chokepointId
 * @param {{ months?: number }} [options]
 */
export function closureEstimate(state, data, countryId, chokepointId, { months = 3 } = {}) {
  const open = simulate(state, data, months, null);
  const closed = simulate(state, data, months, chokepointId);
  const share = countryFlows(closed, data, countryId).blocked;
  return {
    months,
    chokepointId,
    blocked: share,
    resources: data.activeResources.map((resource) => {
      const id = resource.id;
      const mine = closed.countries[countryId].resources[id];
      return {
        id,
        priceChange: closed.world.market[id].price / open.world.market[id].price - 1,
        stockAfter: mine.stock,
        coverage: mine.last?.coverage ?? 1,
        step: mine.step,
        label: mine.step > 0 ? resource.shortage[mine.step - 1].label : null,
        stepIfOpen: open.countries[countryId].resources[id].step,
      };
    }),
  };
}

/**
 * What holding a region would be worth to a country: the tax base it brings, the resources it makes
 * (and the people it feeds), and what that does to the country's income and to how long its stocks last.
 * Returns null for a region the country holds already, or one outside the game.
 * @param {any} state
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId who would hold it
 * @param {string} regionId
 */
export function captureEstimate(state, data, countryId, regionId) {
  const region = data.regions.byId[regionId];
  const owner = region?.country;
  if (!region || owner === countryId || !Object.hasOwn(state.countries, owner) || !Object.hasOwn(state.countries, countryId)) return null;
  const ownerStart = data.countries.byId[owner].start.resources;
  const params = data.balance.market;

  const flows = countryFlows(state, data, countryId);
  const resources = data.activeResources.map((resource) => {
    const id = resource.id;
    const now = flows.byResource[id];
    const gained = (region.output?.[id] ?? 0) * ownerStart.production[id];
    const fed = region.popShare * ownerStart.consumption[id]; // the people there come with the region
    const after = resourceMonth(resource, { production: now.production + gained, consumption: now.consumption + fed, stock: now.stock, blocked: now.blocked, price: now.price, stateShare: now.stateShare });
    return {
      id,
      production: gained,
      consumption: fed,
      net: gained - fed,
      incomeMn: after.income.value - now.income.value,
      coverMonthsBefore: coverMonths({ production: now.production, consumption: now.consumption, stock: now.stock }),
      coverMonthsAfter: coverMonths({ production: after.production, consumption: after.consumption, stock: now.stock }),
    };
  });

  const economy = state.countries[countryId].economy;
  const taxMn = ((state.countries[owner].economy.gdpBn * 1000) / 12) * region.gdpShare * economy.taxRate * params.captureTaxYield;
  const resourceMn = resources.reduce((total, line) => total + line.incomeMn, 0);
  const incomeNowMn = previewEconomy(state, data, countryId).revenue.value;
  return { regionId, owner, taxMn, resourceMn, incomeMn: taxMn + resourceMn, incomeShare: incomeNowMn > 0 ? (taxMn + resourceMn) / incomeNowMn : 0, resources };
}
