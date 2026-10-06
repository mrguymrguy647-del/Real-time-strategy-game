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

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
