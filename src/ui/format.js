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

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
