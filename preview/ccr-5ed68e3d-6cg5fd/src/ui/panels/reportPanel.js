// The monthly report (GAME_DESIGN §1, step 1): what the last month did to the player's country, with
// the alerts that matter now and the news of the turn. Every money line can say why (a tap shows the
// parts it is made of). It only reads the game; it opens by itself after End turn.

import { t } from '../../util/i18n.js';
import { h } from '../dom.js';
import { formatDate, formatMoneyMn, formatPercent, newsText, toneOf } from '../format.js';
import { alertParagraphs } from '../components/alerts.js';
import { sheetHead } from '../components/sheetHead.js';
import { whyList } from '../components/why.js';

/**
 * @param {{ game: import('../../game.js').Game, countryId: string, onClose: () => void }} options
 */
export function createReportPanel({ game, countryId, onClose }) {
  const el = h('aside', { class: 'sheet sheet--tall report', role: 'region', 'aria-label': t('report.title'), hidden: true });
  /** The lines whose "why" is open, kept between redraws so a turn does not close what the player was reading. @type {Set<string>} */
  const open = new Set();

  /**
   * A money line; with `why` it is a button that opens the parts it is made of.
   * @param {{ id: string, label: string, value: string, signed?: number, why?: Node[] }} line
   */
  function line({ id, label, value, signed = 0, why }) {
    const text = [h('span', { class: 'report__label' }, label), h('span', { class: `report__value ${toneOf(signed)}` }, value)];
    if (!why) return h('div', { class: 'report__line', 'data-line': id }, ...text);
    const isOpen = open.has(id);
    return h(
      'div',
      { class: `report__line report__line--why${isOpen ? ' is-open' : ''}`, 'data-line': id },
      h(
        'button',
        {
          class: 'report__toggle',
          type: 'button',
          'aria-expanded': String(isOpen),
          onclick: () => {
            if (open.has(id)) open.delete(id);
            else open.add(id);
            render();
          },
        },
        ...text,
        h('span', { class: 'report__chevron', 'aria-hidden': 'true' }, isOpen ? '▴' : '▾'),
      ),
      isOpen ? h('div', { class: 'report__why' }, ...why) : null,
    );
  }

  /** @param {string} caption @param {Node} list */
  const captioned = (caption, list) => h('div', { class: 'why__block' }, h('p', { class: 'why__caption' }, caption), list);

  function render() {
    const { state, data } = game;
    const scrolled = el.scrollTop;
    const economy = state.countries[countryId].economy;
    const last = economy.last;
    const country = data.countries.byId[countryId];
    /** @type {Array<Node | null>} */
    const parts = [sheetHead({ title: last ? t('report.heading', { date: formatDate(last.period) }) : t('report.title'), subtitle: country.name, onClose })];

    const alerts = alertParagraphs(state, data, countryId);

    if (!last) {
      parts.push(h('p', { class: 'muted report__empty' }, t('report.empty')), ...alerts);
    } else {
      const change = last.balanceMn + last.borrowedMn; // what the month did to the treasury
      const why = last.why;
      parts.push(
        h(
          'div',
          { class: 'report__headline' },
          h('span', { class: 'report__label' }, t('report.treasury')),
          h('strong', { class: 'report__big', 'data-treasury': '' }, formatMoneyMn(economy.treasuryMn, { precise: true })),
          h('span', { class: `report__change ${toneOf(change)}` }, t('report.treasuryChange', { change: formatMoneyMn(change, { signed: true }) })),
        ),
        ...alerts,
        h(
          'div',
          { class: 'report__lines' },
          line({ id: 'revenue', label: t('report.income'), value: formatMoneyMn(last.revenueMn, { signed: true }), signed: 1, why: [whyList('revenue', why.revenue)] }),
          line({ id: 'spending', label: t('report.spending'), value: formatMoneyMn(-last.spendingMn, { signed: true }), signed: -1, why: [whyList('spending', why.spending)] }),
          line({
            id: 'interest',
            label: t('report.interest'),
            value: formatMoneyMn(-last.interestMn, { signed: true }),
            signed: -1,
            why: [captioned(t('why.caption.interest'), whyList('interest', why.interest)), captioned(t('why.caption.interestRate'), whyList('interestRate', why.interestRate))],
          }),
          line({ id: 'balance', label: t('report.balance'), value: formatMoneyMn(last.balanceMn, { signed: true }), signed: last.balanceMn }),
          last.borrowedMn >= 1 ? line({ id: 'borrowed', label: t('report.borrowed'), value: formatMoneyMn(last.borrowedMn), signed: -1 }) : null,
          line({ id: 'growth', label: t('report.growth'), value: t('report.growthValue', { rate: formatPercent(last.growth, { signed: true }) }), signed: last.growth, why: [whyList('growth', why.growth)] }),
        ),
        h(
          'dl',
          { class: 'facts report__facts' },
          h('div', { class: 'fact' }, h('dt', null, t('report.gdp')), h('dd', null, formatMoneyMn(economy.gdpBn * 1000))),
          h('div', { class: 'fact' }, h('dt', null, t('report.debt')), h('dd', null, t('map.panel.debtValue', { amount: formatMoneyMn(economy.debtMn), percent: formatPercent(economy.debtMn / (economy.gdpBn * 1000), { decimals: 0 }) }))),
        ),
        h('p', { class: 'muted report__tip' }, t('report.tapHint')),
      );
    }

    const news = state.news.filter((/** @type {any} */ entry) => entry.turn === state.clock.turn && entry.refs?.includes(countryId));
    if (news.length > 0) {
      parts.push(h('section', { class: 'report__news' }, h('h3', null, t('report.news')), h('ul', null, news.map((/** @type {any} */ entry) => h('li', null, newsText(entry))))));
    }
    el.replaceChildren(...parts.filter((part) => part !== null));
    el.scrollTop = scrolled;
  }

  render();
  return {
    el,
    render,
    /** Show the report, from the top. */
    show() {
      render();
      el.hidden = false;
      el.scrollTop = 0;
    },
    hide() {
      el.hidden = true;
    },
  };
}
