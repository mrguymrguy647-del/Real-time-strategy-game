import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shortageModifiers, shortagesOf } from '../../src/core/modifiers.js';
import { createRng, seedRngState } from '../../src/core/rng.js';
import { findProblems } from '../../src/core/invariants.js';
import { checkStateShape } from '../../src/core/state.js';
import { startPrice } from '../../src/formulas/market.js';
import { createGame } from '../../src/game.js';
import { previewEconomy } from '../../src/systems/economy.js';
import { planTrade } from '../../src/systems/resourceCommands.js';
import { blockadesOf, countryFlows, resourceIncomeOf } from '../../src/systems/resourceFlows.js';
import { captureEstimate, closureEstimate } from '../../src/systems/resourcePreview.js';
import { priceExplained, resourceAlerts } from '../../src/systems/resources.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();
const newGame = (playerId = 'TUR', seed = 1) => createGame({ data, seed, playerId, checkInvariants: true });
const endTurns = (game, n) => {
  for (let i = 0; i < n; i++) assert.deepEqual(game.endTurn(), { ok: true });
  return game;
};
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} is not close to ${b}`);
const RESOURCES = ['oil', 'food', 'steel', 'rare'];

describe('the world at the start', () => {
  it('has every playable resource in every country, with the stock the data gives, and water left out (G-12)', () => {
    const { state } = newGame();
    assert.deepEqual(data.activeResources.map((r) => r.id), RESOURCES);
    for (const [id, country] of Object.entries(state.countries)) {
      assert.deepEqual(Object.keys(country.resources), RESOURCES, id);
      for (const resource of RESOURCES) {
        assert.deepEqual(country.resources[resource], { stock: data.countries.byId[id].start.resources.stockpile[resource], step: 0, last: null }, `${id} ${resource}`);
      }
    }
  });

  it('has one price for each resource, the market in balance at the starting tension, and every strait open', () => {
    const { state } = newGame();
    assert.equal(state.world.tension, data.balance.market.startTension);
    for (const resource of data.activeResources) {
      const entry = state.world.market[resource.id];
      close(entry.price, startPrice(resource, data.balance.market.startTension, data.balance.market));
      assert.equal(entry.shock, 1);
      assert.equal(entry.last, null);
    }
    assert.deepEqual(state.world.chokepoints, { hormuz: { blockade: 0 }, suez: { blockade: 0 }, bab_el_mandeb: { blockade: 0 } });
  });

  it('is plain data with a sound shape', () => {
    const { state } = newGame();
    assert.deepEqual(findProblems(state), []);
    assert.deepEqual(checkStateShape(state), []);
  });

  it('refuses a damaged save: a negative stock, a market without a price, a blockade out of range', () => {
    const problems = (change) => {
      const copy = structuredClone(newGame().state);
      change(copy);
      return checkStateShape(copy).join('; ');
    };
    assert.match(problems((s) => void (s.countries.TUR.resources.oil.stock = -1)), /country TUR has a bad stock of oil/);
    assert.match(problems((s) => void (s.countries.TUR.resources.oil.step = 1.5)), /bad shortage step for oil/);
    assert.match(problems((s) => void delete s.countries.TUR.resources), /country TUR has no resources/);
    assert.match(problems((s) => void (s.world.market.oil.price = 0)), /market for oil has a bad price/);
    assert.match(problems((s) => void (s.world.market.oil.shock = NaN)), /market for oil has a bad mood/);
    assert.match(problems((s) => void delete s.world.market), /the world has no market/);
    assert.match(problems((s) => void (s.world.chokepoints.hormuz.blockade = 2)), /chokepoint hormuz has a bad blockade/);
    assert.match(problems((s) => void delete s.world), /world is missing/);
  });

  it('is in balance: what the world makes is what it uses, for every resource', () => {
    const game = newGame();
    for (const resource of data.activeResources) {
      let supply = resource.restOfWorld.production;
      let demand = resource.restOfWorld.consumption;
      for (const id of Object.keys(game.state.countries)) {
        const flow = countryFlows(game.state, data, id).byResource[resource.id];
        supply += flow.production;
        demand += flow.consumption;
      }
      assert.ok(Math.abs(supply - demand) < 0.005 * demand, `${resource.id}: ${supply} against ${demand}`);
    }
  });
});

describe('a month of resources at peace', () => {
  it('records what happened in every country, and keeps every stock where it was (trade is open, nothing is short)', () => {
    const game = newGame();
    const before = structuredClone(game.state.countries);
    endTurns(game, 1);
    for (const [id, country] of Object.entries(game.state.countries)) {
      for (const resource of RESOURCES) {
        const entry = country.resources[resource];
        assert.equal(entry.stock, before[id].resources[resource].stock, `${id} ${resource}`);
        assert.equal(entry.step, 0);
        assert.ok(entry.last && entry.last.coverage === 1, `${id} ${resource}`);
        close(entry.last.production - entry.last.consumption, entry.last.exports - entry.last.imports, 1e-3); // the books balance (to four decimals)
      }
    }
  });

  it('moves each price a little, by the market\'s mood, and remembers what it saw', () => {
    const game = newGame();
    const start = structuredClone(game.state.world.market);
    endTurns(game, 1);
    for (const resource of RESOURCES) {
      const entry = game.state.world.market[resource];
      assert.notEqual(entry.price, start[resource].price, `${resource} moved`);
      assert.ok(Math.abs(entry.price / start[resource].price - 1) < 0.05, `${resource} moved by ${entry.price / start[resource].price - 1}`);
      assert.equal(entry.last.previous, start[resource].price);
      assert.ok(entry.last.supply > 0 && entry.last.demand > 0);
    }
  });

  it('is the same game for the same seed, and a different one for another', () => {
    const a = endTurns(newGame('TUR', 7), 24).state.world.market;
    const b = endTurns(newGame('TUR', 7), 24).state.world.market;
    const c = endTurns(newGame('TUR', 8), 24).state.world.market;
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  it('draws the same random numbers whoever the player is, so the market is the same game for everyone', () => {
    const a = endTurns(newGame('TUR', 3), 12).state.world.market;
    const b = endTurns(newGame('KWT', 3), 12).state.world.market;
    assert.deepEqual(a, b);
  });

  it('runs a decade for all 16 countries: state stays plain, prices stay sane, stocks stay put', () => {
    const game = endTurns(newGame(), 120);
    assert.deepEqual(findProblems(game.state), []);
    for (const resource of data.activeResources) {
      const ratio = game.state.world.market[resource.id].price / resource.basePrice;
      assert.ok(ratio > 0.6 && ratio < 1.8, `${resource.id} at ${ratio}`);
    }
    for (const [id, country] of Object.entries(game.state.countries)) {
      for (const resource of RESOURCES) assert.equal(country.resources[resource].stock, data.countries.byId[id].start.resources.stockpile[resource], `${id} ${resource}`);
    }
  });

  it('does nothing when there is no country, and still keeps the market (the empty test world)', () => {
    const game = createGame({ data, scenarioId: 'scaffold_test', seed: 1, checkInvariants: true });
    endTurns(game, 3);
    assert.ok(game.state.world.market.oil.price > 0);
  });
});

describe('what the state earns from resources', () => {
  it('is its share of what it sells abroad, at the price the month began with', () => {
    const game = newGame('SAU');
    const oil = data.resources.byId.oil;
    const start = data.countries.byId.SAU.start.resources;
    const expected = (start.production.oil - start.consumption.oil) * game.state.world.market.oil.price * start.stateShare.oil;
    const income = resourceIncomeOf(countryFlows(game.state, data, 'SAU'));
    assert.deepEqual(income.parts.map((p) => p.id), ['oil', 'steel'].filter((id) => (start.production[id] - start.consumption[id]) * 1 > 0), 'only what it sells earns');
    close(income.parts[0].value, expected);
    assert.ok(oil.defaultStateShare < start.stateShare.oil, 'Saudi Arabia takes more of its oil than the default');
  });

  it('is what the economy collects and the report shows: taxes plus resources', () => {
    const game = newGame('SAU');
    const forecast = previewEconomy(game.state, data, 'SAU');
    endTurns(game, 1);
    const { last } = game.state.countries.SAU.economy;
    assert.equal(last.resourceMn, forecast.resources.value);
    assert.equal(last.revenueMn, forecast.revenue.value);
    close(last.resourceMn, Object.values(game.state.countries.SAU.resources).reduce((total, entry) => total + entry.last.incomeMn, 0));
    assert.ok(last.resourceMn > last.taxMn * 0.5, 'a quarter of Saudi income is a lot of oil money');
  });

  it('keeps every country\'s starting balance where the data had it (taxes plus resources equal the old all-in rate)', () => {
    const game = newGame();
    for (const [id, country] of Object.entries(game.state.countries)) {
      const forecast = previewEconomy(game.state, data, id);
      const share = forecast.revenue.value / ((country.economy.gdpBn * 1000) / 12);
      const allIn = { TUR: 0.27, IRN: 0.14, SAU: 0.3, EGY: 0.19, ISR: 0.37, IRQ: 0.33, SYR: 0.12, JOR: 0.27, YEM: 0.1, ARE: 0.25, LBN: 0.14, KWT: 0.45, QAT: 0.38, BHR: 0.24, OMN: 0.31, PSX: 0.17 }[id];
      assert.ok(Math.abs(share - allIn) < 0.004, `${id}: ${(share * 100).toFixed(2)}% of GDP, was ${allIn * 100}%`);
    }
  });

  it('follows the oil price: a dearer oil makes an exporter richer and leaves an importer\'s income alone', () => {
    const game = newGame();
    const before = { KWT: previewEconomy(game.state, data, 'KWT'), TUR: previewEconomy(game.state, data, 'TUR') };
    game.state.world.market.oil.price *= 1.2;
    const after = { KWT: previewEconomy(game.state, data, 'KWT'), TUR: previewEconomy(game.state, data, 'TUR') };
    close(after.KWT.resources.value, before.KWT.resources.value * 1.2, 1e-9);
    assert.ok(after.KWT.growth.value > before.KWT.growth.value, 'a windfall speeds the economy up');
    assert.ok(after.KWT.growth.parts.some((p) => p.id === 'resourcePrices' && p.value > 0));
    assert.ok(after.TUR.growth.value < before.TUR.growth.value, 'an importer pays for it');
    assert.equal(after.TUR.taxes.value, before.TUR.taxes.value);
  });
});

describe('a closed strait', () => {
  /** A game where Hormuz is closed, as the war of the next milestone will be able to do. */
  const closedHormuz = (playerId = 'KWT') => {
    const game = newGame(playerId);
    game.state.world.chokepoints.hormuz.blockade = 1;
    return game;
  };

  it('keeps a Gulf exporter\'s oil at home and takes its income away, and leaves others\' trade alone', () => {
    const game = closedHormuz();
    const kuwait = countryFlows(game.state, data, 'KWT');
    assert.equal(kuwait.blocked, 1);
    assert.equal(kuwait.byResource.oil.exports, 0);
    assert.ok(kuwait.byResource.oil.stored > 0);
    assert.equal(resourceIncomeOf(kuwait).value, 0);
    assert.equal(countryFlows(game.state, data, 'JOR').blocked, 0);
    assert.equal(blockadesOf(game.state).hormuz, 1);
    endTurns(game, 1);
    assert.ok(game.state.countries.KWT.resources.oil.stock > data.countries.byId.KWT.start.resources.stockpile.oil, 'the oil piles up at home');
    assert.equal(game.state.countries.KWT.economy.last.resourceMn, 0);
  });

  it('pushes the world price up, for everyone', () => {
    const open = endTurns(newGame('KWT', 4), 6).state.world.market.oil.price;
    const closed = endTurns(closedHormuz(), 6);
    const game = createGame({ data, seed: 4, playerId: 'KWT', checkInvariants: true });
    game.state.world.chokepoints.hormuz.blockade = 1;
    endTurns(game, 6);
    assert.ok(game.state.world.market.oil.price > open * 1.2, `${game.state.world.market.oil.price} against ${open}`);
    assert.ok(closed.state.world.market.oil.price > 0);
  });

  it('empties the stock of what a blockaded country must import, then the shortage ladder bites: Kuwait\'s food', () => {
    const game = closedHormuz();
    const start = data.countries.byId.KWT.start.resources;
    const monthly = start.consumption.food - start.production.food;
    let step = 0;
    for (let month = 1; month <= 12 && step === 0; month++) {
      endTurns(game, 1);
      step = game.state.countries.KWT.resources.food.step;
      if (step === 0) close(game.state.countries.KWT.resources.food.stock, start.stockpile.food - month * monthly, 1e-3);
    }
    assert.equal(step, 3, 'with its stock gone it covers only what its farms grow: famine');
    assert.equal(game.state.countries.KWT.resources.food.stock, 0);
    assert.ok(game.state.countries.KWT.resources.food.last.coverage < 0.1);
    const news = game.state.news.filter((entry) => entry.template === 'news.resources.shortage' && entry.params.resource === 'Food');
    assert.equal(news.length, 1, 'the player is told, once');
    assert.equal(news[0].params.label, data.resources.byId.food.shortage[2].label);
    assert.deepEqual(news[0].refs, ['KWT']);
  });

  it('a shortage slows the economy through the stat the ladder names, and says so in the explanation', () => {
    const game = closedHormuz();
    endTurns(game, 12);
    const country = game.state.countries.KWT;
    assert.equal(country.resources.food.step, 3);
    assert.deepEqual(shortagesOf(data, country).map((s) => [s.resource, s.step, s.label]).filter(([r]) => r === 'food'), [['food', 3, 'Famine']]);
    const growth = shortageModifiers(data, country, 'country.economy.growth');
    close(growth.mul, 0.8);
    assert.equal(growth.add, 0);
    const forecast = previewEconomy(game.state, data, 'KWT');
    const part = forecast.growth.parts.find((p) => p.id === 'shortages');
    assert.ok(part && part.value < 0, 'the shortage is a part of the growth, and a negative one');
    // the same country at the same moment without the shortage would grow faster
    const healthy = structuredClone(game.state);
    healthy.countries.KWT.resources.food.step = 0;
    healthy.countries.KWT.resources.steel.step = 0;
    healthy.countries.KWT.resources.oil.step = 0;
    healthy.countries.KWT.resources.rare.step = 0;
    assert.ok(previewEconomy(healthy, data, 'KWT').growth.value > forecast.growth.value);
  });

  it('is over when it opens again: stocks refill by trade, the step falls, and the player is told', () => {
    const game = closedHormuz();
    endTurns(game, 12);
    assert.equal(game.state.countries.KWT.resources.food.step, 3);
    game.state.world.chokepoints.hormuz.blockade = 0;
    endTurns(game, 1);
    // imports flow again, so the month's need is covered
    assert.equal(game.state.countries.KWT.resources.food.last.coverage, 1);
    assert.equal(game.state.countries.KWT.resources.food.step, 0);
    assert.ok(game.state.news.some((entry) => entry.template === 'news.resources.recovered' && entry.params.resource === 'Food'));
  });
});

describe('a hard life for the market (random blockades and trades)', () => {
  it('keeps every number sound: stocks within the stores, coverage within 0 … 1, prices positive, the state plain', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const dice = createRng(seedRngState(1000 + seed));
      const player = dice.pick(Object.keys(data.countries.byId));
      const game = newGame(player, seed);
      for (let turn = 1; turn <= 48; turn++) {
        if (dice.chance(0.25)) for (const id of Object.keys(game.state.world.chokepoints)) game.state.world.chokepoints[id].blockade = dice.pick([0, 0, 0.5, 1]);
        if (dice.chance(0.3)) {
          const units = Math.round(dice.next() * 500) / 100 + 0.01;
          game.dispatch({ type: dice.chance(0.5) ? 'BUY_RESOURCE' : 'SELL_RESOURCE', countryId: player, resource: dice.pick(RESOURCES), units }); // may be refused: that is fine
        }
        assert.deepEqual(game.endTurn(), { ok: true }, `seed ${seed}, turn ${turn}`);
        for (const [id, country] of Object.entries(game.state.countries)) {
          const flows = data.countries.byId[id].start.resources;
          for (const resource of data.activeResources) {
            const entry = country.resources[resource.id];
            const room = resource.storageMonths * Math.max(flows.production[resource.id], flows.consumption[resource.id]);
            assert.ok(entry.stock >= 0 && entry.stock <= room + 1e-3, `${id} ${resource.id} stock ${entry.stock} of ${room}`);
            assert.ok(entry.last.coverage >= 0 && entry.last.coverage <= 1, `${id} ${resource.id} coverage`);
            assert.ok(Number.isInteger(entry.step) && entry.step >= 0 && entry.step <= resource.shortage.length);
          }
        }
        for (const resource of data.activeResources) {
          const { price, shock } = game.state.world.market[resource.id];
          assert.ok(price > 0 && Number.isFinite(price) && shock > 0, `${resource.id} price ${price}`);
          assert.ok(price <= resource.basePrice * data.balance.market.priceCeiling * 1.5, `${resource.id} price ${price} is out of hand`);
        }
      }
      assert.deepEqual(findProblems(game.state), []);
      assert.deepEqual(checkStateShape(game.state), []);
    }
  });
});

describe('only the deepest shortage step applies', () => {
  it('reads the ladder from the data: the step names a position, effects come from the resource', () => {
    const country = { resources: { oil: { step: 2 }, food: { step: 0 }, steel: { step: 3 } } };
    assert.deepEqual(shortagesOf(data, country).map((s) => [s.resource, s.label]), [['oil', 'Mechanized units stall'], ['steel', 'Industry stalls']]);
    close(shortageModifiers(data, country, 'country.mechanized.mobility').mul, 0.4); // not 0.8 × 0.4
    close(shortageModifiers(data, country, 'country.industry.output').mul, 0.3);
    assert.deepEqual(shortageModifiers(data, country, 'country.economy.growth'), { add: 0, mul: 1 });
    assert.deepEqual(shortageModifiers(data, { resources: { food: { step: 2 } } }, 'country.approval.people'), { add: -15, mul: 1 });
    assert.deepEqual(shortagesOf(data, {}), []);
  });
});

describe('reserves: buying and selling', () => {
  const buy = (game, units, resource = 'oil', countryId = 'TUR') => game.dispatch({ type: 'BUY_RESOURCE', countryId, resource, units });
  const sell = (game, units, resource = 'oil', countryId = 'TUR') => game.dispatch({ type: 'SELL_RESOURCE', countryId, resource, units });

  it('buying moves money out of the treasury at the price plus the spread and units into the stock', () => {
    const game = newGame();
    const { economy, resources } = game.state.countries.TUR;
    const [treasury, stock, price] = [economy.treasuryMn, resources.oil.stock, game.state.world.market.oil.price];
    assert.deepEqual(buy(game, 5), { ok: true });
    close(economy.treasuryMn, treasury - 5 * price * (1 + data.balance.market.spread));
    close(resources.oil.stock, stock + 5);
    assert.equal(game.state.log.at(-1).type, 'BUY_RESOURCE');
  });

  it('selling brings the price less the spread, and buying then selling loses money', () => {
    const game = newGame();
    const { economy, resources } = game.state.countries.TUR;
    const start = economy.treasuryMn;
    assert.deepEqual(sell(game, 3), { ok: true });
    close(economy.treasuryMn, start + 3 * game.state.world.market.oil.price * (1 - data.balance.market.spread));
    close(resources.oil.stock, data.countries.byId.TUR.start.resources.stockpile.oil - 3);
    buy(game, 3);
    assert.ok(economy.treasuryMn < start, 'the round trip cost the spread twice');
    close(resources.oil.stock, data.countries.byId.TUR.start.resources.stockpile.oil);
  });

  it('announces itself on the bus, like every command', () => {
    const game = newGame();
    const seen = [];
    game.bus.on('command', (command) => seen.push(command.type));
    buy(game, 1);
    assert.deepEqual(seen, ['BUY_RESOURCE']);
  });

  it('refuses what cannot be done, with a reason, and changes nothing', () => {
    const game = newGame();
    const before = JSON.stringify(game.state);
    const reason = (result) => (result.ok ? 'ok' : result.error.code);
    assert.equal(reason(buy(game, 1, 'oil', 'ZZZ')), 'unknown_country');
    assert.equal(reason(buy(game, 1, 'oil', '__proto__')), 'unknown_country');
    assert.equal(reason(buy(game, 1, 'gold')), 'unknown_resource');
    assert.equal(reason(buy(game, 1, 'water')), 'unknown_resource', 'water is a disabled module');
    assert.equal(reason(buy(game, 0)), 'bad_value');
    assert.equal(reason(buy(game, -3)), 'bad_value');
    assert.equal(reason(buy(game, NaN)), 'bad_value');
    assert.equal(reason(buy(game, '5')), 'bad_value');
    assert.equal(reason(buy(game, 100_000)), 'storage_full');
    assert.equal(reason(sell(game, 100_000)), 'not_enough_stock');
    game.state.countries.TUR.economy.treasuryMn = 100;
    assert.equal(reason(buy(game, 5)), 'no_money');
    assert.equal(JSON.stringify({ ...game.state, log: 0, countries: 0 }), JSON.stringify({ ...JSON.parse(before), log: 0, countries: 0 }));
    assert.deepEqual(game.state.log, []);
    assert.equal(game.state.countries.TUR.resources.oil.stock, data.countries.byId.TUR.start.resources.stockpile.oil);
  });

  it('cannot reach a market that is shut: a country whose every route is blockaded cannot trade', () => {
    const game = newGame('KWT');
    game.state.world.chokepoints.hormuz.blockade = 1;
    assert.equal(buy(game, 1, 'oil', 'KWT').error.code, 'no_market_access');
    assert.equal(sell(game, 1, 'oil', 'KWT').error.code, 'no_market_access');
    game.state.world.chokepoints.hormuz.blockade = 0.5;
    assert.deepEqual(buy(game, 1, 'oil', 'KWT'), { ok: true }, 'half open is open enough');
  });

  it('cannot buy more than the stores hold, and exactly what they hold is fine', () => {
    const game = newGame();
    const flow = countryFlows(game.state, data, 'TUR').byResource.oil;
    const room = flow.capacity - game.state.countries.TUR.resources.oil.stock;
    assert.equal(buy(game, room + 1).error.code, 'storage_full');
    game.state.countries.TUR.economy.treasuryMn = 1e9;
    assert.deepEqual(buy(game, room), { ok: true });
    assert.ok(Math.abs(game.state.countries.TUR.resources.oil.stock - flow.capacity) < 1e-3);
  });

  it('lets the treasury go to exactly zero and never below, and keeps the state clean', () => {
    const game = newGame();
    const plan = planTrade(game, { countryId: 'TUR', resource: 'oil', units: 4 }, 'buy');
    game.state.countries.TUR.economy.treasuryMn = plan.valueMn;
    assert.deepEqual(buy(game, 4), { ok: true });
    assert.equal(game.state.countries.TUR.economy.treasuryMn, 0);
    assert.deepEqual(findProblems(game.state), []);
  });

  it('changes what the next month does: a bigger stock lasts longer under a closed strait', () => {
    const run = (extra) => {
      const game = newGame('JOR');
      if (extra) assert.deepEqual(buy(game, extra, 'oil', 'JOR'), { ok: true });
      game.state.world.chokepoints.bab_el_mandeb.blockade = 1;
      game.state.world.chokepoints.suez.blockade = 1;
      endTurns(game, 6);
      return game.state.countries.JOR.resources.oil;
    };
    assert.ok(run(0).step > 0, 'a thin reserve runs out');
    assert.equal(run(1.5).step, 0, 'a unit and a half more of oil sees Jordan through');
  });
});

describe('why a price is what it is', () => {
  it('at the start: the base price, tension and nothing else', () => {
    const game = newGame();
    const { target, price } = priceExplained(game.state, data, 'oil');
    assert.deepEqual(target.parts.map((p) => p.id), ['base', 'balance', 'tension', 'shock']);
    close(price.value, game.state.world.market.oil.price);
    close(target.parts[1].value, 1);
  });

  it('after a month: the very numbers the turn used, so the explanation is the price', () => {
    const game = endTurns(newGame(), 5);
    for (const resource of RESOURCES) {
      const { target, price } = priceExplained(game.state, data, resource);
      close(price.value, game.state.world.market.oil.price * 0 + game.state.world.market[resource].price, 1e-12);
      close(target.parts[3].value, game.state.world.market[resource].shock);
    }
  });
});

describe('warnings', () => {
  it('tell the player which reserves are thin, and say nothing about countries that are well stocked', () => {
    const game = newGame('SYR');
    const alerts = resourceAlerts(game.state, data, 'SYR');
    assert.ok(alerts.some((a) => a.id === 'lowReserve' && a.resource === 'oil'), 'Syria has 1.5 months of oil cover, and a prudent state keeps 6');
    assert.equal(alerts.find((a) => a.resource === 'oil').params.target, 6);
    assert.ok(alerts.every((a) => a.id === 'lowReserve'));
    assert.deepEqual(resourceAlerts(game.state, data, 'SAU'), []);
    assert.deepEqual(resourceAlerts(game.state, data, 'KWT'), []);
  });

  it('name a shortage, and its step, once a closure has caused one', () => {
    const game = newGame('KWT');
    game.state.world.chokepoints.hormuz.blockade = 1;
    endTurns(game, 12);
    const alert = resourceAlerts(game.state, data, 'KWT').find((a) => a.id === 'shortage' && a.resource === 'food');
    assert.ok(alert);
    assert.equal(alert.params.label, 'Famine');
    assert.equal(alert.params.resource, 'Food');
  });
});

describe('what a region is worth (the capture estimate)', () => {
  it('adds the region\'s share of its country\'s output and the people it must feed, and the tax base', () => {
    const game = newGame('TUR');
    const estimate = captureEstimate(game.state, data, 'TUR', 'IRQ-basra');
    const iraq = data.countries.byId.IRQ.start.resources;
    const basra = data.regions.byId['IRQ-basra'];
    const oil = estimate.resources.find((r) => r.id === 'oil');
    close(oil.production, basra.output.oil * iraq.production.oil);
    close(oil.consumption, basra.popShare * iraq.consumption.oil);
    close(oil.net, oil.production - oil.consumption);
    assert.ok(oil.coverMonthsAfter > oil.coverMonthsBefore, 'Basra\'s oil ends Türkiye\'s oil deficit');
    assert.equal(oil.coverMonthsAfter, Infinity);
    assert.ok(estimate.resourceMn > 0 && estimate.taxMn > 0);
    close(estimate.incomeMn, estimate.taxMn + estimate.resourceMn);
    close(estimate.incomeShare, estimate.incomeMn / previewEconomy(game.state, data, 'TUR').revenue.value);
    const food = estimate.resources.find((r) => r.id === 'food');
    assert.ok(food.consumption > 0, 'a region\'s people come with it');
  });

  it('is worth more the bigger the prize: Saudi Arabia\'s oil province beats a small Iraqi one', () => {
    const game = newGame('TUR');
    const big = captureEstimate(game.state, data, 'TUR', 'SAU-eastern');
    const small = captureEstimate(game.state, data, 'TUR', 'IRQ-kurdistan');
    assert.ok(big.incomeMn > small.incomeMn * 3);
  });

  it('knows nothing of a region you hold, or one that is not in the game, and changes nothing', () => {
    const game = newGame('TUR');
    const before = JSON.stringify(game.state);
    assert.equal(captureEstimate(game.state, data, 'TUR', 'TUR-marmara'), null);
    assert.equal(captureEstimate(game.state, data, 'TUR', 'Atlantis'), null);
    assert.equal(captureEstimate(game.state, data, 'ZZZ', 'IRQ-basra'), null);
    captureEstimate(game.state, data, 'TUR', 'IRQ-basra');
    assert.equal(JSON.stringify(game.state), before);
  });

  it('follows the prices: dearer oil makes an oil region worth more', () => {
    const game = newGame('TUR');
    const oilIncome = () => captureEstimate(game.state, data, 'TUR', 'IRQ-basra').resources.find((r) => r.id === 'oil').incomeMn;
    const before = oilIncome();
    game.state.world.market.oil.price *= 1.5;
    close(oilIncome(), before * 1.5, 1e-9);
  });
});

describe('what closing a strait would do (the closure estimate)', () => {
  it('shows the price rise, and which of your stocks would run out, without touching the game', () => {
    const game = newGame('KWT');
    const before = JSON.stringify(game.state);
    const estimate = closureEstimate(game.state, data, 'KWT', 'hormuz', { months: 12 });
    assert.equal(JSON.stringify(game.state), before, 'nothing changed');
    assert.equal(estimate.blocked, 1);
    const byId = Object.fromEntries(estimate.resources.map((r) => [r.id, r]));
    assert.ok(byId.oil.priceChange > 0.2, `oil would cost ${byId.oil.priceChange} more`);
    assert.equal(byId.food.step, 3, 'Kuwait\'s food would run out within the year');
    assert.equal(byId.food.label, 'Famine');
    assert.equal(byId.food.stepIfOpen, 0);
    assert.equal(byId.food.firstShort, 7, 'six months of stock, then the shortage begins in the seventh');
    assert.equal(byId.oil.step, 0, 'its own oil stays at home');
    assert.equal(byId.oil.firstShort, null);
    assert.ok(byId.oil.incomeChangeMn < -3_000, 'and its oil income stops');
    assert.equal(byId.food.incomeChangeMn, 0);
  });

  it('says nothing is wrong for a country that does not trade through that strait', () => {
    const game = newGame('JOR');
    const estimate = closureEstimate(game.state, data, 'JOR', 'hormuz', { months: 6 });
    assert.equal(estimate.blocked, 0);
    assert.ok(estimate.resources.every((r) => r.step === 0));
    assert.ok(estimate.resources.find((r) => r.id === 'oil').priceChange > 0, 'but it pays the higher price');
  });

  it('is deterministic and does not use up the game\'s random numbers', () => {
    const game = newGame('KWT');
    const a = closureEstimate(game.state, data, 'KWT', 'hormuz');
    const rngBefore = [...game.state.rng.s];
    const b = closureEstimate(game.state, data, 'KWT', 'hormuz');
    assert.deepEqual(a, b);
    assert.deepEqual(game.state.rng.s, rngBefore);
  });

  it('does what the real thing then does: the same answer as closing the strait and playing the months', () => {
    const game = newGame('KWT', 9);
    const estimate = closureEstimate(game.state, data, 'KWT', 'hormuz', { months: 4 });
    const real = newGame('KWT', 9);
    real.state.world.chokepoints.hormuz.blockade = 1;
    endTurns(real, 4);
    const baseline = endTurns(newGame('KWT', 9), 4);
    for (const line of estimate.resources) {
      close(line.priceChange, real.state.world.market[line.id].price / baseline.state.world.market[line.id].price - 1, 1e-12);
      close(line.stockAfter, real.state.countries.KWT.resources[line.id].stock, 1e-12);
    }
  });
});
