// The country picker (GAME_DESIGN §1, "every country is AI-controlled; the player picks one"): the
// map with a strip of the 16 playable countries along the top. Tapping a country on the map or in
// the strip opens its panel with a Play button. Starting the game is ctx.startGame().

import { t } from '../../util/i18n.js';
import { playableOf } from '../../core/scenario.js';
import { h } from '../dom.js';
import { startEconomy } from '../economyView.js';
import { createMapStage } from '../components/mapStage.js';
import { createCountryPanel } from '../panels/countryPanel.js';

/** The scenario a new game plays (Phase 1 has one). */
export const SCENARIO_ID = 'me_2026';

/** @param {any} ctx */
export function mountPick(ctx) {
  const scenario = ctx.data.scenarios.byId[SCENARIO_ID];
  const playable = new Set(playableOf(ctx.data, scenario));
  /** Major powers first, then by size of the economy. */
  const ordered = ctx.data.countries.items
    .filter((/** @type {any} */ country) => playable.has(country.id))
    .sort((/** @type {any} */ a, /** @type {any} */ b) => a.aiTier - b.aiTier || b.start.economy.gdpBn - a.start.economy.gdpBn);

  const panel = createCountryPanel({
    data: ctx.data,
    colorOf: (countryId) => stage.colorOf(countryId),
    worldName: (countryId) => stage.worldName(countryId),
    onRegion: (regionId) => stage.view?.select(regionId),
    onClose: () => stage.view?.select(null),
    economyOf: (countryId) => startEconomy(ctx.data, countryId),
    actionsFor: (countryId) =>
      playable.has(countryId)
        ? h('button', { class: 'btn btn--primary btn--block sheet__play', type: 'button', onclick: () => ctx.startGame(countryId) }, t('pick.play', { name: ctx.data.countries.byId[countryId].name }))
        : null,
  });

  const strip = h('div', { class: 'pick-strip chips', role: 'group', 'aria-label': t('pick.list') });
  /** @param {string | null} countryId */
  function markActive(countryId) {
    for (const chip of strip.children) {
      const active = chip.getAttribute('data-country') === countryId;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
      if (active) {
        // scroll the strip itself (not the page) so the chosen country sits in view
        const box = chip.getBoundingClientRect();
        const bar = strip.getBoundingClientRect();
        strip.scrollTo({ left: strip.scrollLeft + (box.left - bar.left) - (bar.width - box.width) / 2, behavior: 'smooth' });
      }
    }
  }
  const top = h(
    'header',
    { class: 'map-top map-top--stack' },
    h('div', { class: 'map-top__row' }, h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.navigate('title') }, t('common.back')), h('h1', null, t('pick.title'))),
    strip,
  );

  const stage = createMapStage({
    ctx,
    hint: t('pick.hint'),
    onSelect: (selection) => {
      panel.show(selection);
      markActive(selection.world ? null : selection.countryId);
    },
    onReady: (view) => {
      strip.replaceChildren(
        ...ordered.map((/** @type {any} */ country) =>
          h(
            'button',
            { class: 'chip', type: 'button', 'aria-pressed': 'false', 'data-country': country.id, onclick: () => view.select(country.capital.region) },
            h('span', { class: 'chip__dot', style: `background:${stage.colorOf(country.id)}` }),
            country.name,
          ),
        ),
      );
      stage.measure(); // the strip is part of what names keep clear of
    },
  });
  stage.area.append(top, panel.el);
  stage.watch({ chrome: [top], sheets: [panel.el] });
  return { el: stage.el, destroy: () => stage.destroy() };
}
