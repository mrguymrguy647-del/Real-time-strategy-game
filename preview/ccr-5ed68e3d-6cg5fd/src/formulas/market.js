// The world market and the flow of resources (GAME_DESIGN §5 and Appendix B, G-37 to G-41). Pure
// functions: numbers in, numbers out, every tunable in `params` (data/resources.json and
// data/balance.json → market). A number that is made of parts comes back as { value, op, parts } so
// the report can say why. Quantities are the game units of resources.json per month; money is USD
// millions (G-25).
//
// A month of one resource in one country (countryMonth): what is made and what is used leave a
// surplus to sell or a deficit to buy; the straits on the way (blockedShare) stop a share of either;
// a deficit the trade cannot cover is taken from the stock, and what the stock cannot give is a
// shortage, which the resource's ladder (shortageStep) turns into effects.
// The market (worldBalance, targetPrice, nextPrice, nextShock) turns what the world makes and wants
// into next month's price.

import { productOf, sumOf } from './explain.js';

/** Allowance for floating-point noise when comparing quantities. */
const EPSILON = 1e-9;

/**
 * The share of a country's trade that the blockades stop. A strait stops its blockade's share of the
 * traffic that passes it; a cargo is stopped if any strait on its way is.
 * @param {Record<string, number>} routes the share of the country's trade that passes each chokepoint (countries.json)
 * @param {Record<string, number>} blockades how much of each chokepoint's traffic is stopped: 0 open … 1 closed
 * @returns {number} 0 … 1
 */
export function blockedShare(routes, blockades) {
  let open = 1;
  for (const [id, share] of Object.entries(routes)) open *= 1 - share * (blockades[id] ?? 0);
  return Math.min(1, Math.max(0, 1 - open));
}

/**
 * One month of one resource in one country.
 *  - A surplus is sold abroad, except the share the blockades stop: that stays at home, in storage
 *    while there is room and is wasted beyond it.
 *  - A deficit is bought abroad, except the share the blockades stop; the stock gives what it can of
 *    the rest, and what is still missing is a shortage (coverage below 1).
 * @param {{ production: number, consumption: number, stock: number, capacity: number, blocked: number }} input
 *   `capacity` is how much the country can store; `blocked` is blockedShare()
 */
export function countryMonth({ production, consumption, stock, capacity, blocked }) {
  const net = production - consumption;
  const surplus = Math.max(0, net);
  const deficit = Math.max(0, -net);
  const exports = surplus * (1 - blocked);
  const blockedExports = surplus - exports;
  const stored = Math.min(blockedExports, Math.max(0, capacity - stock));
  const imports = deficit * (1 - blocked);
  const blockedImports = deficit - imports;
  const drawn = Math.min(stock, blockedImports);
  const covered = Math.min(production, consumption) + imports + drawn;
  const coverage = consumption > EPSILON ? Math.min(1, covered / consumption) : 1;
  return {
    exports,
    imports,
    drawn,
    stored,
    wasted: blockedExports - stored,
    blockedExports,
    blockedImports,
    coverage: coverage > 1 - EPSILON ? 1 : coverage,
    stockAfter: stock + stored - drawn,
  };
}

/**
 * How deep into its ladder a shortage is: 0 when the need is met well enough, otherwise the number of
 * the deepest step whose `coverageBelow` the coverage has fallen under (1 is the mildest). Only that
 * step applies (resources.json).
 * @param {Array<{ coverageBelow: number }>} ladder from the mildest step to the deepest
 * @param {number} coverage 0 … 1
 */
export function shortageStep(ladder, coverage) {
  let step = 0;
  ladder.forEach((rung, i) => {
    if (coverage < rung.coverageBelow - EPSILON) step = i + 1;
  });
  return step;
}

/**
 * How many months the stock lasts if trade stopped altogether: of the deficit for a country that has
 * one, and unlimited for one that makes all it uses.
 * @param {{ production: number, consumption: number, stock: number }} input
 * @returns {number} Infinity when there is no deficit
 */
export function coverMonths({ production, consumption, stock }) {
  const deficit = consumption - production;
  return deficit > EPSILON ? stock / deficit : Infinity;
}

/**
 * The stock a prudent country keeps: a number of months of its deficit, or of its own use when it has none.
 * @param {{ production: number, consumption: number }} flows
 * @param {number} months resources.json reserveTargetMonths
 */
export function reserveTarget({ production, consumption }, months) {
  return months * (consumption > production ? consumption - production : consumption);
}

/**
 * What the world makes and wants this month, for the price: every country's production and use, less
 * what the blockades keep out of the market (a surplus that cannot leave, a deficit that cannot be
 * bought), plus the rest of the world.
 * @param {Array<{ production: number, consumption: number, blockedExports: number, blockedImports: number }>} countries
 * @param {{ production: number, consumption: number }} restOfWorld resources.json
 */
export function worldBalance(countries, restOfWorld) {
  let supply = restOfWorld.production;
  let demand = restOfWorld.consumption;
  for (const country of countries) {
    supply += country.production - country.blockedExports;
    demand += country.consumption - country.blockedImports;
  }
  return { supply, demand };
}

/**
 * Where the price is heading (Appendix B): the base price, times how short or plentiful the world is
 * (demand over supply, to a power, kept within bounds), times what world tension adds, times the
 * mood of the market (the shock).
 * @param {{ demand: number, supply: number, tension: number, shock: number }} input
 * @param {{ basePrice: number, price: { elasticity: number, tensionSensitivity: number } }} resource
 * @param {{ priceFloor: number, priceCeiling: number }} params balance.json → market
 * @returns {import('./explain.js').Explained} USD millions per unit
 */
export function targetPrice({ demand, supply, tension, shock }, resource, { priceFloor, priceCeiling }) {
  const ratio = supply > EPSILON ? demand / supply : Infinity;
  const balance = Math.min(priceCeiling, Math.max(priceFloor, ratio ** resource.price.elasticity));
  return productOf([
    { id: 'base', value: resource.basePrice },
    { id: 'balance', value: balance },
    { id: 'tension', value: 1 + resource.price.tensionSensitivity * tension },
    { id: 'shock', value: shock },
  ]);
}

/**
 * The price at the start of a scenario: the world in balance, at the starting tension, in an average mood.
 * @param {{ basePrice: number, price: { elasticity: number, tensionSensitivity: number } }} resource
 * @param {number} tension
 * @param {{ priceFloor: number, priceCeiling: number }} params
 */
export function startPrice(resource, tension, params) {
  return targetPrice({ demand: 1, supply: 1, tension, shock: 1 }, resource, params).value;
}

/**
 * Next month's price: it moves a share of the way from where it is to where the market is heading, so
 * a price never jumps (the share that stays is the resource's inertia).
 * @param {{ previous: number, target: number }} input
 * @param {{ price: { inertia: number } }} resource
 * @returns {import('./explain.js').Explained}
 */
export function nextPrice({ previous, target }, resource) {
  const { inertia } = resource.price;
  return sumOf([
    { id: 'previous', value: inertia * previous },
    { id: 'target', value: (1 - inertia) * target },
  ]);
}

/**
 * The mood of the market: a multiplier around 1 that fades by `shockPersistence` each month and is
 * pushed by a random step of the resource's volatility.
 * @param {number} shock this month's mood
 * @param {number} noise a random number with mean 0 and standard deviation 1 (see unitNoise)
 * @param {{ price: { volatility: number } }} resource
 * @param {{ shockPersistence: number, priceFloor: number, priceCeiling: number }} params
 */
export function nextShock(shock, noise, resource, { shockPersistence, priceFloor, priceCeiling }) {
  const next = 1 + shockPersistence * (shock - 1) + resource.price.volatility * noise;
  return Math.min(priceCeiling, Math.max(priceFloor, next));
}

/**
 * A random number with mean 0 and standard deviation 1 from two uniform draws in [0, 1) (the sum of
 * two is triangular, so a huge step is impossible).
 * @param {number} a @param {number} b
 */
export const unitNoise = (a, b) => (a + b - 1) * Math.sqrt(6);

/**
 * What the state earns from the resource it sells abroad: the units sold, at the market price, times
 * the share of that trade the state takes (royalties, taxes, state companies).
 * @param {{ exports: number, price: number, stateShare: number }} input
 * @returns {import('./explain.js').Explained} USD millions
 */
export function exportIncome({ exports, price, stateShare }) {
  return productOf([
    { id: 'exports', value: exports },
    { id: 'price', value: price },
    { id: 'stateShare', value: stateShare },
  ]);
}

/**
 * What the world prices do to a country's income, as a share of its GDP a year: for each resource the
 * quantity the country trades (sells abroad less buys abroad) times how far its price has moved from
 * the start. An exporter gains when prices rise and an importer loses.
 * @param {Array<{ id: string, traded: number, price: number, reference: number }>} trades
 *   traded: units a month, positive when the country is a net seller; prices in USD millions a unit
 * @param {number} gdpBn
 * @returns {import('./explain.js').Explained}
 */
export function priceWindfall(trades, gdpBn) {
  const yearly = 12 / (gdpBn * 1000);
  return sumOf(trades.map(({ id, traded, price, reference }) => ({ id, value: traded * (price - reference) * yearly })));
}

/**
 * What buying units into the reserve costs, and what selling them brings: the market price, with a
 * spread against the one who trades (so buying and selling at once loses money).
 * @param {{ units: number, price: number }} input
 * @param {{ spread: number }} params balance.json → market
 * @param {'buy' | 'sell'} side
 * @returns {import('./explain.js').Explained} USD millions
 */
export function tradeValue({ units, price }, { spread }, side) {
  return productOf([
    { id: 'units', value: units },
    { id: 'price', value: price },
    { id: 'spread', value: side === 'buy' ? 1 + spread : 1 - spread },
  ]);
}

/**
 * A price in the unit people know (dollars a barrel, dollars a tonne).
 * @param {number} price USD millions per game unit
 * @param {{ perGameUnit: number }} priceUnit resources.json
 */
export const pricePerUnit = (price, priceUnit) => (price * 1e6) / priceUnit.perGameUnit;

/**
 * What the state earns from the resources it sells abroad at the start of a scenario, as a share of GDP
 * a year: for each resource the surplus of the country's starting figures, at the starting price, times
 * the state's share of that trade. The Gulf states' tax rates in countries.json are what is left of their
 * old all-in rates after this (G-39), so taxes plus this is what the state collects.
 * @param {{ economy: { gdpBn: number }, resources: { production: Record<string, number>, consumption: Record<string, number>, stateShare?: Record<string, number> } }} start a country's `start` block
 * @param {Array<{ id: string, defaultStateShare: number, basePrice: number, price: { elasticity: number, tensionSensitivity: number } }>} resources the resources in play
 * @param {{ startTension: number, priceFloor: number, priceCeiling: number }} market balance.json → market
 */
export function startIncomeShare(start, resources, market) {
  const { production, consumption, stateShare } = start.resources;
  let monthly = 0;
  for (const resource of resources) {
    const surplus = Math.max(0, (production[resource.id] ?? 0) - (consumption[resource.id] ?? 0));
    monthly += surplus * startPrice(resource, market.startTension, market) * (stateShare?.[resource.id] ?? resource.defaultStateShare);
  }
  return (monthly * 12) / (start.economy.gdpBn * 1000);
}
