// The game calendar (G-01). A turn is one month; while a capital battle involving the player
// is active it is one week (4 weeks = 1 month). World systems run once per month boundary,
// battle systems every turn. The clock always sits at the start of a week.

export const WEEKS_PER_MONTH = 4;

/** @typedef {{ year: number, month: number, week: number, turn: number, scale: 'month' | 'week' }} Clock */
/** @typedef {'monthly' | 'weekly' | 'any'} Cadence */

/**
 * Parse "YYYY-MM".
 * @param {string} text
 */
export function parseStartDate(text) {
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`Bad start date "${text}" (expected YYYY-MM)`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Bad month in start date "${text}"`);
  return { year, month };
}

/**
 * @param {string} startDate "YYYY-MM"
 * @returns {Clock}
 */
export function createClock(startDate) {
  const { year, month } = parseStartDate(startDate);
  return { year, month, week: 1, turn: 0, scale: 'month' };
}

/**
 * @param {number} year
 * @param {number} month
 */
function nextMonth(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * What the next turn will do, without changing the clock. A monthly turn always lands on the
 * start of the next month (from mid-month that is a shorter turn).
 * @param {Clock} clock
 */
export function peekAdvance(clock) {
  if (clock.scale === 'week' && clock.week < WEEKS_PER_MONTH) {
    return { year: clock.year, month: clock.month, week: clock.week + 1, monthCompleted: false };
  }
  return { ...nextMonth(clock.year, clock.month), week: 1, monthCompleted: true };
}

/**
 * Move the clock one turn forward.
 * @param {Clock} clock
 * @returns {{ monthCompleted: boolean }}
 */
export function advanceClock(clock) {
  const next = peekAdvance(clock);
  clock.year = next.year;
  clock.month = next.month;
  clock.week = next.week;
  clock.turn += 1;
  return { monthCompleted: next.monthCompleted };
}

/**
 * @param {Clock} clock
 * @param {'month' | 'week'} scale
 */
export function setClockScale(clock, scale) {
  if (scale !== 'month' && scale !== 'week') throw new Error(`Bad clock scale "${scale}"`);
  clock.scale = scale;
}

/**
 * Months since year 0, for comparing dates.
 * @param {{ year: number, month: number }} date
 */
export function monthIndex(date) {
  return date.year * 12 + (date.month - 1);
}

/**
 * Whether a system with this cadence runs on the turn being processed.
 * @param {Cadence} cadence
 * @param {{ monthCompleted: boolean, scale: 'month' | 'week' }} turn
 */
export function cadenceRuns(cadence, turn) {
  if (cadence === 'any') return true;
  if (cadence === 'monthly') return turn.monthCompleted;
  if (cadence === 'weekly') return turn.scale === 'week';
  throw new Error(`Bad cadence "${cadence}"`);
}
