// Scaffold demo (Phase 0b only; removed when Phase 1 brings real systems). Each month it rolls a
// d100 from the seeded generator and reports it. Save, end a turn, load, end the same turn
// again: the roll is identical. That is the determinism promise of T-07, visible on a phone.

/** @type {import('../core/turn.js').System} */
export const demoRollSystem = {
  id: 'demo.roll',
  order: 10,
  cadence: 'monthly',
  step(ctx) {
    const roll = ctx.rng.int(1, 100);
    ctx.state.demo.rolls += 1;
    ctx.state.demo.lastRoll = roll;
    ctx.news({ importance: 1, template: 'news.demoRoll', params: { n: roll } });
  },
};
