// One resource in the Resources panel: its price, what the country makes, uses and keeps, whether it is
// short, what a shortage would do (the ladder from resources.json), and the two buttons that buy
// into the reserve or sell out of it. It only reads the game; the buttons call `onTrade`.

import { t, tn } from '../../util/i18n.js';
import { tidy } from '../../formulas/economy.js';
import { planTrade } from '../../systems/resourceCommands.js';
import { h } from '../dom.js';
import { effectText, formatMoneyMn, formatPercent, formatPrice, formatUnits } from '../format.js';
import { lastsText } from '../resourceText.js';

/** The amount one tap buys or sells: a month of what the country uses. @param {{ consumption: number }} flow */
export const monthOfUse = (flow) => Math.max(0.01, tidy(flow.consumption * 100) / 100);

/** @param {number} n a number of game units */
const unitsText = (n) => tn('res.unitsCount', n, { n: formatUnits(n) });

/**
 * @param {{
 *   game: import('../../game.js').Game,
 *   countryId: string,
 *   resource: any,
 *   flow: ReturnType<typeof import('../../systems/resourceFlows.js').countryFlows>['byResource'][string],
 *   ladderOpen: boolean,
 *   onLadder: (open: boolean) => void,
 *   onTrade: (side: 'buy' | 'sell', units: number) => void,
 * }} options
 */
export function resourceCard({ game, countryId, resource, flow, ladderOpen, onLadder, onTrade }) {
  const { state } = game;
  const market = state.world.market[resource.id];
  const entry = state.countries[countryId].resources[resource.id];
  const net = flow.production - flow.consumption;
  const change = market.last ? market.price / market.last.previous - 1 : 0;
  const changeText = Math.abs(change) < 0.0005 ? '' : t(change > 0 ? 'res.change.up' : 'res.change.down', { percent: formatPercent(Math.abs(change), { decimals: 1 }) });

  /** @param {string} label @param {string} value @param {string | null} [more] */
  const fact = (label, value, more = null) => h('div', { class: 'fact' }, h('dt', null, label), h('dd', null, value, more ? h('small', { class: 'muted fact__more' }, more) : null));
  const perMonth = (/** @type {number} */ n) => t('res.perMonth', { amount: formatUnits(n) });
  const traded = flow.exports > 0.005 ? flow.exports : flow.imports;

  const facts = [
    fact(t('res.makes'), perMonth(flow.production)),
    fact(t('res.uses'), perMonth(flow.consumption)),
    net > 0.005 || net < -0.005 || traded > 0.005
      ? fact(t(net > 0 ? 'res.sells' : 'res.buys'), perMonth(Math.abs(net)), t('res.worth', { amountMn: formatMoneyMn(Math.abs(net) * flow.price) }))
      : fact(t('res.trade'), t('res.position.balanced')),
    fact(t('res.reserve'), formatUnits(entry.stock), lastsText({ production: flow.production, consumption: flow.consumption, stock: entry.stock }, { short: true }) ?? t('res.noShortfall')),
  ];

  // the state's cut of what the country sells: the income the report counts
  const income = flow.income.value > 0 ? h('p', { class: 'muted res__income' }, t('res.stateShare', { percent: formatPercent(flow.stateShare, { decimals: 0 }), amountMn: formatMoneyMn(flow.income.value) })) : null;
  const blocked = flow.blocked > 0.005 ? h('p', { class: 'res__blocked' }, t('res.blocked', { percent: formatPercent(flow.blocked, { decimals: 0 }) })) : null;

  // short now, or not
  const rung = entry.step > 0 ? resource.shortage[entry.step - 1] : null;
  const status = rung
    ? h('div', { class: 'res__short', 'data-short': resource.id }, h('strong', null, t('res.short', { label: rung.label })), h('ul', null, rung.effects.map((/** @type {any} */ effect) => h('li', null, effectText(effect)))))
    : h('p', { class: 'muted res__ok' }, t('res.ok'));

  const ladder = h(
    'details',
    { class: 'res__ladder', open: ladderOpen || undefined, ontoggle: (/** @type {Event} */ event) => onLadder(/** @type {HTMLDetailsElement} */ (event.currentTarget).open) },
    h('summary', null, t('res.ladder')),
    h(
      'ul',
      null,
      resource.shortage.map((/** @type {any} */ step, /** @type {number} */ i) =>
        h(
          'li',
          { class: entry.step === i + 1 ? 'is-now' : '' },
          h('strong', null, t('res.ladder.below', { percent: formatPercent(step.coverageBelow, { decimals: 0 }) })),
          ` ${step.label}: `,
          step.effects.map(effectText).join('; '),
        ),
      ),
    ),
  );

  /** A buy or sell button: what one tap does, and why it cannot when it cannot. @param {'buy' | 'sell'} side */
  const tradeButton = (side) => {
    const units = monthOfUse(flow);
    const plan = planTrade(game, { countryId, resource: resource.id, units }, side);
    const second = 'error' in plan ? t(`res.trade.error.${plan.error}`) : t('res.trade.offer', { units: unitsText(units), amountMn: formatMoneyMn(plan.valueMn) });
    return h(
      'button',
      { class: 'btn btn--two-line res__btn', type: 'button', 'data-trade': side, disabled: 'error' in plan, onclick: () => onTrade(side, units) },
      h('span', null, t(side === 'buy' ? 'res.buy' : 'res.sell')),
      h('small', null, second),
    );
  };

  return h(
    'article',
    { class: `res${rung ? ' is-short' : ''}`, 'data-resource': resource.id },
    h('header', { class: 'res__head' }, h('strong', { class: 'res__name' }, `${resource.icon} ${resource.name}`), h('span', { class: 'res__price', 'data-price': '' }, formatPrice(resource, market.price)), h('span', { class: 'muted res__change' }, changeText)),
    h('dl', { class: 'facts res__facts' }, facts),
    blocked,
    income,
    status,
    h('div', { class: 'res__trade' }, tradeButton('buy'), tradeButton('sell')),
    ladder,
  );
}
