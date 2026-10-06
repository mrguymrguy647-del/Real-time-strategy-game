// The warnings about a country's money (systems/economy.js economyAlerts), as paragraphs.

import { t, tn } from '../../util/i18n.js';
import { economyAlerts } from '../../systems/economy.js';
import { h } from '../dom.js';
import { formatParams } from '../format.js';

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
