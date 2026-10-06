// A second, independent statement of the rules of resources, the world market and the monthly economy
// (GAME_DESIGN G-35, G-37 to G-41), written from the design text and sharing no code with src/formulas or
// src/systems (only the seeded random numbers and the data loader are shared). The real game is compared
// with it month by month (tests/unit/resources-oracle.test.js), so a slip in either shows as a difference.
//
// If a rule changes on purpose (wars will make production depend on the regions a country holds, M1.3),
// change it here too, from the design text. If the two disagree by accident, one of them has a bug.

import { createRng } from '../../src/core/rng.js';

const clamp = (/** @type {number} */ x, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, x));
const round4 = (/** @type {number} */ x) => Math.round(x * 10000) / 10000 + 0;

/**
 * @param {import('../../src/core/data.js').GameData} data
 * @param {any} game a game at the start of its run: the model copies its starting state and random numbers
 */
export function createOracle(data, game) {
  const RES = data.activeResources.map((/** @type {any} */ r) => r.id);
  /** @type {Record<string, any>} */
  const R = Object.fromEntries(data.resources.items.map((/** @type {any} */ r) => [r.id, r]));
  const M = data.balance.market;
  const E = data.balance.economy;
  const state = game.state;

  /** the price the world started at: the market in balance, at the starting tension, in an average mood */
  const startPrice = (/** @type {string} */ r) => R[r].basePrice * (1 + R[r].price.tensionSensitivity * M.startTension);

  const o = {
    rng: createRng(structuredClone(state.rng)),
    tension: state.world.tension,
    /** @type {Record<string, number>} */
    price: Object.fromEntries(RES.map((/** @type {string} */ r) => [r, state.world.market[r].price])),
    /** @type {Record<string, number>} */
    shock: Object.fromEntries(RES.map((/** @type {string} */ r) => [r, state.world.market[r].shock])),
    /** @type {Record<string, number>} */
    block: Object.fromEntries(Object.entries(state.world.chokepoints).map(([k, v]) => [k, /** @type {any} */ (v).blockade])),
    player: state.player.countryId,
    difficulty: state.meta.difficulty,
    /** @type {Record<string, any>} */
    c: {},
    /** @type {Record<string, any> | null} */
    flows: null,
  };
  for (const [id, c] of Object.entries(state.countries)) {
    const country = /** @type {any} */ (c);
    o.c[id] = {
      gov: country.government,
      gdp: country.economy.gdpBn,
      tax: country.economy.taxRate,
      treasury: country.economy.treasuryMn,
      debt: country.economy.debtMn,
      budget: { ...country.budget },
      stock: Object.fromEntries(RES.map((/** @type {string} */ r) => [r, country.resources[r].stock])),
      step: Object.fromEntries(RES.map((/** @type {string} */ r) => [r, country.resources[r].step])),
      last: null,
    };
  }

  /** The share of a country's trade the closed straits stop: a cargo is stopped if any strait on its way is. @param {string} id */
  function blockedOf(id) {
    let open = 1;
    for (const [k, share] of Object.entries(data.countries.byId[id].chokepoints ?? {})) open *= 1 - /** @type {number} */ (share) * (o.block[k] ?? 0);
    return 1 - open;
  }

  /** One month of every resource of one country, from the state as it stands. @param {string} id */
  function flowsOf(id) {
    const C = data.countries.byId[id];
    const st = o.c[id];
    const blocked = blockedOf(id);
    /** @type {Record<string, any>} */
    const out = {};
    for (const r of RES) {
      const P = C.start.resources.production[r];
      const Cn = C.start.resources.consumption[r];
      const cap = R[r].storageMonths * Math.max(P, Cn);
      const stock = st.stock[r];
      const surplus = Math.max(0, P - Cn);
      const deficit = Math.max(0, Cn - P);
      const exports = surplus * (1 - blocked);
      const stuck = surplus - exports; // a surplus a closed strait keeps at home
      const stored = Math.min(stuck, Math.max(0, cap - stock));
      const imports = deficit * (1 - blocked);
      const missing = deficit - imports; // a deficit that cannot be bought
      const drawn = Math.min(stock, missing);
      let coverage = Cn > 1e-9 ? Math.min(1, (Math.min(P, Cn) + imports + drawn) / Cn) : 1;
      if (coverage > 1 - 1e-9) coverage = 1;
      const share = C.start.resources.stateShare?.[r] ?? R[r].defaultStateShare;
      const income = exports * o.price[r] * share;
      const lost = stuck * o.price[r] * share;
      let step = 0;
      R[r].shortage.forEach((/** @type {any} */ rung, /** @type {number} */ i) => {
        if (coverage < rung.coverageBelow - 1e-9) step = i + 1;
      });
      out[r] = { P, Cn, cap, stock, exports, imports, drawn, stored, stuck, missing, coverage, income, lost, step, stockAfter: stock + stored - drawn };
    }
    return { blocked, r: out };
  }

  /** @param {string} gov @param {string} stat */
  const govMods = (gov, stat) => {
    let add = 0;
    let mul = 1;
    for (const m of data.governments.byId[gov]?.modifiers ?? []) {
      if (m.stat !== stat) continue;
      if (m.op === 'add') add += m.value;
      else mul *= m.value;
    }
    return { add, mul };
  };
  /** the effects of the shortages a country is in (only the deepest step of each resource applies) @param {any} st @param {string} stat */
  const shortMods = (st, stat) => {
    let add = 0;
    let mul = 1;
    for (const r of RES) {
      const step = st.step[r];
      if (!(step > 0)) continue;
      for (const e of R[r].shortage[step - 1].effects) {
        if (e.stat !== stat) continue;
        if (e.op === 'add') add += e.value;
        else mul *= e.value;
      }
    }
    return { add, mul };
  };
  /** a modifier works on the size of the value, so a penalty hurts and a bonus helps whatever the sign @param {number} base @param {{ add: number, mul: number }} m */
  const part = (base, { add, mul }) => add + Math.abs(base + add) * (mul - 1);

  /** One month: the economy of every country (turn order 50), then the resources and the market (55). */
  function month() {
    const ids = Object.keys(o.c);
    const flows = Object.fromEntries(ids.map((id) => [id, flowsOf(id)]));
    for (const id of ids) {
      const C = data.countries.byId[id];
      const st = o.c[id];
      const f = flows[id];
      const mult = id === o.player ? 1 : (data.balance.difficulty[o.difficulty]?.aiIncome ?? 1);
      const gdpMonth = (st.gdp * 1000) / 12;
      const taxes = gdpMonth * st.tax * mult;
      const resInc = RES.reduce((/** @type {number} */ t, /** @type {string} */ r) => t + f.r[r].income, 0) * mult;
      const cost = gdpMonth * (st.budget.military + st.budget.research + st.budget.welfare + st.budget.infrastructure);
      const ratio = st.debt / (st.gdp * 1000);
      const rate = clamp(E.interest.base + E.interest.riskSlope * Math.max(0, ratio - E.interest.riskStart), 0, E.interest.max);
      const interest = (st.debt * rate) / 12;
      // what world prices do to income: units sold less units bought, times how far the price has moved from the start
      const windfall = (RES.reduce((/** @type {number} */ t, /** @type {string} */ r) => t + (f.r[r].exports - f.r[r].imports) * (o.price[r] - startPrice(r)), 0) * 12) / (st.gdp * 1000);
      let sub =
        C.start.economy.growth +
        E.growth.taxDrag * (C.start.economy.taxRate - st.tax) +
        E.growth.infrastructure * (st.budget.infrastructure - C.start.budget.infrastructure) +
        E.growth.research * (st.budget.research - C.start.budget.research) +
        E.growth.debtDrag * (C.start.economy.debtPctGdp - ratio);
      if (windfall !== 0) sub += E.growth.resourcePrices * windfall;
      const g = part(sub, govMods(st.gov, 'country.economy.growth'));
      const sh = part(sub + g, shortMods(st, 'country.economy.growth')); // the shortage step the country was in when the month began
      const growth = clamp(sub + g + sh, E.growth.min, E.growth.max);
      const balance = taxes + resInc - cost - interest;
      const borrowed = Math.max(0, -(st.treasury + balance));
      st.last = { taxes, resInc, growth, balance, borrowed };
      st.gdp = st.gdp * (1 + growth / 12);
      st.treasury = Math.max(0, st.treasury + balance);
      st.debt = st.debt + borrowed;
    }
    for (const id of ids) {
      for (const r of RES) {
        o.c[id].stock[r] = round4(flows[id].r[r].stockAfter);
        o.c[id].step[r] = flows[id].r[r].step;
      }
    }
    for (const r of RES) {
      // what the world makes and wants, less what the closed straits keep out of the market
      let S = R[r].restOfWorld.production;
      let D = R[r].restOfWorld.consumption;
      for (const id of ids) {
        const f = flows[id].r[r];
        S += f.P - f.stuck;
        D += f.Cn - f.missing;
      }
      const noise = (o.rng.next() + o.rng.next() - 1) * Math.sqrt(6); // mean 0, standard deviation 1
      const shock = clamp(1 + M.shockPersistence * (o.shock[r] - 1) + R[r].price.volatility * noise, M.priceFloor, M.priceCeiling);
      const balance = clamp((D / S) ** R[r].price.elasticity, M.priceFloor, M.priceCeiling);
      const target = R[r].basePrice * balance * (1 + R[r].price.tensionSensitivity * o.tension) * shock;
      o.price[r] = R[r].price.inertia * o.price[r] + (1 - R[r].price.inertia) * target;
      o.shock[r] = shock;
    }
    o.flows = flows;
  }

  /**
   * A purchase or a sale of reserve, with the reason it is refused (null when it is allowed and done).
   * @param {'buy' | 'sell'} side @param {string} id @param {string} r @param {unknown} units
   * @returns {string | null}
   */
  function trade(side, id, r, units) {
    if (!Object.hasOwn(o.c, id)) return 'unknown_country';
    if (!RES.includes(r)) return 'unknown_resource';
    if (typeof units !== 'number' || !Number.isFinite(units) || units <= 0) return 'bad_value';
    const st = o.c[id];
    const { blocked, r: fl } = flowsOf(id);
    if (blocked >= 1 - 1e-9) return 'no_market_access';
    const u = round4(units);
    const value = u * o.price[r] * (side === 'buy' ? 1 + M.spread : 1 - M.spread);
    if (side === 'buy') {
      if (st.stock[r] + u > fl[r].cap + 1e-9) return 'storage_full';
      if (value > st.treasury + 1e-9) return 'no_money';
      st.treasury = Math.max(0, st.treasury - value);
      st.stock[r] = round4(st.stock[r] + u);
    } else {
      if (u > st.stock[r] + 1e-9) return 'not_enough_stock';
      st.treasury += value;
      st.stock[r] = round4(Math.max(0, st.stock[r] - u));
    }
    return null;
  }

  /**
   * Where the real game differs from the model, as readable lines (empty when they agree).
   * @param {any} real a game that has played the same months
   * @returns {string[]}
   */
  function differences(real) {
    const s = real.state;
    /** @type {string[]} */
    const diffs = [];
    const check = (/** @type {string} */ what, /** @type {number} */ a, /** @type {number} */ b, tolerance = 1e-9) => {
      if (!(Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)) <= tolerance)) diffs.push(`${what}: model ${a}, game ${b}`);
    };
    for (const r of RES) {
      check(`price of ${r}`, o.price[r], s.world.market[r].price);
      check(`mood of ${r}`, o.shock[r], s.world.market[r].shock);
    }
    for (const [id, st] of Object.entries(o.c)) {
      const c = s.countries[id];
      check(`${id} GDP`, st.gdp, c.economy.gdpBn);
      check(`${id} treasury`, st.treasury, c.economy.treasuryMn);
      check(`${id} debt`, st.debt, c.economy.debtMn);
      if (c.economy.last && st.last) {
        check(`${id} taxes`, st.last.taxes, c.economy.last.taxMn);
        check(`${id} resource income`, st.last.resInc, c.economy.last.resourceMn);
        check(`${id} growth`, st.last.growth, c.economy.last.growth);
      }
      for (const r of RES) {
        check(`${id} ${r} stock`, st.stock[r], c.resources[r].stock, 1e-6);
        if (st.step[r] !== c.resources[r].step) diffs.push(`${id} ${r} shortage step: model ${st.step[r]}, game ${c.resources[r].step}`);
        const last = c.resources[r].last;
        if (o.flows && last) {
          const f = o.flows[id].r[r];
          check(`${id} ${r} coverage`, f.coverage, last.coverage, 1e-4);
          check(`${id} ${r} exports`, f.exports, last.exports, 1e-4);
          check(`${id} ${r} imports`, f.imports, last.imports, 1e-4);
          check(`${id} ${r} income`, f.income, last.incomeMn);
        }
      }
    }
    return diffs;
  }

  return { state: o, month, trade, differences, resources: RES };
}
