// The budget (GAME_DESIGN §4.1): the tax rate and the four spending shares, as standing orders for
// every coming month. Plus and minus buttons move a lever one step; each change is a command (the
// same one the AI will use), and the forecast under the levers is the real next month, computed
// with the same formulas, so what it promises is what happens.

import { t } from '../../util/i18n.js';
import { BUDGET_CATEGORIES, budgetBounds, monthlyGdpMn, stepValue, taxBounds } from '../../formulas/economy.js';
import { previewEconomy } from '../../systems/economy.js';
import { h } from '../dom.js';
import { formatMoneyMn, formatParams, formatPercent, toneOf } from '../format.js';
import { alertParagraphs } from '../components/alerts.js';
import { sheetHead } from '../components/sheetHead.js';

/** The levers, in the order they are shown. */
const LEVERS = ['tax', ...BUDGET_CATEGORIES];

/**
 * @param {{ game: import('../../game.js').Game, countryId: string, onClose: () => void }} options
 */
export function createBudgetPanel({ game, countryId, onClose }) {
  const el = h('aside', { class: 'sheet sheet--tall budget', role: 'region', 'aria-label': t('budget.title'), hidden: true });

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
    // The command redrew the panel; give the button that was used its focus back (for keyboards and switches).
    el.querySelectorAll(`[data-lever="${lever}"] .stepper__btn`)[direction > 0 ? 1 : 0]?.focus({ preventScroll: true });
    return true;
  }

  /** Holding a button down keeps stepping: after a short wait, ten times a second, until the finger lifts or the limit is reached. */
  const HOLD_DELAY_MS = 450;
  const HOLD_REPEAT_MS = 100;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let holdDelay;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let holdRepeat;
  function stopHold() {
    clearTimeout(holdDelay);
    clearInterval(holdRepeat);
  }
  /** @param {string} lever @param {1 | -1} direction */
  function startHold(lever, direction) {
    stopHold();
    holdDelay = setTimeout(() => {
      // The panel is redrawn at every step, so the button under the finger is replaced: the repeat
      // lives here, and a pointer event on the window ends it.
      holdRepeat = setInterval(() => {
        if (!change(lever, direction)) stopHold();
      }, HOLD_REPEAT_MS);
      if (!change(lever, direction)) stopHold();
    }, HOLD_DELAY_MS);
    window.addEventListener('pointerup', stopHold, { once: true });
    window.addEventListener('pointercancel', stopHold, { once: true });
  }

  /** @param {string} lever */
  function leverRow(lever) {
    const { gdpBn } = game.state.countries[countryId].economy;
    const value = valueOf(lever);
    const bounds = boundsOf(lever);
    const name = t(`budget.${lever}`);
    const atMin = value <= bounds.min + 1e-9;
    const atMax = value >= bounds.max - 1e-9;
    return h(
      'div',
      { class: 'lever', 'data-lever': lever },
      h('div', { class: 'lever__text' }, h('strong', null, name), h('span', { class: 'muted lever__hint' }, t(`budget.${lever}.hint`))),
      h(
        'div',
        { class: 'lever__control' },
        h(
          'div',
          { class: 'stepper' },
          h('button', { class: 'stepper__btn', type: 'button', 'aria-label': t('budget.lower', { name }), disabled: atMin, onclick: () => change(lever, -1), onpointerdown: () => startHold(lever, -1) }, '−'),
          h('output', { class: 'stepper__value', 'data-value': '' }, formatPercent(value, { decimals: 2 })),
          h('button', { class: 'stepper__btn', type: 'button', 'aria-label': t('budget.raise', { name }), disabled: atMax, onclick: () => change(lever, 1), onpointerdown: () => startHold(lever, 1) }, '+'),
        ),
        h('span', { class: 'muted lever__money' }, t('budget.perMonth', formatParams({ amountMn: value * monthlyGdpMn(gdpBn) }))),
      ),
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

  function render() {
    const country = game.data.countries.byId[countryId];
    const scrolled = el.scrollTop;
    el.replaceChildren(
      sheetHead({ title: t('budget.title'), subtitle: t('budget.subtitle', { name: country.name }), onClose }),
      forecast(),
      h('div', { class: 'levers' }, LEVERS.map(leverRow)),
    );
    el.scrollTop = scrolled;
  }

  render();
  return {
    el,
    render,
    show() {
      render();
      el.hidden = false;
      el.scrollTop = 0;
    },
    hide() {
      stopHold();
      el.hidden = true;
    },
  };
}
