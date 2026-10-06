// Words for a country's resource position, shared by the country panel, the report and the resources
// panel. The sentences are in data/i18n/en.json (G-30).

import { t } from '../util/i18n.js';
import { coverMonths } from '../formulas/market.js';
import { formatMonths, formatUnits } from './format.js';

/** A quantity this small is not worth a word (the same cut as formatUnits). */
const NEGLIGIBLE = 0.005;

/**
 * Whether a country sells, buys or just makes what it uses: "Sells 16.5 a month". When a closed strait
 * stops some of it, what is really sold or bought comes first and what is stopped after it ("Cannot sell:
 * 6.1 a month stays at home"), so the line never promises trade that cannot happen.
 * @param {{ production: number, consumption: number, exports?: number, imports?: number, blockedExports?: number, blockedImports?: number }} line
 *   the last four are optional: a line without them is a country at peace (the start of a scenario)
 */
export function positionText(line) {
  const net = line.production - line.consumption;
  if (net >= NEGLIGIBLE) {
    const stuck = line.blockedExports ?? 0;
    if (stuck < NEGLIGIBLE) return t('res.position.sells', { amount: formatUnits(net) });
    const sold = line.exports ?? 0;
    return sold < NEGLIGIBLE ? t('res.position.cannotSell', { stuck: formatUnits(stuck) }) : t('res.position.sellsSome', { amount: formatUnits(sold), stuck: formatUnits(stuck) });
  }
  if (net <= -NEGLIGIBLE) {
    const missing = line.blockedImports ?? 0;
    if (missing < NEGLIGIBLE) return t('res.position.buys', { amount: formatUnits(-net) });
    const bought = line.imports ?? 0;
    return bought < NEGLIGIBLE ? t('res.position.cannotBuy', { missing: formatUnits(missing) }) : t('res.position.buysSome', { amount: formatUnits(bought), missing: formatUnits(missing) });
  }
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
