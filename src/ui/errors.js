// Player-facing text for save errors. Every SaveError code has a "saves.error.<code>" string.

import { SaveError } from '../core/errors.js';
import { hasKey, t } from '../util/i18n.js';

/** @param {unknown} err */
export function saveErrorText(err) {
  const code = err instanceof SaveError ? err.code : 'generic';
  const key = `saves.error.${code}`;
  return hasKey(key) ? t(key) : t('saves.error.generic');
}
