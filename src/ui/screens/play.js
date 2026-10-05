// The Phase 0b test game: a calendar, a seeded dice roll and a news list, so that turns, saving,
// loading and determinism can be tried on a phone. Phase 1 replaces this with the real map.

import { t } from '../../util/i18n.js';
import { copyText } from '../files.js';
import { h } from '../dom.js';
import { formatDate, monthName } from '../format.js';

const EVENTS_SHOWN = 6;

/** @param {any} ctx */
export function mountPlay(ctx) {
  const game = ctx.session.game;

  const dateEl = h('div', { class: 'play__date' });
  const metaEl = h('div', { class: 'muted' });
  const rollEl = h('div', { class: 'play__roll' });
  const eventsEl = h('ul', { class: 'events' });

  function render() {
    const { clock, demo, news, meta } = game.state;
    dateEl.textContent = formatDate(clock, clock.scale === 'week');
    metaEl.textContent = `${t('play.turn', { n: clock.turn })} · ${t('play.seed', { seed: meta.seed })}`;
    rollEl.textContent = demo.lastRoll === null ? t('play.rollNone') : t('play.roll', { n: demo.lastRoll });
    const recent = news.slice(-EVENTS_SHOWN).reverse();
    eventsEl.replaceChildren(
      ...(recent.length === 0
        ? [h('li', { class: 'muted' }, t('play.events.empty'))]
        : recent.map((/** @type {any} */ entry) =>
            h('li', null, h('span', { class: 'muted' }, `${monthName(entry.month)} ${entry.year}`), ' ', t(entry.template, entry.params)),
          )),
    );
  }

  /** @param {{ system?: string, message: string, stack?: string }} error */
  async function showTurnFailed(error) {
    const details = [`system: ${error.system ?? '?'}`, `message: ${error.message}`, error.stack ?? ''].join('\n');
    const choice = await ctx.dialog({
      title: t('play.turnFailed.title'),
      body: t('play.turnFailed.body'),
      content: h('textarea', { class: 'dialog__details', readOnly: true, rows: 6, value: details }),
      actions: [
        { label: t('play.turnFailed.copy'), value: 'copy', kind: 'primary' },
        { label: t('common.close'), value: 'close', kind: 'ghost' },
      ],
    });
    if (choice === 'copy') ctx.toast((await copyText(details)) ? t('common.copied') : t('common.copyFailed'));
  }

  function endTurn() {
    const result = game.endTurn();
    if (!result.ok) void showTurnFailed(result.error);
    render();
  }

  async function openMenu() {
    const choice = await ctx.dialog({
      title: t('play.menu.title'),
      actions: [
        { label: t('play.menu.saves'), value: 'saves' },
        { label: t('play.menu.settings'), value: 'settings' },
        { label: t('play.menu.diagnostics'), value: 'diagnostics' },
        { label: t('play.menu.quit'), value: 'quit', kind: 'danger' },
        { label: t('common.close'), value: 'close', kind: 'ghost' },
      ],
    });
    if (choice === 'quit') {
      const sure = await ctx.confirm({
        title: t('play.quit.title'),
        body: t('play.quit.body'),
        confirmLabel: t('play.quit.confirm'),
        cancelLabel: t('common.cancel'),
        danger: true,
      });
      if (sure) ctx.quitToTitle();
    } else if (choice && choice !== 'close') {
      ctx.navigate(choice);
    }
  }

  const unsubscribe = [game.bus.on('turn:end', render), game.bus.on('state:restored', render)];
  render();

  const el = h(
    'section',
    { class: 'screen play' },
    h('header', { class: 'play__top card' }, dateEl, metaEl, rollEl),
    h('div', { class: 'card play__explain' }, h('h2', null, t('play.heading')), h('p', { class: 'muted' }, t('play.explain'))),
    h('div', { class: 'card play__events' }, h('h2', null, t('play.events.title')), eventsEl),
    h(
      'div',
      { class: 'actionbar' },
      h('button', { class: 'btn', type: 'button', onclick: openMenu }, t('play.menu')),
      h('button', { class: 'btn', type: 'button', onclick: () => ctx.quickSave() }, t('play.save')),
      h('button', { class: 'btn btn--primary actionbar__main', type: 'button', onclick: endTurn }, t('play.endTurn')),
    ),
  );

  return {
    el,
    destroy() {
      for (const off of unsubscribe) off();
    },
  };
}
