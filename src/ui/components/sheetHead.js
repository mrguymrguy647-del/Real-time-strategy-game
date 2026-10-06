// The top row of a sheet (the panel that slides over the map): an optional color swatch, a title, a
// small line under it, and the close button.

import { t } from '../../util/i18n.js';
import { h } from '../dom.js';

/**
 * @param {{ title: string, subtitle?: string, color?: string, onClose: () => void }} options
 */
export function sheetHead({ title, subtitle, color, onClose }) {
  return h(
    'header',
    { class: 'sheet__head' },
    color ? h('span', { class: 'sheet__swatch', style: `background:${color}` }) : null,
    h('div', { class: 'sheet__heading' }, h('h2', { class: 'sheet__title' }, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
    h('button', { class: 'btn btn--ghost btn--small sheet__close', type: 'button', 'aria-label': t('common.close'), onclick: onClose }, '×'),
  );
}
