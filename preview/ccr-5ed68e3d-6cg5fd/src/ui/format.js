// Turning game values into text. Wording always comes from data/i18n/en.json (G-30).

import { t } from '../util/i18n.js';

/** @param {number} month 1-12 */
export function monthName(month) {
  return t(`month.${month}`);
}

/**
 * "January 2026", or "Week 2, March 2026" when the turn is a week.
 * @param {{ year: number, month: number, week?: number }} date
 * @param {boolean} [withWeek]
 */
export function formatDate(date, withWeek = false) {
  const month = monthName(date.month);
  return withWeek && date.week
    ? t('play.dateWeek', { week: date.week, month, year: date.year })
    : t('play.date', { month, year: date.year });
}

/**
 * "Autosave 2" or "Slot 1" for a slot id such as "auto-2" or "manual-1".
 * @param {string} slot
 */
export function slotLabel(slot) {
  const n = slot.split('-')[1];
  return slot.startsWith('auto') ? t('saves.slot.auto', { n }) : t('saves.slot.manual', { n });
}

/** @param {number} ms epoch milliseconds */
export function formatTimestamp(ms) {
  return new Date(ms).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
}

/** One decimal at most, none when it would be ".0": 85.3, 9.9, 114. @param {number} n */
const trimmed = (n) => String(Math.round(n * 10) / 10);

/**
 * "85.3 million" or "850 thousand".
 * @param {number} thousands population in thousands (G-25)
 */
export function formatPopulation(thousands) {
  return thousands >= 1000 ? t('units.population.million', { n: trimmed(thousands / 1000) }) : t('units.population.thousand', { n: Math.round(thousands) });
}

/**
 * "$1.3 trillion", "$430 billion" or "$800 million".
 * @param {number} billions an amount in USD billions (G-25)
 */
export function formatMoney(billions) {
  if (billions >= 1000) return t('units.money.trillion', { n: trimmed(billions / 1000) });
  if (billions >= 1) return t('units.money.billion', { n: Math.round(billions) });
  return t('units.money.million', { n: Math.round(billions * 1000) });
}

/**
 * "$15,200": GDP per person, rounded to the nearest hundred.
 * @param {number} gdpBn GDP in USD billions @param {number} thousands population in thousands
 */
export function formatPerPerson(gdpBn, thousands) {
  const dollars = (gdpBn * 1e9) / (thousands * 1e3);
  return t('units.money.plain', { n: (Math.round(dollars / 100) * 100).toLocaleString('en-US') });
}

/** The class that colors a signed amount: "pos", "neg", or none for about zero. @param {number} value */
export const toneOf = (value) => (value > 0.5 ? 'pos' : value < -0.5 ? 'neg' : '');

/** "+" or "−" (a real minus sign) for a number; nothing for zero. @param {number} n */
const signOf = (n) => (n > 0 ? '+' : n < 0 ? '\u2212' : '');

/**
 * A sum of money for the report: three significant digits at most, "$29.8 billion", "$152 billion",
 * "$1.31 trillion", "$850 million".
 * @param {number} millions an amount in USD millions (G-25)
 * @param {{ signed?: boolean }} [options] signed: "+$29.8 billion" / "−$1.2 billion"
 */
export function formatMoneyMn(millions, { signed = false } = {}) {
  const abs = Math.abs(millions);
  const sign = signed ? signOf(millions) : millions < 0 ? '\u2212' : '';
  if (abs >= 999_500) return sign + t('units.money.trillion', { n: trimmed2(abs / 1e6) });
  if (abs >= 1e5) return sign + t('units.money.billion', { n: Math.round(abs / 1e3) });
  if (abs >= 1e3) return sign + t('units.money.billion', { n: trimmed(abs / 1e3) });
  return sign + t('units.money.million', { n: Math.round(abs) });
}

/** Two decimals at most, none when they would be zero: 1.31, 1.3, 2. @param {number} n */
const trimmed2 = (n) => String(Math.round(n * 100) / 100);

/**
 * "27%" or "27.5%": a share, trimmed to one decimal.
 * @param {number} fraction 0.275 for 27.5%
 * @param {{ signed?: boolean, decimals?: number }} [options] signed adds + or −; decimals: 0, 1 (default) or 2
 */
export function formatPercent(fraction, { signed = false, decimals = 1 } = {}) {
  const scale = 10 ** decimals;
  const value = Math.round(fraction * 100 * scale) / scale;
  const sign = signed ? signOf(value) : value < 0 ? '\u2212' : '';
  return sign + t('units.percent', { n: Math.abs(value) });
}

/**
 * Params for a text template: a param named ...Mn is an amount of money in USD millions and is written
 * out ("$3.4 billion"); everything else is used as it is.
 * @param {Record<string, unknown> | undefined} params
 * @returns {Record<string, string | number>}
 */
export function formatParams(params) {
  /** @type {Record<string, string | number>} */
  const out = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    out[key] = key.endsWith('Mn') && typeof value === 'number' ? formatMoneyMn(value) : /** @type {string | number} */ (value);
  }
  return out;
}

/**
 * The text of a news entry or an alert: its template with its params.
 * @param {{ template: string, params?: Record<string, unknown> }} entry
 */
export function newsText(entry) {
  return t(entry.template, formatParams(entry.params));
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
