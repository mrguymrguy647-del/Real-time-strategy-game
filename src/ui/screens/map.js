// The map screen for exploring: the interactive Middle East map (with the rest of the world in grey
// around it, unless the Settings say otherwise), zoom buttons and an info panel for the tapped country.
// The country picker (pick.js) and the game (play.js) are built on the same map stage.

import { t } from '../../util/i18n.js';
import { h } from '../dom.js';
import { startEconomy } from '../economyView.js';
import { startResources } from '../resourcesView.js';
import { createMapStage } from '../components/mapStage.js';
import { createCountryPanel } from '../panels/countryPanel.js';

/** @param {any} ctx */
export function mountMap(ctx) {
  const panel = createCountryPanel({
    data: ctx.data,
    colorOf: (countryId) => stage.colorOf(countryId),
    worldName: (countryId) => stage.worldName(countryId),
    onRegion: (regionId) => stage.view?.select(regionId),
    onClose: () => stage.view?.select(null),
    economyOf: (countryId) => startEconomy(ctx.data, countryId),
    resourcesOf: (countryId) => startResources(ctx.data, countryId),
  });
  const title = h('h1', null, t('map.title'));
  const top = h('header', { class: 'map-top' }, h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.back() }, t('common.back')), title);
  const stage = createMapStage({
    ctx,
    hint: t('map.hint'),
    onSelect: (selection) => panel.show(selection),
    onReady: (view) => {
      if (view.geometry.world) title.textContent = t('map.titleWorld');
    },
  });
  stage.area.append(top, panel.el);
  stage.watch({ chrome: [top], sheets: [panel.el] });
  return { el: stage.el, destroy: () => stage.destroy() };
}
