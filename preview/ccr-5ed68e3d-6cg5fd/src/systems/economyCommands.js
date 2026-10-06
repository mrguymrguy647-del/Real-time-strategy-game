// The player's levers on the economy (G-35): the tax rate and the four budget shares, which are
// standing orders (they apply at once, so every preview stays truthful, and the next month's turn
// reads them; each has a range around the country's starting value, formulas/economy.js), and the
// repayment of debt, which is a one-off payment out of the treasury.

import { BUDGET_CATEGORIES, budgetBounds, taxBounds, tidy } from '../formulas/economy.js';

/** Allowance for floating-point noise when comparing a rate with its bounds. */
const EPSILON = 1e-9;
/** The same for amounts of money (USD millions): a millionth of a million. */
const EPSILON_MN = 1e-6;

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** A country that is really in the game (not "constructor" or "__proto__"). @param {any} state @param {unknown} id */
const inGame = (state, id) => typeof id === 'string' && Object.hasOwn(state.countries, id);

/** @type {Record<string, import('../core/commands.js').CommandDefinition>} */
export const economyCommands = {
  SET_TAX: {
    validate({ state, data }, command) {
      if (!inGame(state, command.countryId)) return 'unknown_country';
      if (!isNumber(command.rate)) return 'bad_value';
      const bounds = taxBounds(data.countries.byId[command.countryId].start.economy.taxRate, data.balance.economy);
      const rate = tidy(command.rate);
      return rate < bounds.min - EPSILON || rate > bounds.max + EPSILON ? 'out_of_range' : null;
    },
    apply({ state }, command) {
      state.countries[command.countryId].economy.taxRate = tidy(command.rate);
    },
  },

  REPAY_DEBT: {
    validate({ state }, command) {
      if (!inGame(state, command.countryId)) return 'unknown_country';
      if (!isNumber(command.amountMn) || command.amountMn <= 0) return 'bad_value';
      const { economy } = state.countries[command.countryId];
      return command.amountMn > Math.min(economy.debtMn, economy.treasuryMn) + EPSILON_MN ? 'out_of_range' : null;
    },
    apply({ state }, command) {
      const { economy } = state.countries[command.countryId];
      const amount = Math.min(command.amountMn, economy.debtMn, economy.treasuryMn); // never more than is owed or held
      economy.treasuryMn -= amount;
      economy.debtMn -= amount;
    },
  },

  SET_BUDGET: {
    validate({ state, data }, command) {
      if (!inGame(state, command.countryId)) return 'unknown_country';
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
