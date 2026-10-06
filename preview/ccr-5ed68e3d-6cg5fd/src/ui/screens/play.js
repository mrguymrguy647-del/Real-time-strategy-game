// The game screen (M1.1b): the map with the player's country marked, a status strip (country, date,
// treasury) and an action bar (Menu, Budget, Report, End turn). Taps on the map open a country's
// panel; End turn runs the month and opens the report. Everything the player changes goes through
// game.dispatch or game.endTurn; this file never touches the state itself.

import { t } from '../../util/i18n.js';
import { copyText } from '../files.js';
import { h } from '../dom.js';
import { liveEconomy } from '../economyView.js';
import { formatDate, formatMoneyMn, toneOf } from '../format.js';
import { createMapStage } from '../components/mapStage.js';
import { createBudgetPanel } from '../panels/budgetPanel.js';
import { createCountryPanel } from '../panels/countryPanel.js';
import { createReportPanel } from '../panels/reportPanel.js';

/** @param {any} ctx */
export function mountPlay(ctx) {
  const game = ctx.session.game;
  const playerId = game.state.player.countryId;
  const country = ctx.data.countries.byId[playerId];
  /** Which panel is open: the tapped country's, the report, the budget, or none. @type {'info' | 'report' | 'budget' | null} */
  let active = null;

  // ---- the status strip -------------------------------------------------------------------------
  const dateEl = h('span', { class: 'play-hud__date' });
  const treasuryEl = h('span', { class: 'play-hud__treasury' });
  const changeEl = h('span', { class: 'play-hud__change' });
  const hud = h(
    'header',
    { class: 'play-hud', 'aria-live': 'polite' },
    h('div', { class: 'play-hud__row' }, h('strong', { class: 'play-hud__name' }, country.name), dateEl),
    h('div', { class: 'play-hud__row' }, treasuryEl, changeEl),
  );

  function renderHud() {
    const { clock, countries } = game.state;
    dateEl.textContent = formatDate(clock, clock.scale === 'week');
    const { treasuryMn, last } = countries[playerId].economy;
    treasuryEl.textContent = t('play.treasury', { amount: formatMoneyMn(treasuryMn) });
    const change = last ? last.balanceMn - last.repaidMn + last.borrowedMn : 0;
    changeEl.textContent = last ? formatMoneyMn(change, { signed: true }) : '';
    changeEl.className = `play-hud__change ${toneOf(change)}`;
  }

  // ---- panels ------------------------------------------------------------------------------------
  const info = createCountryPanel({
    data: ctx.data,
    colorOf: (id) => stage.colorOf(id),
    worldName: (id) => stage.worldName(id),
    onRegion: (regionId) => stage.view?.select(regionId),
    onClose: () => stage.view?.select(null),
    economyOf: (id) => liveEconomy(game.state, id),
    actionsFor: (id) => (id === playerId ? h('button', { class: 'btn btn--block sheet__play', type: 'button', onclick: () => openSheet('budget') }, t('play.openBudget')) : null),
  });
  const report = createReportPanel({ game, countryId: playerId, onClose: () => openSheet(null) });
  const budget = createBudgetPanel({ game, countryId: playerId, onClose: () => openSheet(null) });

  /** Show exactly one panel (or none), and let the buttons say which one is open. @param {'info' | 'report' | 'budget' | null} name */
  function showOnly(name) {
    active = name;
    if (name === 'report') report.show();
    else report.hide();
    if (name === 'budget') budget.show();
    else budget.hide();
    if (name !== 'info') info.hide();
    reportButton.setAttribute('aria-pressed', String(name === 'report'));
    budgetButton.setAttribute('aria-pressed', String(name === 'budget'));
    stage.measure();
  }

  /** Open the report or the budget (or close what is open). @param {'report' | 'budget' | null} name */
  function openSheet(name) {
    if (name) {
      stage.hideHint(); // whoever opens the budget or the report is past the first-turn hint
      stage.view?.select(null); // the map's own selection would otherwise be hidden but still there
    }
    showOnly(name);
  }

  /** @param {'report' | 'budget'} name */
  const toggle = (name) => openSheet(active === name ? null : name);

  // ---- turns and the menu -------------------------------------------------------------------------
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
    renderHud();
    if (!result.ok) {
      void showTurnFailed(result.error);
      return;
    }
    openSheet('report'); // the month's report, ready to read
  }

  async function openMenu() {
    const choice = await ctx.dialog({
      title: t('play.menu.title'),
      actions: [
        { label: t('play.menu.save'), value: 'save' },
        { label: t('play.menu.saves'), value: 'saves' },
        { label: t('play.menu.settings'), value: 'settings' },
        { label: t('play.menu.diagnostics'), value: 'diagnostics' },
        { label: t('play.menu.quit'), value: 'quit', kind: 'danger' },
        { label: t('common.close'), value: 'close', kind: 'ghost' },
      ],
    });
    if (choice === 'save') {
      void ctx.quickSave();
    } else if (choice === 'quit') {
      const sure = await ctx.confirm({ title: t('play.quit.title'), body: t('play.quit.body'), confirmLabel: t('play.quit.confirm'), cancelLabel: t('common.cancel'), danger: true });
      if (sure) ctx.quitToTitle();
    } else if (choice && choice !== 'close') {
      ctx.navigate(choice);
    }
  }

  // ---- the screen ---------------------------------------------------------------------------------
  const budgetButton = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', onclick: () => toggle('budget') }, t('play.budget'));
  const reportButton = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', onclick: () => toggle('report') }, t('play.report'));
  const bar = h(
    'div',
    { class: 'actionbar actionbar--game' },
    h('button', { class: 'btn', type: 'button', onclick: openMenu }, t('play.menu')),
    budgetButton,
    reportButton,
    h('button', { class: 'btn btn--primary', type: 'button', onclick: endTurn }, t('play.endTurn')),
  );

  const stage = createMapStage({
    ctx,
    bar,
    hint: t('play.hint'),
    onSelect: (selection) => {
      if (selection.countryId) {
        showOnly('info'); // a tapped country takes the place of the report or the budget
        info.show(selection);
      } else if (active === 'info') {
        showOnly(null);
      }
    },
    onReady: (view) => {
      view.setOwn(playerId);
      view.focusCountry(playerId);
    },
  });
  stage.area.append(hud, info.el, report.el, budget.el);
  stage.watch({ chrome: [hud], sheets: [info.el, report.el, budget.el] });

  renderHud();
  const unsubscribe = [
    game.bus.on('turn:end', () => {
      renderHud();
      info.refresh();
      if (active === 'budget') budget.render();
    }),
    game.bus.on('state:restored', () => {
      renderHud();
      report.render();
      budget.render();
    }),
    game.bus.on('command', () => {
      if (active === 'budget') budget.render();
      info.refresh();
    }),
  ];

  return {
    el: stage.el,
    destroy() {
      for (const off of unsubscribe) off();
      budget.destroy(); // a held button must not keep ordering things from a screen that is gone
      stage.destroy();
    },
  };
}
