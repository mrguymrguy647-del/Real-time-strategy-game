import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { previewEconomy } from '../../src/systems/economy.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();
const newGame = (playerId = 'TUR', seed = 1) => createGame({ data, seed, playerId, checkInvariants: true });
const endTurns = (game, n) => {
  for (let i = 0; i < n; i++) assert.deepEqual(game.endTurn(), { ok: true });
  return game;
};
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} is not close to ${b}`);

describe('the starting economies', () => {
  it('start from the data, in USD millions for money and billions for GDP (G-25)', () => {
    const { state } = newGame();
    const turkey = data.countries.byId.TUR.start;
    const { economy, budget } = state.countries.TUR;
    assert.equal(economy.gdpBn, turkey.economy.gdpBn);
    assert.equal(economy.treasuryMn, turkey.economy.treasuryMn);
    close(economy.debtMn, turkey.economy.debtPctGdp * turkey.economy.gdpBn * 1000);
    assert.equal(economy.taxRate, turkey.economy.taxRate);
    assert.deepEqual(budget, turkey.budget);
    assert.equal(economy.last, null);
    assert.equal(state.countries.TUR.government, 'democracy');
  });

  it('every country starts within a few points of balance (so no one is bankrupt in month one)', () => {
    const game = newGame();
    for (const id of Object.keys(game.state.countries)) {
      const result = previewEconomy(game.state, data, id);
      const share = result.balanceMn / ((game.state.countries[id].economy.gdpBn * 1000) / 12);
      assert.ok(share > -0.05 && share < 0.06, `${id} starts at ${(share * 100).toFixed(1)}% of GDP`);
    }
  });
});

describe('the monthly economy', () => {
  it('records what the month did, for every country, and the explanations for the player only', () => {
    const game = endTurns(newGame(), 1);
    for (const [id, country] of Object.entries(game.state.countries)) {
      const { last } = country.economy;
      assert.deepEqual(last.period, { year: 2026, month: 1 }, id);
      assert.equal('why' in last, id === 'TUR', id);
      close(last.balanceMn, last.revenueMn - last.spendingMn - last.interestMn);
    }
    const { why } = game.state.countries.TUR.economy.last;
    assert.deepEqual(Object.keys(why).sort(), ['growth', 'interest', 'interestRate', 'revenue', 'spending']);
  });

  it('matches the preview exactly: what the player was told is what happens', () => {
    const game = newGame();
    const forecast = previewEconomy(game.state, data, 'TUR');
    endTurns(game, 1);
    const { economy } = game.state.countries.TUR;
    assert.equal(economy.treasuryMn, forecast.next.treasuryMn);
    assert.equal(economy.gdpBn, forecast.next.gdpBn);
    assert.equal(economy.debtMn, forecast.next.debtMn);
    assert.equal(economy.last.balanceMn, forecast.balanceMn);
  });

  it('previewing changes nothing', () => {
    const game = newGame();
    const before = JSON.stringify(game.state);
    previewEconomy(game.state, data, 'TUR');
    assert.equal(JSON.stringify(game.state), before);
  });

  it('applies the government\'s growth modifier from data (a democracy grows 10% faster than the same trend)', () => {
    const game = newGame();
    const democracy = previewEconomy(game.state, data, 'TUR').growth;
    close(democracy.value, data.countries.byId.TUR.start.economy.growth * 1.1 - 0.0 + democracy.parts.find((p) => p.id === 'debt').value * 0.1, 1e-9);
    assert.equal(democracy.parts.at(-1).id, 'government');
  });

  it('gives AI countries the difficulty income multiplier, never the player', () => {
    const hard = createGame({ data, playerId: 'TUR', checkInvariants: true });
    hard.state.meta.difficulty = 'hard';
    const ai = previewEconomy(hard.state, data, 'IRN').revenue;
    assert.deepEqual(ai.parts.map((p) => p.id), ['gdp', 'taxRate', 'difficulty']);
    assert.equal(ai.parts[2].value, data.balance.difficulty.hard.aiIncome);
    assert.equal(previewEconomy(hard.state, data, 'TUR').revenue.parts.length, 2);
  });

  it('runs a decade for all 16 countries without anything going wrong', () => {
    const game = endTurns(newGame(), 120);
    for (const [id, country] of Object.entries(game.state.countries)) {
      const { economy } = country;
      const start = data.countries.byId[id].start.economy;
      assert.ok(economy.gdpBn > start.gdpBn * 0.8 && economy.gdpBn < start.gdpBn * 3, `${id} GDP ${economy.gdpBn}`);
      assert.ok(economy.treasuryMn >= 0 && economy.debtMn >= 0, id);
      assert.ok(economy.debtMn / (economy.gdpBn * 1000) < 3, `${id} debt ratio ${economy.debtMn / (economy.gdpBn * 1000)}`);
    }
  });
});

describe('the budget levers', () => {
  const ok = { ok: true };

  it('SET_TAX changes the rate at once and the next turn uses it', () => {
    const game = newGame();
    const start = game.state.countries.TUR.economy.taxRate;
    assert.deepEqual(game.dispatch({ type: 'SET_TAX', countryId: 'TUR', rate: start + 0.05 }), ok);
    assert.equal(game.state.countries.TUR.economy.taxRate, start + 0.05);
    endTurns(game, 1);
    const { why } = game.state.countries.TUR.economy.last;
    close(why.revenue.parts.find((p) => p.id === 'taxRate').value, start + 0.05);
  });

  it('SET_BUDGET changes one category and nothing else', () => {
    const game = newGame();
    const before = { ...game.state.countries.TUR.budget };
    assert.deepEqual(game.dispatch({ type: 'SET_BUDGET', countryId: 'TUR', category: 'research', share: 0.011 }), ok);
    assert.deepEqual(game.state.countries.TUR.budget, { ...before, research: 0.011 });
  });

  it('refuses values outside the range around the start, unknown things and non-numbers, changing nothing', () => {
    const game = newGame();
    const before = JSON.stringify(game.state);
    const refused = [
      [{ type: 'SET_TAX', countryId: 'TUR', rate: 0.5 }, 'out_of_range'],
      [{ type: 'SET_TAX', countryId: 'TUR', rate: 0.1 }, 'out_of_range'],
      [{ type: 'SET_TAX', countryId: 'TUR', rate: Number.NaN }, 'bad_value'],
      [{ type: 'SET_TAX', countryId: 'TUR', rate: '0.3' }, 'bad_value'],
      [{ type: 'SET_TAX', countryId: 'ZZZ', rate: 0.3 }, 'unknown_country'],
      [{ type: 'SET_BUDGET', countryId: 'TUR', category: 'magic', share: 0.01 }, 'unknown_category'],
      [{ type: 'SET_BUDGET', countryId: 'TUR', category: 'military', share: -0.01 }, 'out_of_range'],
      [{ type: 'SET_BUDGET', countryId: 'TUR', category: 'military', share: 0.5 }, 'out_of_range'],
      [{ type: 'SET_BUDGET', countryId: 'TUR', category: 'military', share: Number.POSITIVE_INFINITY }, 'bad_value'],
    ];
    for (const [command, code] of refused) {
      const result = game.dispatch(command);
      assert.equal(result.ok, false, JSON.stringify(command));
      assert.equal(result.error.code, code, JSON.stringify(command));
    }
    assert.equal(JSON.stringify(game.state), before);
  });

  it('accepts exactly the edges of the range', () => {
    const game = newGame();
    const start = data.countries.byId.TUR.start;
    assert.deepEqual(game.dispatch({ type: 'SET_TAX', countryId: 'TUR', rate: 0.37 }), ok);
    assert.deepEqual(game.dispatch({ type: 'SET_TAX', countryId: 'TUR', rate: 0.17 }), ok);
    assert.deepEqual(game.dispatch({ type: 'SET_BUDGET', countryId: 'TUR', category: 'military', share: 0 }), ok);
    assert.deepEqual(game.dispatch({ type: 'SET_BUDGET', countryId: 'TUR', category: 'military', share: start.budget.military + data.balance.economy.budgetRange.military }), ok);
  });

  it('spending more than you earn drains the treasury, then borrows, and tells the news once', () => {
    const game = newGame('YEM'); // starts with almost nothing in the bank
    for (const [category, share] of [['military', 0.095], ['welfare', 0.12]]) game.dispatch({ type: 'SET_BUDGET', countryId: 'YEM', category, share });
    endTurns(game, 8);
    const yemen = game.state.countries.YEM.economy;
    assert.equal(yemen.treasuryMn, 0);
    assert.ok(yemen.debtMn > data.countries.byId.YEM.start.economy.debtPctGdp * 18_000, 'it borrowed');
    const borrowing = game.state.news.filter((entry) => entry.template === 'news.economy.borrowing');
    assert.equal(borrowing.length, 1, 'the news says it once, not every month');
    assert.ok(borrowing[0].params.amountMn > 0);
  });

  it('says so when the treasury is paying its own way again', () => {
    const game = newGame('YEM');
    game.dispatch({ type: 'SET_BUDGET', countryId: 'YEM', category: 'welfare', share: 0.12 });
    endTurns(game, 8);
    assert.ok(game.state.news.some((entry) => entry.template === 'news.economy.borrowing'));
    game.dispatch({ type: 'SET_BUDGET', countryId: 'YEM', category: 'welfare', share: 0.02 });
    game.dispatch({ type: 'SET_BUDGET', countryId: 'YEM', category: 'military', share: 0.0 });
    game.dispatch({ type: 'SET_TAX', countryId: 'YEM', rate: 0.2 });
    endTurns(game, 2);
    assert.ok(game.state.news.some((entry) => entry.template === 'news.economy.solvent'));
  });

  it('news is only about the player\'s own country', () => {
    const game = endTurns(newGame('TUR'), 24);
    for (const entry of game.state.news) assert.deepEqual(entry.refs, ['TUR']);
  });
});
