// UI settings and how they are applied. The values themselves live in the "settings" store
// (core/settings.js).

export const SETTING_DEFAULTS = { textScale: 1 };

/** The text sizes offered on the Settings screen. `key` picks the "settings.textSize.<key>" label. */
export const TEXT_SCALES = [
  { key: 'small', value: 0.9 },
  { key: 'normal', value: 1 },
  { key: 'large', value: 1.15 },
  { key: 'xlarge', value: 1.3 },
];

/** @param {{ textScale: number }} values */
export function applySettings(values) {
  const scale = TEXT_SCALES.some((s) => s.value === values.textScale) ? values.textScale : 1;
  document.documentElement.style.fontSize = `${16 * scale}px`;
}
