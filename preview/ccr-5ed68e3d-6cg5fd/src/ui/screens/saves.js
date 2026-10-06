// Save slots: load, save here, export, delete, and import a save file. Autosave slots are managed
// by the game itself; only the manual slots can be written by hand.

import { AUTO_SLOTS, MANUAL_SLOTS } from '../../core/save.js';
import { t } from '../../util/i18n.js';
import { h } from '../dom.js';
import { saveErrorText } from '../errors.js';
import { deliverFile, pickFile } from '../files.js';
import { formatDate, formatTimestamp, slotLabel } from '../format.js';

/** @param {any} ctx */
export function mountSaves(ctx) {
  const list = h('div', { class: 'stack' });
  let destroyed = false;

  /** @param {unknown} err */
  const fail = (err) => ctx.toast(saveErrorText(err), { duration: 7000 });

  /** @param {string} slot */
  async function load(slot) {
    try {
      const loaded = await ctx.saves.load(slot);
      if (loaded.dataMismatch) ctx.toast(t('saves.dataMismatch'), { duration: 7000 });
      ctx.toast(t('saves.loaded', { slot: slotLabel(slot) }));
      ctx.openState(loaded.state);
    } catch (err) {
      fail(err);
    }
  }

  /** @param {string} slot */
  async function saveHere(slot) {
    try {
      await ctx.saves.save(slot, ctx.session.game.state);
      ctx.session.lastManualSlot = slot;
      ctx.toast(t('play.saved', { slot: slotLabel(slot) }));
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  /** @param {string} slot */
  async function exportSlot(slot) {
    try {
      const outcome = await deliverFile(await ctx.saves.exportSlot(slot));
      if (outcome === 'shared') ctx.toast(t('saves.exported.shared'));
      else if (outcome === 'downloaded') ctx.toast(t('saves.exported.downloaded'));
    } catch (err) {
      fail(err);
    }
  }

  /** @param {string} slot */
  async function remove(slot) {
    const sure = await ctx.confirm({
      title: t('saves.delete.title', { slot: slotLabel(slot) }),
      body: t('saves.delete.body'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!sure) return;
    try {
      await ctx.saves.remove(slot);
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function importFile() {
    const file = await pickFile();
    if (!file) return;
    const summaries = await ctx.saves.list().catch(() => []);
    const taken = new Map(summaries.map((/** @type {any} */ s) => [s.slot, s]));
    const slot = await ctx.dialog({
      title: t('saves.import.title'),
      body: t('saves.import.body'),
      actions: [
        ...MANUAL_SLOTS.map((candidate) => {
          const existing = /** @type {any} */ (taken.get(candidate));
          const label = existing ? t('saves.import.replace', { slot: slotLabel(candidate), turn: existing.meta.turn }) : t('saves.import.empty', { slot: slotLabel(candidate) });
          return { label, value: candidate, kind: existing ? 'ghost' : 'primary' };
        }),
        { label: t('common.cancel'), value: null, kind: 'ghost' },
      ],
    });
    if (!slot) return;
    try {
      const { dataMismatch } = await ctx.saves.importBytes(new Uint8Array(await file.arrayBuffer()), slot);
      ctx.toast(t('saves.imported', { slot: slotLabel(slot) }));
      if (dataMismatch) ctx.toast(t('saves.dataMismatch'), { duration: 7000 });
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  /** @param {string} slot @param {any} [summary] */
  function row(slot, summary) {
    const isManual = slot.startsWith('manual');
    const small = (/** @type {string} */ label, /** @type {() => void} */ onclick, kind = '') =>
      h('button', { class: `btn btn--small ${kind}`.trim(), type: 'button', onclick }, label);
    return h(
      'article',
      { class: 'card slot', 'data-slot': slot },
      h('div', { class: 'row' }, h('strong', null, slotLabel(slot)), h('span', { class: 'muted' }, summary ? t('saves.summary', { country: ctx.data.countries.byId[summary.meta.countryId]?.name ?? t('common.unknown'), date: formatDate(summary.meta), turn: summary.meta.turn }) : t('saves.empty'))),
      summary && h('div', { class: 'muted slot__time' }, t('saves.savedAt', { time: formatTimestamp(summary.savedAt) })),
      h(
        'div',
        { class: 'slot__actions' },
        summary && small(t('common.load'), () => load(slot), 'btn--primary'),
        isManual && ctx.session.game && small(t('saves.saveHere'), () => saveHere(slot)),
        summary && small(t('common.export'), () => exportSlot(slot)),
        summary && small(t('common.delete'), () => remove(slot), 'btn--danger'),
      ),
    );
  }

  async function refresh() {
    let summaries;
    try {
      summaries = await ctx.saves.list();
    } catch (err) {
      if (!destroyed) list.replaceChildren(h('p', { class: 'notice notice--warn' }, saveErrorText(err)));
      return;
    }
    if (destroyed) return;
    const bySlot = new Map(summaries.map((/** @type {any} */ s) => [s.slot, s]));
    list.replaceChildren(
      h('h2', null, t('saves.autosaves')),
      ...AUTO_SLOTS.map((slot) => row(slot, bySlot.get(slot))),
      h('h2', null, t('saves.manualSaves')),
      ...MANUAL_SLOTS.map((slot) => row(slot, bySlot.get(slot))),
    );
  }

  void refresh();

  const el = h(
    'section',
    { class: 'screen' },
    h('header', { class: 'topbar' }, h('button', { class: 'btn btn--ghost btn--small', type: 'button', onclick: () => ctx.back() }, t('common.back')), h('h1', null, t('saves.title'))),
    ctx.storageKind === 'memory' && h('p', { class: 'notice notice--warn' }, t('title.storageMemory')),
    h('button', { class: 'btn btn--block', type: 'button', onclick: importFile }, t('saves.import.button')),
    list,
  );

  return {
    el,
    destroy() {
      destroyed = true;
    },
  };
}
