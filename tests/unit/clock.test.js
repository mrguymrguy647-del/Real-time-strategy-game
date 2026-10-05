import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceClock,
  cadenceRuns,
  createClock,
  monthIndex,
  parseStartDate,
  peekAdvance,
  setClockScale,
} from '../../src/core/clock.js';

describe('clock', () => {
  it('starts at the beginning of the start month', () => {
    assert.deepEqual(createClock('2026-01'), { year: 2026, month: 1, week: 1, turn: 0, scale: 'month' });
  });

  it('rejects bad start dates', () => {
    for (const bad of ['2026', '2026-13', '2026-00', 'Jan 2026', '26-01', '']) {
      assert.throws(() => parseStartDate(bad), /start date|month/i, bad);
    }
  });

  it('advances one month per turn and rolls over the year', () => {
    const clock = createClock('2026-11');
    assert.deepEqual(advanceClock(clock), { monthCompleted: true });
    assert.deepEqual([clock.year, clock.month, clock.turn], [2026, 12, 1]);
    advanceClock(clock);
    assert.deepEqual([clock.year, clock.month, clock.turn], [2027, 1, 2]);
  });

  it('twelve monthly turns make exactly one year', () => {
    const clock = createClock('2026-01');
    for (let i = 0; i < 12; i++) advanceClock(clock);
    assert.deepEqual([clock.year, clock.month, clock.week, clock.turn], [2027, 1, 1, 12]);
  });

  it('advances one week per turn in week scale and completes a month every fourth turn', () => {
    const clock = createClock('2026-03');
    setClockScale(clock, 'week');
    const completed = [];
    for (let i = 0; i < 8; i++) completed.push(advanceClock(clock).monthCompleted);
    assert.deepEqual(completed, [false, false, false, true, false, false, false, true]);
    assert.deepEqual([clock.year, clock.month, clock.week, clock.turn], [2026, 5, 1, 8]);
  });

  it('returns to monthly turns at the next month boundary (G-01)', () => {
    const clock = createClock('2026-03');
    setClockScale(clock, 'week');
    advanceClock(clock);
    advanceClock(clock); // March, week 3
    assert.equal(clock.week, 3);
    setClockScale(clock, 'month');
    const result = advanceClock(clock);
    assert.equal(result.monthCompleted, true);
    assert.deepEqual([clock.month, clock.week, clock.turn], [4, 1, 3]);
  });

  it('peekAdvance() reports the next step without changing the clock', () => {
    const clock = createClock('2026-12');
    const before = structuredClone(clock);
    assert.deepEqual(peekAdvance(clock), { year: 2027, month: 1, week: 1, monthCompleted: true });
    assert.deepEqual(clock, before);
  });

  it('rejects an unknown scale', () => {
    assert.throws(() => setClockScale(createClock('2026-01'), /** @type {any} */ ('day')), /scale/);
  });

  it('decides which cadences run', () => {
    const monthStep = { monthCompleted: true, scale: /** @type {const} */ ('month') };
    const weekMid = { monthCompleted: false, scale: /** @type {const} */ ('week') };
    const weekEnd = { monthCompleted: true, scale: /** @type {const} */ ('week') };
    assert.equal(cadenceRuns('any', weekMid), true);
    assert.equal(cadenceRuns('monthly', monthStep), true);
    assert.equal(cadenceRuns('monthly', weekMid), false);
    assert.equal(cadenceRuns('monthly', weekEnd), true);
    assert.equal(cadenceRuns('weekly', monthStep), false);
    assert.equal(cadenceRuns('weekly', weekMid), true);
    assert.throws(() => cadenceRuns(/** @type {any} */ ('daily'), monthStep), /cadence/);
  });

  it('orders dates with monthIndex()', () => {
    assert.ok(monthIndex({ year: 2026, month: 12 }) < monthIndex({ year: 2027, month: 1 }));
    assert.equal(monthIndex({ year: 2027, month: 1 }) - monthIndex({ year: 2026, month: 1 }), 12);
  });
});
