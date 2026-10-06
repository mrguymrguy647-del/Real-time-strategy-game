// The warnings about a country's money (systems/economy.js economyAlerts) and about its resources
// (systems/resources.js resourceAlerts), as paragraphs.

import { t, tn } from '../../util/i18n.js';
import { economyAlerts } from '../../systems/economy.js';
import { resourceAlerts } from '../../systems/resources.js';
import { h } from '../dom.js';
import { formatMonths, formatParams } from '../format.js';

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
 * Warnings about the resources: a shortage the month ahead brings, and a thin reserve.
 * @param {any} state
 * @param {import('../../core/data.js').GameData} data
 * @param {string} countryId
 * @returns {HTMLElement[]}
 */
export function resourceAlertParagraphs(state, data, countryId) {
  return resourceAlerts(state, data, countryId).map((alert) => {
    const params = alert.id === 'lowReserve' ? { ...alert.params, months: formatMonths(/** @type {number} */ (alert.params.months)) } : alert.params;
    return h('p', { class: 'alert', 'data-alert': alert.id, 'data-resource': alert.resource }, t(`alert.${alert.id}`, params));
  });
}
