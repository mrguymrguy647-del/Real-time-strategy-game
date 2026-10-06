// The warnings about a country's money (systems/economy.js economyAlerts) and about its resources
// (systems/resources.js resourceAlerts), as paragraphs.

import { t, tn } from '../../util/i18n.js';
import { economyAlerts } from '../../systems/economy.js';
import { resourceAlerts } from '../../systems/resources.js';
import { h } from '../dom.js';
import { formatMonths, formatParams, formatPercent } from '../format.js';

/**
 * @param {any} state
 * @param {import('../../core/data.js').GameData} data
 * @param {string} countryId
 * @returns {HTMLElement[]}
 */
export function alertParagraphs(state, data, countryId) {
  return economyAlerts(state, data, countryId).map((alert) => {
    const params = formatParams(alert.params);
    const text = alert.id === 'runway' ? tn('alert.runway', alert.params.n, params) : t(`alert.${alert.id}`, params);
    return h('p', { class: 'alert', 'data-alert': alert.id }, text);
  });
}

/**
 * Warnings about the resources: a strait that stops some of the country's trade, a shortage the month
 * ahead brings, and a thin reserve.
 * @param {any} state
 * @param {import('../../core/data.js').GameData} data
 * @param {string} countryId
 * @param {{ only?: 'blockade' | 'supply' }} [options] `blockade`: only the closed straits (the report puts them with the money
 *   warnings, since they explain a loss of income); `supply`: only shortages and thin reserves (the report's resource block)
 * @returns {HTMLElement[]}
 */
export function resourceAlertParagraphs(state, data, countryId, { only } = {}) {
  return resourceAlerts(state, data, countryId)
    .filter((alert) => only === undefined || (alert.id === 'blockade') === (only === 'blockade'))
    .map((alert) => {
      if (alert.id === 'blockade') {
        const { strait, share, blockade } = alert.params;
        const params = { strait, percent: formatPercent(share, { decimals: 0 }), blockade: formatPercent(blockade, { decimals: 0 }) };
        return h('p', { class: 'alert', 'data-alert': 'blockade', 'data-blockade': alert.strait }, t(blockade >= 1 ? 'alert.blockade.closed' : 'alert.blockade.partly', params));
      }
      const params = alert.id === 'lowReserve' ? { ...alert.params, months: formatMonths(/** @type {number} */ (alert.params.months)) } : alert.params;
      return h('p', { class: 'alert', 'data-alert': alert.id, 'data-resource': alert.resource }, t(`alert.${alert.id}`, params));
    });
}
