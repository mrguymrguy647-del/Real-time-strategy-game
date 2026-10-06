// The Resources panel (GAME_DESIGN §5): for each resource its world price, what your country makes, uses
// and keeps, whether it is short, and the buttons that buy into or sell out of the reserve; then the
// straits your trade passes, each with a "what if it closed?" that plays the next months on a copy of
// the game. It only reads the game; trades are commands (the same ones the AI will use).

import { t } from '../../util/i18n.js';
import { closureEstimate } from '../../systems/resourcePreview.js';
import { countryFlows } from '../../systems/resourceFlows.js';
import { h } from '../dom.js';
import { formatMoneyMn, formatPercent } from '../format.js';
import { resourceAlertParagraphs } from '../components/alerts.js';
import { resourceCard } from '../components/resourceCard.js';
import { sheetHead } from '../components/sheetHead.js';

/** How many months the "what if it closed?" looks ahead. */
const CLOSURE_MONTHS = 12;
/** A loss of income smaller than this (USD millions a month) is not worth a line. */
const MIN_INCOME_LOSS_MN = 50;

/**
 * @param {{ game: import('../../game.js').Game, countryId: string, onClose: () => void }} options
 */
export function createResourcesPanel({ game, countryId, onClose }) {
  const el = h('aside', { class: 'sheet sheet--tall resources', role: 'region', 'aria-label': t('res.title'), hidden: true });
  /** What the player had open, kept between redraws so a turn or a trade does not close it. @type {Set<string>} */
  const openLadders = new Set();
  /** @type {Set<string>} */
  const openStraits = new Set();

  /** @param {'buy' | 'sell'} side @param {string} resource @param {number} units */
  function trade(side, resource, units) {
    game.dispatch({ type: side === 'buy' ? 'BUY_RESOURCE' : 'SELL_RESOURCE', countryId, resource, units });
  }

  /** What closing a strait would do, in lines a player can act on. @param {any} chokepoint */
  function closureResult(chokepoint) {
    const estimate = closureEstimate(game.state, game.data, countryId, chokepoint.id, { months: CLOSURE_MONTHS });
    const lines = [];
    for (const line of estimate.resources) {
      const resource = game.data.resources.byId[line.id];
      /** @type {string[]} */
      const parts = [];
      if (Math.abs(line.priceChange) >= 0.03) parts.push(t(line.priceChange > 0 ? 'res.closure.priceUp' : 'res.closure.priceDown', { percent: formatPercent(Math.abs(line.priceChange), { decimals: 0 }) }));
      if (line.incomeChangeMn <= -MIN_INCOME_LOSS_MN) parts.push(t('res.closure.income', { amountMn: formatMoneyMn(-line.incomeChangeMn) }));
      if (line.firstShort !== null) parts.push(t('res.closure.short', { n: line.firstShort, label: line.label ?? '' }));
      if (parts.length > 0) lines.push(h('li', { class: line.firstShort !== null ? 'is-bad' : '' }, h('strong', null, `${resource.icon} ${resource.name}`), ': ', parts.join(' · ')));
    }
    return h(
      'div',
      { class: 'strait__result', 'data-closure': chokepoint.id },
      h('p', { class: 'muted' }, t('res.closure.intro', { n: CLOSURE_MONTHS })),
      lines.length > 0 ? h('ul', null, lines) : h('p', null, t('res.closure.nothing')),
    );
  }

  /** @param {any} chokepoint */
  function straitCard(chokepoint) {
    const { state, data } = game;
    const blockade = state.world.chokepoints[chokepoint.id].blockade;
    const share = data.countries.byId[countryId].chokepoints?.[chokepoint.id] ?? 0;
    const world = Object.entries(chokepoint.worldTradeShare).map(([id, fraction]) => t('res.strait.world', { percent: formatPercent(/** @type {number} */ (fraction), { decimals: 0 }), name: data.resources.byId[id].name.toLowerCase() }));
    const open = openStraits.has(chokepoint.id);
    return h(
      'article',
      { class: 'strait', 'data-strait': chokepoint.id },
      h('header', { class: 'strait__head' }, h('strong', null, chokepoint.name), h('span', { class: blockade > 0 ? 'neg' : 'muted' }, blockade > 0 ? t('res.strait.blocked', { percent: formatPercent(blockade, { decimals: 0 }) }) : t('res.strait.open'))),
      h('p', { class: 'muted' }, chokepoint.blurb, ' ', world.join(' ')),
      h('p', null, share > 0 ? t('res.strait.exposure', { percent: formatPercent(share, { decimals: 0 }) }) : t('res.strait.none')),
      h(
        'button',
        {
          class: 'btn btn--small strait__toggle',
          type: 'button',
          'aria-expanded': String(open),
          onclick: () => {
            if (open) openStraits.delete(chokepoint.id);
            else openStraits.add(chokepoint.id);
            render();
          },
        },
        t(open ? 'res.closure.hide' : 'res.closure.show'),
      ),
      open ? closureResult(chokepoint) : null,
    );
  }

  function render() {
    const { state, data } = game;
    const scrolled = el.scrollTop;
    const country = data.countries.byId[countryId];
    const flows = countryFlows(state, data, countryId).byResource;
    const alerts = resourceAlertParagraphs(state, data, countryId);
    el.replaceChildren(
      sheetHead({ title: t('res.title'), subtitle: t('res.subtitle', { name: country.name }), onClose }),
      h('p', { class: 'muted res__intro' }, t('res.intro')),
      ...alerts,
      h(
        'div',
        { class: 'res-list' },
        data.activeResources.map((/** @type {any} */ resource) =>
          resourceCard({
            game,
            countryId,
            resource,
            flow: flows[resource.id],
            ladderOpen: openLadders.has(resource.id),
            onLadder: (open) => (open ? openLadders.add(resource.id) : openLadders.delete(resource.id)),
            onTrade: (side, units) => trade(side, resource.id, units),
          }),
        ),
      ),
      h('section', { class: 'straits' }, h('h3', null, t('res.straits')), h('p', { class: 'muted' }, t('res.straits.intro')), data.chokepoints.items.map(straitCard)),
    );
    el.scrollTop = scrolled;
  }

  render();
  return {
    el,
    render,
    /** Show the panel from the top, or scrolled to one strait. @param {string} [straitId] */
    show(straitId) {
      render();
      el.hidden = false;
      el.scrollTop = 0;
      if (straitId) el.querySelector(`[data-strait="${straitId}"]`)?.scrollIntoView({ block: 'start' });
    },
    hide() {
      el.hidden = true;
    },
  };
}
