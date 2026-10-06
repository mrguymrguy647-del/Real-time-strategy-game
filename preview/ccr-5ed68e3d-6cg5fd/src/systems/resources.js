// The monthly resources system (turn order 55, G-37 to G-41). For every country it settles the month
// of each resource (what is made and used, what the trade brings or takes, what comes out of the
// stock, how deep a shortage goes) and then, from what the whole world made and wanted, sets the
// price of the next month. The arithmetic is formulas/market.js; where the numbers come from is
// systems/resourceFlows.js; this file reads the state, applies the result and tells the news.
//
// Prices work one month behind on purpose: a month is valued at the price the market had when it
// began, so the budget's forecast (which uses the same flows) is exactly what the turn does.

import { tidy } from '../formulas/economy.js';
import { coverMonths, nextPrice, nextShock, pricePerUnit, targetPrice, unitNoise, worldBalance } from '../formulas/market.js';
import { blockadesOf, countryFlows } from './resourceFlows.js';

/**
 * Why a resource costs what it does: where the market is heading (base price, world balance, tension,
 * mood) and how far the price moved toward it. Read from the state; the turn used the same numbers.
 * @param {any} state
 * @param {import('../core/data.js').GameData} data
 * @param {string} resourceId
 */
export function priceExplained(state, data, resourceId) {
  const resource = data.resources.byId[resourceId];
  const market = state.world.market[resourceId];
  const last = market.last ?? { supply: 1, demand: 1, previous: market.price };
  const target = targetPrice({ demand: last.demand, supply: last.supply, tension: state.world.tension, shock: market.shock }, resource, data.balance.market);
  return { target, price: nextPrice({ previous: last.previous, target: target.value }, resource) };
}

/**
 * @typedef {{ id: 'blockade', strait: string, params: { strait: string, share: number, blockade: number } }
 *   | { id: 'shortage', resource: string, params: Record<string, string | number> }
 *   | { id: 'lowReserve', resource: string, params: Record<string, string | number> }} ResourceAlert
 */

/**
 * Warnings about a country's resources, for the report and the resources screen: a strait that stops
 * some of its sea trade (first, since it explains the rest), a shortage that the month ahead will bring
 * (or keep), and a reserve that is thin (under half of what a prudent country keeps, resources.json
 * reserveTargetMonths). Read-only.
 * @param {any} state
 * @param {import('../core/data.js').GameData} data
 * @param {string} countryId
 * @returns {ResourceAlert[]}
 */
export function resourceAlerts(state, data, countryId) {
  const country = state.countries[countryId];
  const { byResource } = countryFlows(state, data, countryId);
  /** @type {ResourceAlert[]} */
  const alerts = [];
  for (const chokepoint of data.chokepoints.items) {
    const exposure = data.countries.byId[countryId].chokepoints?.[chokepoint.id] ?? 0;
    const blockade = state.world.chokepoints[chokepoint.id].blockade;
    if (exposure > 0 && blockade > 0) alerts.push({ id: 'blockade', strait: chokepoint.id, params: { strait: chokepoint.name, share: exposure * blockade, blockade } });
  }
  for (const resource of data.activeResources) {
    const flow = byResource[resource.id];
    if (flow.step > 0) {
      alerts.push({ id: 'shortage', resource: resource.id, params: { resource: resource.name, label: resource.shortage[flow.step - 1].label } });
      continue;
    }
    const months = coverMonths({ production: flow.production, consumption: flow.consumption, stock: country.resources[resource.id].stock });
    if (months < resource.reserveTargetMonths * data.balance.market.warnShare) alerts.push({ id: 'lowReserve', resource: resource.id, params: { resource: resource.name, months: Math.floor(months * 10) / 10, target: resource.reserveTargetMonths } });
  }
  return alerts;
}

/** @type {import('../core/turn.js').System} */
export const resourcesSystem = {
  id: 'resources',
  order: 55,
  cadence: 'monthly',
  step(ctx) {
    const { state, data, rng } = ctx;
    const params = data.balance.market;
    const ids = Object.keys(state.countries);
    const blockades = blockadesOf(state);
    const flows = Object.fromEntries(ids.map((id) => [id, countryFlows(state, data, id, { blockades })]));

    // 1. Each country: the stock after the month, how deep a shortage is, what the month looked like.
    for (const id of ids) {
      const country = state.countries[id];
      for (const resource of data.activeResources) {
        const flow = flows[id].byResource[resource.id];
        const entry = country.resources[resource.id];
        const before = entry.step;
        entry.stock = tidy(flow.stockAfter);
        entry.step = flow.step;
        entry.last = {
          production: tidy(flow.production),
          consumption: tidy(flow.consumption),
          imports: tidy(flow.imports),
          exports: tidy(flow.exports),
          drawn: tidy(flow.drawn),
          stored: tidy(flow.stored),
          wasted: tidy(flow.wasted),
          coverage: tidy(flow.coverage),
          price: flow.price,
          incomeMn: flow.income.value,
        };
        if (id !== state.player.countryId || flow.step === before) continue;
        if (flow.step > before) {
          ctx.news({ importance: 3, template: 'news.resources.shortage', params: { resource: resource.name, label: resource.shortage[flow.step - 1].label }, refs: [id] });
        } else if (flow.step === 0) {
          ctx.news({ importance: 2, template: 'news.resources.recovered', params: { resource: resource.name }, refs: [id] });
        }
      }
    }

    // 2. The market: from what the world made and wanted this month, the price of the next one.
    for (const resource of data.activeResources) {
      const market = state.world.market[resource.id];
      const { supply, demand } = worldBalance(
        ids.map((id) => flows[id].byResource[resource.id]),
        resource.restOfWorld,
      );
      const noise = unitNoise(rng.next(), rng.next());
      const shock = nextShock(market.shock, noise, resource, params);
      const target = targetPrice({ demand, supply, tension: state.world.tension, shock }, resource, params);
      const previous = market.price;
      const price = nextPrice({ previous, target: target.value }, resource).value;
      market.last = { supply, demand, previous };
      market.shock = shock;
      market.price = price;

      const change = price / previous - 1;
      const player = state.player.countryId;
      if (player && Math.abs(change) >= params.newsChange) {
        ctx.news({
          importance: 2,
          template: change > 0 ? 'news.market.up' : 'news.market.down',
          params: { resource: resource.name, percent: Math.round(Math.abs(change) * 100), priceUsd: pricePerUnit(price, resource.priceUnit), unit: resource.priceUnit.label },
          refs: [player],
        });
      }
    }
  },
};
