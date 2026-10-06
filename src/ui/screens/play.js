// The game screen (M1.1b, M1.2): the map with the player's country marked, a status strip (country, date,
// treasury, and how each resource stands) and an action bar (Menu, Budget, Resources, Report, End turn).
// Taps on the map open a country's panel; End turn runs the month and opens the report. Everything the
// player changes goes through game.dispatch or game.endTurn; this file never touches the state itself.

import { t } from '../../util/i18n.js';
import { copyText } from '../files.js';
import { h } from '../dom.js';
import { liveEconomy } from '../economyView.js';
import { formatDate, formatMoneyMn, formatMonths, toneOf } from '../format.js';
import { liveResources } from '../resourcesView.js';
import { coverMonths } from '../../formulas/market.js';
import { countryFlows } from '../../systems/resourceFlows.js';
import { resourceAlerts } from '../../systems/resources.js';
import { captureNode } from '../components/captureEstimate.js';
import { createMapStage } from '../components/mapStage.js';
import { createBudgetPanel } from '../panels/budgetPanel.js';
import { createCountryPanel } from '../panels/countryPanel.js';
import { createReportPanel } from '../panels/reportPanel.js';
import { createResourcesPanel } from '../panels/resourcesPanel.js';

/** @param {any} ctx */
export function mountPlay(ctx) {
  const game = ctx.session.game;
  const playerId = game.state.player.countryId;
  const country = ctx.data.countries.byId[playerId];
  /** Which panel is open: the tapped country's, the report, the budget, the resources, or none. @type {'info' | 'report' | 'budget' | 'resources' | null} */
  let active = null;

  // ---- the status strip -------------------------------------------------------------------------
  const dateEl = h('span', { class: 'play-hud__date' });
  const treasuryEl = h('span', { class: 'play-hud__treasury' });
  const changeEl = h('span', { class: 'play-hud__change' });
  // how each resource stands, one chip each (the Resources button opens the details)
  const chipsEl = h('div', { class: 'play-hud__chips', role: 'group', 'aria-label': t('play.resourcesStrip') });
  const hud = h(
    'header',
    { class: 'play-hud', 'aria-live': 'polite' },
    h('div', { class: 'play-hud__row' }, h('strong', { class: 'play-hud__name' }, country.name), dateEl),
    h('div', { class: 'play-hud__row' }, treasuryEl, changeEl),
    chipsEl,
  );

  /** One chip per resource: its icon and how long the reserve lasts if trade stops ("ok" when nothing can run short). */
  function renderChips() {
    const { state } = game;
    const flows = countryFlows(state, ctx.data, playerId).byResource;
    /** @type {Map<string, string>} */
    const alerts = new Map();
    for (const alert of resourceAlerts(state, ctx.data, playerId)) if (alert.id !== 'blockade') alerts.set(alert.resource, alert.id);
    chipsEl.replaceChildren(
      ...ctx.data.activeResources.map((/** @type {any} */ resource) => {
        const flow = flows[resource.id];
        const alert = alerts.get(resource.id);
        const months = coverMonths({ production: flow.production, consumption: flow.consumption, stock: state.countries[playerId].resources[resource.id].stock });
        const text = alert === 'shortage' ? t('res.chip.short') : Number.isFinite(months) ? formatMonths(months).replace(/ months?$/, '') + ' ' + t('res.chip.mo') : t('res.chip.ok');
        return h('span', { class: `chip-res${alert === 'shortage' ? ' is-short' : alert === 'lowReserve' ? ' is-low' : ''}`, 'data-resource': resource.id }, h('span', { 'aria-hidden': 'true' }, resource.icon), ' ', text);
      }),
    );
  }

  function renderHud() {
    const { clock, countries } = game.state;
    dateEl.textContent = formatDate(clock, clock.scale === 'week');
    const { treasuryMn, last } = countries[playerId].economy;
    treasuryEl.textContent = t('play.treasury', { amount: formatMoneyMn(treasuryMn, { precise: true }) });
    const change = last ? last.balanceMn + last.borrowedMn : 0; // what the last month did to the treasury
    changeEl.textContent = last ? formatMoneyMn(change, { signed: true }) : '';
    changeEl.className = `play-hud__change ${toneOf(change)}`;
    renderChips();
  }

  // ---- panels ------------------------------------------------------------------------------------
  const info = createCountryPanel({
    data: ctx.data,
    colorOf: (id) => stage.colorOf(id),
    worldName: (id) => stage.worldName(id),
    onRegion: (regionId) => stage.view?.select(regionId),
    onClose: () => stage.view?.select(null),
    economyOf: (id) => liveEconomy(game.state, ctx.data, id),
    resourcesOf: (id) => liveResources(game.state, ctx.data, id),
    regionExtra: (regionId) => captureNode(game.state, ctx.data, playerId, regionId),
    regionFirst: true,
    actionsFor: (id) => (id === playerId ? h('button', { class: 'btn btn--block sheet__play', type: 'button', onclick: () => openSheet('budget') }, t('play.openBudget')) : null),
  });
  const report = createReportPanel({ game, countryId: playerId, onClose: () => openSheet(null), onOpenResources: () => openSheet('resources') });
  const budget = createBudgetPanel({ game, countryId: playerId, onClose: () => openSheet(null) });
  const resources = createResourcesPanel({ game, countryId: playerId, onClose: () => openSheet(null) });

  /** Show exactly one panel (or none), and let the buttons say which one is open. @param {'info' | 'report' | 'budget' | 'resources' | null} name @param {string} [straitId] */
  function showOnly(name, straitId) {
    active = name;
    if (name === 'report') report.show();
    else report.hide();
    if (name === 'budget') budget.show();
    else budget.hide();
    if (name === 'resources') resources.show(straitId);
    else resources.hide();
    if (name !== 'info') info.hide();
    reportButton.setAttribute('aria-pressed', String(name === 'report'));
    budgetButton.setAttribute('aria-pressed', String(name === 'budget'));
    resourcesButton.setAttribute('aria-pressed', String(name === 'resources'));
    stage.measure();
  }

  /** Open the report, the budget or the resources (or close what is open). @param {'report' | 'budget' | 'resources' | null} name @param {string} [straitId] */
  function openSheet(name, straitId) {
    if (name) {
      stage.hideHint(); // whoever opens the budget or the report is past the first-turn hint
      stage.view?.select(null); // the map's own selection would otherwise be hidden but still there
    }
    showOnly(name, straitId);
  }

  /** @param {'report' | 'budget' | 'resources'} name */
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
  const resourcesButton = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', onclick: () => toggle('resources') }, t('play.resources'));
  const reportButton = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', onclick: () => toggle('report') }, t('play.report'));
  const bar = h(
    'div',
    { class: 'actionbar actionbar--game' },
    h('button', { class: 'btn', type: 'button', onclick: openMenu }, t('play.menu')),
    budgetButton,
    resourcesButton,
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
      renderMarkers();
    },
  });
  stage.area.append(hud, info.el, report.el, budget.el, resources.el);
  stage.watch({ chrome: [hud], sheets: [info.el, report.el, budget.el, resources.el] });

  /** The straits, as markers on the map: a tap opens the Resources panel at that strait. */
  function renderMarkers() {
    stage.view?.setMarkers(
      ctx.data.chokepoints.items.map((/** @type {any} */ chokepoint) => ({
        id: chokepoint.id,
        lonlat: chokepoint.position,
        label: chokepoint.shortName,
        title: t('map.strait', { name: chokepoint.name }),
        blocked: game.state.world.chokepoints[chokepoint.id].blockade > 0,
        onTap: (/** @type {string} */ id) => openSheet('resources', id),
      })),
    );
  }

  renderHud();
  const unsubscribe = [
    game.bus.on('turn:end', () => {
      renderHud();
      renderMarkers();
      info.refresh();
      if (active === 'budget') budget.render();
      if (active === 'resources') resources.render();
    }),
    game.bus.on('state:restored', () => {
      renderHud();
      renderMarkers();
      report.render();
      budget.render();
      resources.render();
    }),
    game.bus.on('command', () => {
      renderHud(); // a repayment or a trade changes the treasury at once
      renderMarkers(); // and a strait the test lab closes shows at once
      if (active === 'budget') budget.render();
      if (active === 'resources') resources.render();
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
