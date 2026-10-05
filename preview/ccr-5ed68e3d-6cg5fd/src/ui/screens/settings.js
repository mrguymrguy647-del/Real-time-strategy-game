// Settings: text size, checking for a new version, and erasing saves.

import { t } from '../../util/i18n.js';
import { h } from '../dom.js';
import { saveErrorText } from '../errors.js';
import { TEXT_SCALES, applySettings } from '../settings.js';

/** @param {any} ctx */
export function mountSettings(ctx) {
  const sizes = h('div', { class: 'segmented', role: 'group', 'aria-label': t('settings.textSize.title') });

  function renderSizes() {
    const current = ctx.settings.get('textScale');
    sizes.replaceChildren(
      ...TEXT_SCALES.map(({ key, value }) =>
        h(
          'button',
          {
            class: `btn segmented__btn${value === current ? ' is-active' : ''}`,
            type: 'button',
            'aria-pressed': String(value === current),
            onclick: async () => {
              const saved = await ctx.settings.set('textScale', value);
              applySettings(ctx.settings.all());
              if (!saved) ctx.toast(t('settings.notSaved'));
              renderSizes();
            },
          },
          t(`settings.textSize.${key}`),
        ),
      ),
    );
  }
  renderSizes();

  const updateStatus = h('p', { class: 'muted', role: 'status' });
  async function checkUpdates() {
    updateStatus.textContent = t('settings.updates.checking');
    const result = await ctx.pwa.checkForUpdates();
    updateStatus.textContent = {
      unsupported: t('settings.updates.unsupported'),
      error: t('settings.updates.error'),
      ready: t('settings.updates.ready'),
      installing: t('settings.updates.installing'),
      current: t('settings.updates.current'),
    }[result];
  }

  async function eraseSaves() {
    const sure = await ctx.confirm({
      title: t('settings.erase.confirmTitle'),
      body: t('settings.erase.confirmBody'),
      confirmLabel: t('settings.erase.button'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!sure) return;
    try {
      await ctx.saves.clearAll();
      ctx.toast(t('settings.erase.done'));
    } catch (err) {
      ctx.toast(saveErrorText(err), { duration: 7000 });
    }
  }

  const el = h(
    'section',
    { class: 'screen' },
    h('header', { class: 'topbar' }, h('button', { class: 'btn btn--ghost btn--small', type: 'button', onclick: () => ctx.back() }, t('common.back')), h('h1', null, t('settings.title'))),
    h('div', { class: 'card stack' }, h('h2', null, t('settings.textSize.title')), sizes, h('p', { class: 'muted' }, t('settings.textSize.sample'))),
    h(
      'div',
      { class: 'card stack' },
      h('h2', null, t('settings.updates.title')),
      ...(ctx.platform.singleFile
        ? [h('p', { class: 'muted' }, t('settings.updates.file'))]
        : [h('button', { class: 'btn btn--block', type: 'button', onclick: checkUpdates }, t('settings.updates.check')), updateStatus]),
    ),
    h('div', { class: 'card stack' }, h('h2', null, t('settings.erase.title')), h('p', { class: 'muted' }, t('settings.erase.body')), h('button', { class: 'btn btn--danger btn--block', type: 'button', onclick: eraseSaves }, t('settings.erase.button'))),
  );
  return { el };
}
