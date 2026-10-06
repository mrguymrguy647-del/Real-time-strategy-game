// "Capturing this region: +12% income, ..." (GAME_DESIGN §5, UI requirement): what holding a region
// would be worth to the player, from the pure what-if in systems/resourcePreview.js. Shown under a
// region of another country while playing.

import { t } from '../../util/i18n.js';
import { captureEstimate } from '../../systems/resourcePreview.js';
import { h } from '../dom.js';
import { formatMoneyMn, formatMonths, formatPercent, formatUnits } from '../format.js';

/** A resource line is shown when the region changes the country's balance by at least this many units a month. */
const MIN_UNITS = 0.05;

/** @param {number} months */
const coverText = (months) => (Number.isFinite(months) ? formatMonths(months) : t('map.capture.noShortfall'));

/**
 * @param {any} state
 * @param {import('../../core/data.js').GameData} data
 * @param {string} playerId who would hold the region
 * @param {string} regionId
 * @returns {HTMLElement | null} null for a region the player holds or one outside the game
 */
export function captureNode(state, data, playerId, regionId) {
  const estimate = captureEstimate(state, data, playerId, regionId);
  if (!estimate) return null;
  const lines = [h('li', { 'data-capture': 'income' }, t('map.capture.income', { change: formatMoneyMn(estimate.incomeMn, { signed: true }), percent: formatPercent(estimate.incomeShare, { signed: true, decimals: 0 }) }))];
  for (const line of estimate.resources) {
    if (Math.abs(line.net) < MIN_UNITS) continue;
    const resource = data.resources.byId[line.id];
    const matters = Number.isFinite(line.coverMonthsBefore) || Number.isFinite(line.coverMonthsAfter);
    lines.push(
      h(
        'li',
        { 'data-capture': line.id },
        t(line.net > 0 ? 'map.capture.gain' : 'map.capture.loss', { icon: resource.icon, name: resource.name, amount: formatUnits(line.net) }),
        matters ? h('small', { class: 'muted' }, ` (${t('map.capture.cover', { from: coverText(line.coverMonthsBefore), to: coverText(line.coverMonthsAfter) })})`) : null,
      ),
    );
  }
  return h('div', { class: 'capture' }, h('h4', null, t('map.capture.title')), h('ul', null, lines), h('p', { class: 'muted capture__note' }, t('map.capture.note')));
}
