// The player's levers on the resources (G-40): buying units into the reserve and selling units out of
// it. Both are one-off trades at the market price, with a spread against the one who trades (so
// buying and selling at once loses money), paid from or into the treasury at once, like repaying
// debt. A trade needs a way to the market: a country whose every route is blockaded cannot trade.
// The AI uses the same commands (M1.5).

import { tidy } from '../formulas/economy.js';
import { tradeValue } from '../formulas/market.js';
import { countryFlows } from './resourceFlows.js';

/** The same allowances as the economy commands: floating-point noise in a rate, and in a sum of money. */
const EPSILON = 1e-9;

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * What a trade would be, or why it cannot be. Shared by validate and apply, and by the screens that
 * show the price of a purchase before it is made.
 * @param {{ state: any, data: import('../core/data.js').GameData }} ctx
 * @param {{ countryId: unknown, resource: unknown, units: unknown }} command
 * @param {'buy' | 'sell'} side
 * @returns {{ error: string } | { units: number, valueMn: number, entry: any, country: any }}
 */
export function planTrade({ state, data }, command, side) {
  const { countryId, resource: resourceId } = command;
  if (typeof countryId !== 'string' || !Object.hasOwn(state.countries, countryId)) return { error: 'unknown_country' };
  if (typeof resourceId !== 'string' || !data.activeResources.some((resource) => resource.id === resourceId)) return { error: 'unknown_resource' };
  if (!isNumber(command.units) || command.units <= 0) return { error: 'bad_value' };
  const country = state.countries[countryId];
  const entry = country.resources[resourceId];
  const flow = countryFlows(state, data, countryId).byResource[resourceId];
  if (flow.blocked >= 1 - EPSILON) return { error: 'no_market_access' };
  const units = tidy(command.units);
  const valueMn = tradeValue({ units, price: flow.price }, data.balance.market, side).value;
  if (side === 'buy') {
    if (entry.stock + units > flow.capacity + EPSILON) return { error: 'storage_full' };
    if (valueMn > country.economy.treasuryMn + EPSILON) return { error: 'no_money' };
  } else if (units > entry.stock + EPSILON) {
    return { error: 'not_enough_stock' };
  }
  return { units, valueMn, entry, country };
}

/** @type {Record<string, import('../core/commands.js').CommandDefinition>} */
export const resourceCommands = {
  BUY_RESOURCE: {
    validate(ctx, command) {
      const plan = planTrade(ctx, command, 'buy');
      return 'error' in plan ? plan.error : null;
    },
    apply(ctx, command) {
      const plan = /** @type {Exclude<ReturnType<typeof planTrade>, { error: string }>} */ (planTrade(ctx, command, 'buy'));
      plan.country.economy.treasuryMn = Math.max(0, plan.country.economy.treasuryMn - plan.valueMn);
      plan.entry.stock = tidy(plan.entry.stock + plan.units);
    },
  },

  SELL_RESOURCE: {
    validate(ctx, command) {
      const plan = planTrade(ctx, command, 'sell');
      return 'error' in plan ? plan.error : null;
    },
    apply(ctx, command) {
      const plan = /** @type {Exclude<ReturnType<typeof planTrade>, { error: string }>} */ (planTrade(ctx, command, 'sell'));
      plan.country.economy.treasuryMn += plan.valueMn;
      plan.entry.stock = tidy(Math.max(0, plan.entry.stock - plan.units));
    },
  },
};
