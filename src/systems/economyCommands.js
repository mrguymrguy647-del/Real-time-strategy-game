// The player's levers on the economy (G-35): the tax rate and the four budget shares. They are
// standing orders: they apply at once (so every preview stays truthful) and the next month's turn
// reads them. Each lever has a range around the country's starting value (formulas/economy.js).

import { BUDGET_CATEGORIES, budgetBounds, taxBounds, tidy } from '../formulas/economy.js';

/** Allowance for floating-point noise when comparing a rate with its bounds. */
const EPSILON = 1e-9;

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** @type {Record<string, import('../core/commands.js').CommandDefinition>} */
export const economyCommands = {
  SET_TAX: {
    validate({ state, data }, command) {
      if (!state.countries[command.countryId]) return 'unknown_country';
      if (!isNumber(command.rate)) return 'bad_value';
      const bounds = taxBounds(data.countries.byId[command.countryId].start.economy.taxRate, data.balance.economy);
      const rate = tidy(command.rate);
      return rate < bounds.min - EPSILON || rate > bounds.max + EPSILON ? 'out_of_range' : null;
    },
    apply({ state }, command) {
      state.countries[command.countryId].economy.taxRate = tidy(command.rate);
    },
  },

  SET_BUDGET: {
    validate({ state, data }, command) {
      if (!state.countries[command.countryId]) return 'unknown_country';
      if (!(/** @type {readonly string[]} */ (BUDGET_CATEGORIES).includes(command.category))) return 'unknown_category';
      if (!isNumber(command.share)) return 'bad_value';
      const start = data.countries.byId[command.countryId].start.budget[command.category];
      const bounds = budgetBounds(command.category, start, data.balance.economy);
      const share = tidy(command.share);
      return share < bounds.min - EPSILON || share > bounds.max + EPSILON ? 'out_of_range' : null;
    },
    apply({ state }, command) {
      state.countries[command.countryId].budget[command.category] = tidy(command.share);
    },
  },
};
