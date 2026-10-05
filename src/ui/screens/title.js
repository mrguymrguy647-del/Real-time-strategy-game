// The title screen: Continue (when a save exists), New test game, Saves, Settings, Diagnostics,
// plus notices about installing, offline readiness, updates and unavailable storage.

import { t } from '../../util/i18n.js';
import { assetUrl } from '../assets.js';
import { h } from '../dom.js';
import { formatDate } from '../format.js';

/** @param {any} ctx */
export function mountTitle(ctx) {
  let destroyed = false;
  const menu = h('nav', { class: 'stack' });
  const notices = h('div', { class: 'stack' });

  /** @param {string} label @param {() => void} onclick @param {string} [kind] */
  const button = (label, onclick, kind = '') =>
    h('button', { class: `btn btn--block ${kind}`.trim(), type: 'button', onclick }, label);

  menu.append(
    button(t('title.newGame'), () => ctx.newGame(), ctx.session.game ? '' : 'btn--primary'),
    button(t('title.saves'), () => ctx.navigate('saves')),
    button(t('title.settings'), () => ctx.navigate('settings')),
    button(t('title.diagnostics'), () => ctx.navigate('diagnostics')),
  );

  // "Continue" appears once we know there is a save; it never blocks the rest of the screen.
  ctx.saves
    .list()
    .then((/** @type {any[]} */ list) => {
      if (destroyed || list.length === 0) return;
      const newest = list[0];
      menu.prepend(
        h(
          'button',
          { class: 'btn btn--primary btn--block btn--two-line', type: 'button', onclick: () => ctx.continueLatest() },
          h('span', null, t('title.continue')),
          h('small', null, t('title.continueSub', { date: formatDate(newest.meta), turn: newest.meta.turn })),
        ),
      );
      menu.querySelector('.btn--primary:not(.btn--two-line)')?.classList.remove('btn--primary');
    })
    .catch(() => {});

  /** @param {'ok' | 'warn' | 'info'} kind @param {string} text */
  const notice = (kind, text) => h('p', { class: `notice notice--${kind}` }, text);

  function renderNotices() {
    const pwa = ctx.pwa.getState();
    const items = [];
    if (ctx.storageKind === 'memory') items.push(notice('warn', t('title.storageMemory')));
    if (pwa.updateReady) {
      items.push(
        h(
          'div',
          { class: 'notice notice--accent row' },
          h('span', null, t('update.ready')),
          h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.pwa.applyUpdate() }, t('update.reload')),
        ),
      );
    }
    if (ctx.platform.singleFile) {
      items.push(notice('info', t('title.singleFile')));
    } else if (ctx.platform.standalone) {
      items.push(notice('info', t('title.installed')));
    } else if (ctx.platform.ios) {
      items.push(h('div', { class: 'notice' }, h('strong', null, t('title.install.title')), h('p', { class: 'muted' }, t('title.install.ios'))));
    } else if (pwa.canInstall) {
      items.push(
        h(
          'div',
          { class: 'notice row' },
          h('span', null, t('title.install.title')),
          h('button', { class: 'btn btn--small btn--primary', type: 'button', onclick: () => ctx.pwa.promptInstall() }, t('title.install.button')),
        ),
      );
    }
    const offline = ctx.platform.singleFile
      ? ['ok', t('title.offline.file')]
      : !pwa.supported
        ? ['fail', t('title.offline.unsupported')]
        : pwa.controlled
          ? ['ok', t('title.offline.ready')]
          : ['warn', t('title.offline.pending')];
    items.push(h('p', { class: 'status-line', 'data-offline': offline[0] }, h('span', { class: `dot dot--${offline[0]}` }), offline[1]));
    notices.replaceChildren(...items);
  }

  renderNotices();
  const unsubscribe = ctx.pwa.subscribe(renderNotices);

  const build = ctx.buildInfo?.hash ?? t('common.unknown');
  const el = h(
    'section',
    { class: 'screen title' },
    h(
      'header',
      { class: 'title__hero' },
      h('img', { class: 'title__logo', src: assetUrl('assets/icons/icon.svg'), alt: '', width: 96, height: 96 }),
      h('div', null, h('h1', null, t('app.title')), h('p', { class: 'muted' }, t('app.tagline'))),
    ),
    h('div', { class: 'title__body' }, menu, notices),
    h('footer', { class: 'muted title__footer' }, t('app.phaseNote'), ' ', t('title.build', { build })),
  );

  return {
    el,
    destroy() {
      destroyed = true;
      unsubscribe();
    },
  };
}
