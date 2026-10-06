import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, seedRngState } from '../../src/core/rng.js';
import {
  blockedShare,
  countryMonth,
  coverMonths,
  exportIncome,
  nextPrice,
  nextShock,
  priceWindfall,
  pricePerUnit,
  reserveTarget,
  shortageStep,
  startPrice,
  targetPrice,
  tradeValue,
  unitNoise,
  worldBalance,
} from '../../src/formulas/market.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();
const market = data.balance.market;
const oil = data.resources.byId.oil;
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} is not close to ${expected}`);

/** The parts of an explained value reproduce it (T-08). */
function assertReproduces(explained, label = '') {
  const rebuilt = explained.op === 'sum' ? explained.parts.reduce((a, p) => a + p.value, 0) : explained.parts.reduce((a, p) => a * p.value, 1);
  close(rebuilt, explained.value, 1e-9);
  assert.ok(Number.isFinite(explained.value), `${label} is finite`);
}

describe('blocked trade', () => {
  it('is nothing when every strait is open or the country does not use them', () => {
    assert.equal(blockedShare({ hormuz: 0.65 }, { hormuz: 0 }), 0);
    assert.equal(blockedShare({}, { hormuz: 1 }), 0);
    assert.equal(blockedShare({ hormuz: 0.65 }, {}), 0);
  });

  it('a closed strait stops its share of the trade, a half-closed one half of that', () => {
    close(blockedShare({ hormuz: 0.65 }, { hormuz: 1 }), 0.65);
    close(blockedShare({ hormuz: 0.65 }, { hormuz: 0.5 }), 0.325);
    assert.equal(blockedShare({ hormuz: 1 }, { hormuz: 1 }), 1);
  });

  it('a cargo is stopped if any strait on its way is: the shares combine, they do not simply add', () => {
    close(blockedShare({ hormuz: 0.65, suez: 0.1 }, { hormuz: 1, suez: 1 }), 1 - 0.35 * 0.9);
    // the sum of shares can pass 1; the blocked share cannot
    assert.ok(blockedShare({ a: 0.9, b: 0.9, c: 0.9 }, { a: 1, b: 1, c: 1 }) <= 1);
  });

  it('ignores a blockade of a strait the country does not name, and stays within 0 … 1', () => {
    assert.equal(blockedShare({ suez: 0.3 }, { hormuz: 1 }), 0);
    for (const share of [0, 0.3, 1]) for (const blockade of [0, 0.4, 1]) {
      const blocked = blockedShare({ x: share }, { x: blockade });
      assert.ok(blocked >= 0 && blocked <= 1 && !Object.is(blocked, -0));
    }
  });
});

describe('one month of one resource in one country', () => {
  const month = (changes) => countryMonth({ production: 10, consumption: 4, stock: 5, capacity: 30, blocked: 0, ...changes });

  it('a surplus is sold abroad and nothing is stored or drawn', () => {
    const result = month({});
    assert.equal(result.exports, 6);
    assert.equal(result.imports, 0);
    assert.equal(result.drawn, 0);
    assert.equal(result.stored, 0);
    assert.equal(result.coverage, 1);
    assert.equal(result.stockAfter, 5);
  });

  it('a surplus the blockades stop stays at home: stored while there is room, wasted beyond it', () => {
    const half = month({ blocked: 0.5 });
    assert.equal(half.exports, 3);
    assert.equal(half.blockedExports, 3);
    assert.equal(half.stored, 3);
    assert.equal(half.wasted, 0);
    assert.equal(half.stockAfter, 8);
    const full = month({ blocked: 1, stock: 28 }); // room for 2 of the 6
    assert.equal(full.exports, 0);
    assert.equal(full.stored, 2);
    assert.equal(full.wasted, 4);
    assert.equal(full.stockAfter, 30);
    assert.equal(month({ blocked: 1, stock: 40 }).stored, 0, 'a store that is already over capacity takes nothing');
  });

  it('a deficit is bought abroad and the stock stays as it is', () => {
    const result = month({ production: 4, consumption: 10 });
    assert.equal(result.imports, 6);
    assert.equal(result.drawn, 0);
    assert.equal(result.coverage, 1);
    assert.equal(result.stockAfter, 5);
  });

  it('a deficit the blockades stop comes out of the stock, and what the stock cannot give is a shortage', () => {
    const drawing = month({ production: 4, consumption: 10, blocked: 1, stock: 20 });
    assert.equal(drawing.imports, 0);
    assert.equal(drawing.drawn, 6);
    assert.equal(drawing.coverage, 1);
    assert.equal(drawing.stockAfter, 14);
    const running = month({ production: 4, consumption: 10, blocked: 1, stock: 2 });
    assert.equal(running.drawn, 2);
    close(running.coverage, (4 + 2) / 10);
    assert.equal(running.stockAfter, 0);
    const dry = month({ production: 4, consumption: 10, blocked: 1, stock: 0 });
    close(dry.coverage, 0.4);
    const half = month({ production: 4, consumption: 10, blocked: 0.5, stock: 0 });
    close(half.coverage, (4 + 3) / 10, 1e-12);
  });

  it('a country that uses nothing is never short', () => {
    assert.equal(month({ production: 0, consumption: 0, blocked: 1 }).coverage, 1);
  });

  it('keeps its books for any mix of inputs: what is made and bought is what is used, sold, stored or short', () => {
    const rng = createRng(seedRngState(7));
    for (let i = 0; i < 500; i++) {
      const input = {
        production: rng.chance(0.2) ? 0 : rng.next() * 30,
        consumption: rng.chance(0.1) ? 0 : rng.next() * 30,
        stock: rng.chance(0.2) ? 0 : rng.next() * 60,
        capacity: rng.next() * 80,
        blocked: rng.chance(0.3) ? rng.pick([0, 1]) : rng.next(),
      };
      const label = JSON.stringify(input);
      const r = countryMonth(input);
      for (const key of ['exports', 'imports', 'drawn', 'stored', 'wasted', 'blockedExports', 'blockedImports', 'stockAfter']) assert.ok(r[key] >= 0 && Number.isFinite(r[key]), `${key}: ${label}`);
      assert.ok(r.coverage >= 0 && r.coverage <= 1, label);
      const surplus = Math.max(0, input.production - input.consumption);
      const deficit = Math.max(0, input.consumption - input.production);
      close(surplus, r.exports + r.stored + r.wasted, 1e-9); // a surplus is sold, stored or wasted
      close(deficit, r.imports + r.drawn + input.consumption * (1 - r.coverage), 1e-9); // a deficit is bought, drawn or missing
      close(r.stockAfter, input.stock + r.stored - r.drawn, 1e-9);
      assert.ok(!(r.stored > 0 && r.drawn > 0), 'a country is either in surplus or in deficit');
    }
  });
});

describe('shortage ladders', () => {
  const ladder = oil.shortage; // 0.8, 0.5, 0.2

  it('the deepest step the coverage has fallen under applies', () => {
    assert.equal(shortageStep(ladder, 1), 0);
    assert.equal(shortageStep(ladder, 0.8), 0, 'exactly at the threshold is not below it');
    assert.equal(shortageStep(ladder, 0.79), 1);
    assert.equal(shortageStep(ladder, 0.5), 1);
    assert.equal(shortageStep(ladder, 0.49), 2);
    assert.equal(shortageStep(ladder, 0.2), 2);
    assert.equal(shortageStep(ladder, 0.19), 3);
    assert.equal(shortageStep(ladder, 0), 3);
  });

  it('is not fooled by floating-point noise around a threshold', () => {
    assert.equal(shortageStep(ladder, 0.8 - 1e-12), 0);
    assert.equal(shortageStep(ladder, 0.5 - 1e-12), 1);
  });

  it('a resource without a ladder is never short', () => {
    assert.equal(shortageStep([], 0), 0);
  });

  it('never gets milder as coverage falls', () => {
    for (const resource of data.activeResources) {
      let last = 0;
      for (let coverage = 1; coverage >= 0; coverage -= 0.01) {
        const step = shortageStep(resource.shortage, coverage);
        assert.ok(step >= last, `${resource.id} at ${coverage}`);
        last = step;
      }
    }
  });
});

describe('reserves', () => {
  it('cover months: of the deficit when there is one, unlimited when there is none', () => {
    assert.equal(coverMonths({ production: 1, consumption: 4, stock: 9 }), 3);
    assert.equal(coverMonths({ production: 0, consumption: 4, stock: 8 }), 2);
    assert.equal(coverMonths({ production: 5, consumption: 4, stock: 0 }), Infinity);
    assert.equal(coverMonths({ production: 4, consumption: 4, stock: 0 }), Infinity);
    assert.equal(coverMonths({ production: 1, consumption: 4, stock: 0 }), 0);
  });

  it('a prudent stock is some months of the deficit, or of the country\'s own use when it has none', () => {
    assert.equal(reserveTarget({ production: 1, consumption: 4 }, 6), 18);
    assert.equal(reserveTarget({ production: 9, consumption: 4 }, 6), 24);
  });
});

describe('the world market', () => {
  const rest = { production: 100, consumption: 90 };

  it('adds up what the countries and the rest of the world make and use, less what the blockades keep out', () => {
    const countries = [
      { production: 10, consumption: 2, blockedExports: 0, blockedImports: 0 },
      { production: 1, consumption: 5, blockedExports: 0, blockedImports: 4 }, // cannot buy its 4
      { production: 20, consumption: 1, blockedExports: 19, blockedImports: 0 }, // cannot sell its 19
    ];
    assert.deepEqual(worldBalance([], rest), { supply: 100, demand: 90 });
    assert.deepEqual(worldBalance(countries, rest), { supply: 100 + 10 + 1 + (20 - 19), demand: 90 + 2 + (5 - 4) + 1 });
  });

  it('prices a resource at its base price when the world is in balance, times what tension adds', () => {
    const target = targetPrice({ demand: 100, supply: 100, tension: 0, shock: 1 }, oil, market);
    close(target.value, oil.basePrice);
    const tense = targetPrice({ demand: 100, supply: 100, tension: 25, shock: 1 }, oil, market);
    close(tense.value, oil.basePrice * (1 + oil.price.tensionSensitivity * 25));
    assert.deepEqual(tense.parts.map((p) => p.id), ['base', 'balance', 'tension', 'shock']);
    assertReproduces(tense, 'target');
  });

  it('a short world pays more, a plentiful one less, a moody one as the mood says', () => {
    const at = (changes) => targetPrice({ demand: 100, supply: 100, tension: 20, shock: 1, ...changes }, oil, market).value;
    assert.ok(at({ supply: 90 }) > at({}));
    assert.ok(at({ supply: 110 }) < at({}));
    assert.ok(at({ demand: 120 }) > at({}));
    assert.ok(at({ tension: 60 }) > at({}));
    close(at({ shock: 1.1 }), at({}) * 1.1);
    close(at({ supply: 80 }), oil.basePrice * 1.25 ** oil.price.elasticity * (1 + oil.price.tensionSensitivity * 20));
  });

  it('the world balance is kept within bounds: a world with no supply at all cannot ask an infinite price', () => {
    const high = targetPrice({ demand: 100, supply: 0, tension: 0, shock: 1 }, oil, market);
    close(high.value, oil.basePrice * market.priceCeiling);
    const low = targetPrice({ demand: 0, supply: 100, tension: 0, shock: 1 }, oil, market);
    close(low.value, oil.basePrice * market.priceFloor);
    assertReproduces(high, 'ceiling');
  });

  it('never gives NaN, however odd the inputs', () => {
    for (const demand of [0, 1, 100, 1e9]) for (const supply of [0, 1, 100, 1e9]) {
      for (const resource of data.activeResources) assert.ok(Number.isFinite(targetPrice({ demand, supply, tension: 30, shock: 1 }, resource, market).value), `${resource.id} ${demand}/${supply}`);
    }
  });

  it('starts every resource at its target in a world in balance, in an average mood', () => {
    for (const resource of data.activeResources) {
      close(startPrice(resource, 25, market), resource.basePrice * (1 + resource.price.tensionSensitivity * 25));
    }
  });
});

describe('how a price moves', () => {
  it('moves a share of the way toward the target, the share that stays being the resource\'s inertia', () => {
    const next = nextPrice({ previous: 100, target: 200 }, oil);
    close(next.value, 100 + (200 - 100) * (1 - oil.price.inertia));
    assert.deepEqual(next.parts.map((p) => p.id), ['previous', 'target']);
    assertReproduces(next, 'price');
    close(nextPrice({ previous: 150, target: 150 }, oil).value, 150);
  });

  it('keeps coming closer to a target that stays put', () => {
    let price = 100;
    let gap = 100;
    for (let i = 0; i < 20; i++) {
      price = nextPrice({ previous: price, target: 200 }, oil).value;
      assert.ok(200 - price < gap);
      gap = 200 - price;
    }
    assert.ok(gap < 1);
  });

  it('the mood fades back to 1 by its persistence when nothing pushes it', () => {
    let shock = 1.3;
    for (let i = 0; i < 40; i++) shock = nextShock(shock, 0, oil, market);
    assert.ok(Math.abs(shock - 1) < 1e-3);
    close(nextShock(1.2, 0, oil, market), 1 + market.shockPersistence * 0.2);
    close(nextShock(1, 2, oil, market), 1 + oil.price.volatility * 2);
  });

  it('the mood stays within the price bounds, however it is pushed', () => {
    let shock = 1;
    for (let i = 0; i < 500; i++) shock = nextShock(shock, 1e6, oil, market);
    assert.equal(shock, market.priceCeiling);
    for (let i = 0; i < 500; i++) shock = nextShock(shock, -1e6, oil, market);
    assert.equal(shock, market.priceFloor);
  });

  it('random steps from two draws have mean 0 and standard deviation 1', () => {
    const rng = createRng(seedRngState(99));
    const n = 40_000;
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < n; i++) {
      const noise = unitNoise(rng.next(), rng.next());
      sum += noise;
      squares += noise * noise;
      assert.ok(Math.abs(noise) <= Math.sqrt(6) + 1e-9, 'a huge step is impossible');
    }
    assert.ok(Math.abs(sum / n) < 0.03, `mean ${sum / n}`);
    assert.ok(Math.abs(Math.sqrt(squares / n) - 1) < 0.03, `sd ${Math.sqrt(squares / n)}`);
  });

  it('over a decade the price wanders but stays near where the world says it should be', () => {
    const rng = createRng(seedRngState(5));
    for (const resource of data.activeResources) {
      let shock = 1;
      let price = startPrice(resource, 25, market);
      const target = price;
      let low = Infinity;
      let high = 0;
      for (let month = 0; month < 120; month++) {
        shock = nextShock(shock, unitNoise(rng.next(), rng.next()), resource, market);
        price = nextPrice({ previous: price, target: targetPrice({ demand: 1, supply: 1, tension: 25, shock }, resource, market).value }, resource).value;
        low = Math.min(low, price / target);
        high = Math.max(high, price / target);
      }
      assert.ok(low > 0.7 && high < 1.5, `${resource.id} wandered between ${low.toFixed(2)} and ${high.toFixed(2)} of its start price`);
    }
  });
});

describe('money from resources', () => {
  it('the state earns its share of what the country sells at the market price', () => {
    const income = exportIncome({ exports: 16.5, price: 770, stateShare: 0.95 });
    close(income.value, 16.5 * 770 * 0.95);
    assert.deepEqual(income.parts.map((p) => p.id), ['exports', 'price', 'stateShare']);
    assertReproduces(income, 'income');
    assert.equal(exportIncome({ exports: 0, price: 770, stateShare: 0.95 }).value, 0);
  });

  it('prices help the seller and hurt the buyer, in proportion to what they trade and to GDP', () => {
    const gdpBn = 1000;
    const trade = (traded, price) => priceWindfall([{ id: 'oil', traded, price, reference: 770 }], gdpBn);
    assert.equal(trade(10, 770).value, 0, 'at the starting price there is no windfall');
    assert.ok(trade(10, 880).value > 0, 'a seller gains when the price rises');
    assert.ok(trade(-10, 880).value < 0, 'a buyer loses when the price rises');
    assert.ok(trade(10, 660).value < 0, 'and a seller loses when it falls');
    close(trade(10, 880).value, (10 * 110 * 12) / (gdpBn * 1000));
    close(priceWindfall([{ id: 'oil', traded: 10, price: 880, reference: 770 }], 2000).value, trade(10, 880).value / 2);
    const two = priceWindfall([{ id: 'oil', traded: 10, price: 880, reference: 770 }, { id: 'steel', traded: -5, price: 80, reference: 73.5 }], gdpBn);
    assert.deepEqual(two.parts.map((p) => p.id), ['oil', 'steel']);
    assertReproduces(two, 'windfall');
  });

  it('buying costs the price plus the spread, selling brings the price less the spread', () => {
    const buy = tradeValue({ units: 5, price: 770 }, market, 'buy');
    const sell = tradeValue({ units: 5, price: 770 }, market, 'sell');
    close(buy.value, 5 * 770 * (1 + market.spread));
    close(sell.value, 5 * 770 * (1 - market.spread));
    assert.ok(buy.value > sell.value, 'buying and selling at once loses money');
    assertReproduces(buy, 'buy');
  });

  it('writes a price in the unit people know', () => {
    close(pricePerUnit(770, data.resources.byId.oil.priceUnit), 77, 1e-12); // dollars a barrel
    close(pricePerUnit(73.5, data.resources.byId.steel.priceUnit), 735, 1e-12); // dollars a tonne
    close(pricePerUnit(172.5, data.resources.byId.rare.priceUnit), 172_500, 1e-12);
  });
});
