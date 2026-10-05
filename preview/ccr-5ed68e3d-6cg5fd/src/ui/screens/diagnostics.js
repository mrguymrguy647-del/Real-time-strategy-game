// Diagnostics: a health report for this device. It runs when opened, shows a status dot per check,
// and "Copy report" puts everything on the clipboard so it can be pasted into a chat.

import { t } from '../../util/i18n.js';
import { buildReport, createChecks } from '../diagnostics/collect.js';
import { h } from '../dom.js';
import { copyText } from '../files.js';

const GROUPS = ['app', 'offline', 'storage', 'performance', 'graphics'];

/** @param {any} ctx */
export function mountDiagnostics(ctx) {
  const checks = createChecks(ctx);
  /** @type {Map<string, { check: any, row: HTMLElement, result: { value: string, status: string } | null }>} */
  const rows = new Map();
  let destroyed = false;

  const copyButton = h('button', { class: 'btn btn--primary btn--block', type: 'button', disabled: true }, t('diag.copyReport'));
  const stage = h('div', { class: 'bench-stage', 'data-bench-stage': '' });
  const overlay = h('div', { class: 'bench-overlay', hidden: true }, h('p', { class: 'bench-overlay__label' }, t('diag.mapBench.running')), stage);

  /** @param {string} id @param {{ value: string, status: string }} result */
  function show(id, result) {
    const entry = rows.get(id);
    if (!entry || destroyed) return;
    entry.result = result;
    entry.row.dataset.status = result.status;
    entry.row.querySelector('.dot')?.setAttribute('class', `dot dot--${result.status}`);
    entry.row.querySelector('[data-value]')?.replaceChildren(result.value);
  }

  /** @param {any} check */
  async function runCheck(check) {
    show(check.id, { value: t('diag.checking'), status: 'info' });
    try {
      show(check.id, await check.run());
    } catch (err) {
      show(check.id, { status: 'fail', value: err instanceof Error ? err.message : String(err) });
    }
  }

  async function runBenchmark(/** @type {any} */ check) {
    overlay.hidden = false;
    try {
      await runCheck(check);
    } finally {
      overlay.hidden = true;
    }
  }

  const sections = GROUPS.map((group) => {
    const body = h('div', { class: 'card diag-group' });
    for (const check of checks.filter((c) => c.group === group)) {
      const value = h('div', { class: 'diag__value', 'data-value': '' }, t('diag.checking'));
      const row = h(
        'div',
        { class: 'diag', 'data-check': check.id, 'data-status': 'info' },
        h('span', { class: 'dot dot--info' }),
        h('div', { class: 'diag__text' }, h('div', { class: 'diag__label' }, check.label()), value, check.manual && h('button', { class: 'btn btn--small', type: 'button', onclick: () => runBenchmark(check) }, t('diag.mapBench.run'))),
      );
      rows.set(check.id, { check, row, result: null });
      body.append(row);
    }
    return h('section', null, h('h2', null, t(`diag.group.${group}`)), body);
  });

  async function runAll() {
    for (const check of checks) {
      if (destroyed) return;
      if (check.manual) {
        show(check.id, { value: t('diag.mapBench.idle'), status: 'info' });
        continue;
      }
      await runCheck(check);
    }
    if (!destroyed) copyButton.disabled = false;
  }

  copyButton.addEventListener('click', async () => {
    const report = buildReport(
      [...rows.values()].map(({ check, result }) => ({ label: check.label(), value: result?.value ?? '', status: /** @type {any} */ (result?.status ?? 'info') })),
    );
    ctx.toast((await copyText(report)) ? t('diag.reportCopied') : t('common.copyFailed'));
  });

  void runAll();

  const el = h(
    'section',
    { class: 'screen' },
    h('header', { class: 'topbar' }, h('button', { class: 'btn btn--ghost btn--small', type: 'button', onclick: () => ctx.back() }, t('common.back')), h('h1', null, t('diag.title'))),
    h('p', { class: 'muted' }, t('diag.intro')),
    copyButton,
    ...sections,
    overlay,
  );

  return {
    el,
    destroy() {
      destroyed = true;
    },
  };
}
