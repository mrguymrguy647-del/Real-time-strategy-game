// Words for a country's resource position, shared by the country panel, the report and the resources
// panel. The sentences are in data/i18n/en.json (G-30).

import { t } from '../util/i18n.js';
import { coverMonths } from '../formulas/market.js';
import { formatMonths, formatUnits } from './format.js';

/**
 * Whether a country sells, buys or just makes what it uses: "Sells 16.5 a month".
 * @param {{ production: number, consumption: number }} line
 */
export function positionText(line) {
  const net = line.production - line.consumption;
  if (net >= 0.005) return t('res.position.sells', { amount: formatUnits(net) });
  if (net <= -0.005) return t('res.position.buys', { amount: formatUnits(-net) });
  return t('res.position.balanced');
}

/**
 * How long the reserve lasts if trade stopped: "lasts 3.1 months", or nothing to say for a country that
 * makes all it uses.
 * @param {{ production: number, consumption: number, stock: number }} line
 * @param {{ short?: boolean }} [options] short: "lasts 3 months if trade stops", for where "Reserve" is already said
 * @returns {string | null}
 */
export function lastsText(line, { short = false } = {}) {
  const months = coverMonths(line);
  return Number.isFinite(months) ? t(short ? 'res.lasts.short' : 'res.lasts', { months: formatMonths(months) }) : null;
}
