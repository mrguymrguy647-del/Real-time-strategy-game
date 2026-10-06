// The budget (GAME_DESIGN §4.1): the tax rate and the four spending shares, as standing orders for
// every coming month. Plus and minus buttons move a lever one step; each change is a command (the
// same one the AI will use), and the forecast above the levers is the real next month, computed
// with the same formulas, so what it promises is what happens.
//
// The panel is built once and refresh() changes its numbers in place: a button that is being held
// down is never replaced under the finger (a replaced element can lose the touch).

import { t } from '../../util/i18n.js';
import { BUDGET_CATEGORIES, budgetBounds, monthlyGdpMn, stepValue, taxBounds } from '../../formulas/economy.js';
import { previewEconomy } from '../../systems/economy.js';
import { h } from '../dom.js';
import { formatMoneyMn, formatParams, formatPercent, toneOf } from '../format.js';
import { alertParagraphs } from '../components/alerts.js';
import { sheetHead } from '../components/sheetHead.js';

/** The levers, in the order they are shown. */
const LEVERS = ['tax', ...BUDGET_CATEGORIES];

/** Holding a button down keeps stepping: after a short wait, ten times a second, until the finger lifts or the limit is reached. */
const HOLD_DELAY_MS = 450;
const HOLD_REPEAT_MS = 100;

/**
 * @param {{ game: import('../../game.js').Game, countryId: string, onClose: () => void }} options
 */
export function createBudgetPanel({ game, countryId, onClose }) {
  const el = h('aside', { class: 'sheet sheet--tall budget', role: 'region', 'aria-label': t('budget.title'), hidden: true });
  /** The parts of each lever row that change. @type {Map<string, { value: HTMLElement, money: HTMLElement, minus: HTMLButtonElement, plus: HTMLButtonElement }>} */
  const rows = new Map();
  const forecastHost = h('div', { class: 'forecast-host' });

  /** @param {string} lever */
  function valueOf(lever) {
    const country = game.state.countries[countryId];
    return lever === 'tax' ? country.economy.taxRate : country.budget[lever];
  }

  /** The range and step of a lever, from the data. @param {string} lever */
  function boundsOf(lever) {
    const { start } = game.data.countries.byId[countryId];
    const params = game.data.balance.economy;
    return lever === 'tax' ? taxBounds(start.economy.taxRate, params) : budgetBounds(/** @type {any} */ (lever), start.budget[lever], params);
  }

  /** @param {string} lever @param {1 | -1} direction @returns {boolean} whether the lever moved */
  function change(lever, direction) {
    const next = stepValue(valueOf(lever), direction, boundsOf(lever));
    if (next === valueOf(lever)) return false; // already at its limit: nothing to order
    game.dispatch(lever === 'tax' ? { type: 'SET_TAX', countryId, rate: next } : { type: 'SET_BUDGET', countryId, category: lever, share: next });
    return true; // the command made the screen call refresh()
  }

  // ---- press and hold ---------------------------------------------------------------------------
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let holdDelay;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let holdRepeat;
  /** Stop repeating and forget the window listeners of the hold in progress. */
  function stopHold() {
    clearTimeout(holdDelay);
    clearInterval(holdRepeat);
    window.removeEventListener('pointerup', stopHold);
    window.removeEventListener('pointercancel', stopHold);
  }
  /** @param {string} lever @param {1 | -1} direction */
  function startHold(lever, direction) {
    stopHold();
    holdDelay = setTimeout(() => {
      holdRepeat = setInterval(() => {
        if (!change(lever, direction)) stopHold();
      }, HOLD_REPEAT_MS);
      if (!change(lever, direction)) stopHold();
    }, HOLD_DELAY_MS);
    window.addEventListener('pointerup', stopHold);
    window.addEventListener('pointercancel', stopHold);
  }

  // ---- building ---------------------------------------------------------------------------------
  /** @param {string} lever */
  function buildRow(lever) {
    const name = t(`budget.${lever}`);
    const value = h('output', { class: 'stepper__value', 'data-value': '' });
    const money = h('span', { class: 'muted lever__money' });
    const minus = h('button', { class: 'stepper__btn', type: 'button', 'aria-label': t('budget.lower', { name }), onclick: () => change(lever, -1), onpointerdown: () => startHold(lever, -1) }, '−');
    const plus = h('button', { class: 'stepper__btn', type: 'button', 'aria-label': t('budget.raise', { name }), onclick: () => change(lever, 1), onpointerdown: () => startHold(lever, 1) }, '+');
    rows.set(lever, { value, money, minus, plus });
    return h(
      'div',
      { class: 'lever', 'data-lever': lever },
      h('div', { class: 'lever__text' }, h('strong', null, name), h('span', { class: 'muted lever__hint' }, t(`budget.${lever}.hint`))),
      h('div', { class: 'lever__control' }, h('div', { class: 'stepper' }, minus, value, plus), money),
    );
  }

  /** The next month as the formulas see it: a few numbers that change as the levers move, and what to watch out for. */
  function forecast() {
    const { state, data } = game;
    const next = previewEconomy(state, data, countryId);
    /** @param {string} label @param {string} value @param {string} [cls] */
    const fact = (label, value, cls = '') => h('div', { class: 'fact' }, h('dt', null, label), h('dd', { class: cls }, value));
    const alerts = alertParagraphs(state, data, countryId);
    return h(
      'section',
      { class: 'forecast' },
      h('h3', null, t('budget.forecast')),
      h(
        'dl',
        { class: 'facts forecast__facts' },
        fact(t('report.income'), formatMoneyMn(next.revenue.value, { signed: true })),
        fact(t('report.spending'), formatMoneyMn(-next.spending.value, { signed: true })),
        fact(t('report.interest'), formatMoneyMn(-next.interest.value, { signed: true })),
        fact(t('report.balance'), formatMoneyMn(next.balanceMn, { signed: true }), `forecast__total ${toneOf(next.balanceMn)}`),
        fact(t('report.growth'), t('report.growthValue', { rate: formatPercent(next.growth.value, { signed: true }) }), toneOf(next.growth.value)),
      ),
      ...alerts,
      alerts.length === 0 ? h('p', { class: 'muted forecast__note' }, next.balanceMn >= 0 ? t('budget.surplus') : t('budget.deficit')) : null,
    );
  }

  /** Bring every number up to date, in place. */
  function refresh() {
    const { gdpBn } = game.state.countries[countryId].economy;
    for (const lever of LEVERS) {
      const row = /** @type {NonNullable<ReturnType<typeof rows.get>>} */ (rows.get(lever));
      const value = valueOf(lever);
      const bounds = boundsOf(lever);
      row.value.textContent = formatPercent(value, { decimals: 2 });
      row.money.textContent = t('budget.perMonth', formatParams({ amountMn: value * monthlyGdpMn(gdpBn) }));
      row.minus.disabled = value <= bounds.min + 1e-9;
      row.plus.disabled = value >= bounds.max - 1e-9;
    }
    forecastHost.replaceChildren(forecast());
  }

  const country = game.data.countries.byId[countryId];
  el.append(sheetHead({ title: t('budget.title'), subtitle: t('budget.subtitle', { name: country.name }), onClose }), forecastHost, h('div', { class: 'levers' }, LEVERS.map(buildRow)));
  refresh();

  return {
    el,
    render: refresh,
    show() {
      refresh();
      el.hidden = false;
      el.scrollTop = 0;
    },
    hide() {
      stopHold();
      el.hidden = true;
    },
    /** Stop anything still running (a held button) when the screen goes away. */
    destroy: stopHold,
  };
}
