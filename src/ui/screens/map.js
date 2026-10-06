// The map screen: the interactive Middle East map with zoom buttons and an info panel for the tapped
// country. Phase 1, milestone M1.1a: it is explored on its own; the country picker and the economy
// build on it later.

import { t } from '../../util/i18n.js';
import { h } from '../dom.js';
import { COUNTRY_PALETTE } from '../map/coloring.js';
import { createMapView } from '../map/mapView.js';
import { createCountryPanel } from '../panels/countryPanel.js';

/** @param {any} ctx */
export function mountMap(ctx) {
  /** @type {Awaited<ReturnType<typeof createMapView>> | null} */
  let view = null;
  let destroyed = false;
  /** @type {ResizeObserver | null} */
  let sheetObserver = null;

  const host = h('div', { class: 'map-host' });
  const status = h('p', { class: 'map-status', role: 'status' }, t('map.loading'));
  const zoomIn = h('button', { class: 'map__btn', type: 'button', 'aria-label': t('map.zoomIn'), onclick: () => view?.zoomBy(1.8) }, '+');
  const zoomOut = h('button', { class: 'map__btn', type: 'button', 'aria-label': t('map.zoomOut'), onclick: () => view?.zoomBy(1 / 1.8) }, '−');
  const reset = h('button', { class: 'map__btn', type: 'button', 'aria-label': t('map.reset'), onclick: () => view?.resetView() }, '⌖');
  const hud = h('div', { class: 'map__hud', hidden: true }, zoomIn, zoomOut, reset);
  // A one-line reminder of the gestures; it goes away on the first touch (or after a few seconds).
  const hint = h('p', { class: 'map-hint', hidden: true }, t('map.hint'));
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let hintTimer;
  function hideHint() {
    hint.hidden = true;
    clearTimeout(hintTimer);
  }
  const top = h('header', { class: 'map-top' }, h('button', { class: 'btn btn--small', type: 'button', onclick: () => ctx.back() }, t('common.back')), h('h1', null, t('map.title')));

  const panel = createCountryPanel({
    data: ctx.data,
    colorOf: (countryId) => COUNTRY_PALETTE[(view?.geometry.colorOf.get(countryId) ?? 0) % COUNTRY_PALETTE.length],
    onRegion: (regionId) => view?.select(regionId),
    onClose: () => view?.select(null),
  });
  const el = h('section', { class: 'screen screen--map' }, host, top, hud, hint, panel.el, status);

  /** Tell the map and the buttons how much of the screen the panel covers. */
  function measureSheet() {
    const map = el.getBoundingClientRect();
    const sheet = panel.el.getBoundingClientRect();
    const covered = !panel.el.hidden && sheet.width > 0;
    const side = covered && sheet.width < map.width - 2;
    const insets = { top: 0, left: 0, bottom: covered && !side ? Math.max(map.bottom - sheet.top, 0) : 0, right: covered && side ? Math.max(map.right - sheet.left, 0) : 0 };
    el.style.setProperty('--sheet-h', `${insets.bottom}px`);
    el.style.setProperty('--sheet-w', `${insets.right}px`);
    view?.setInsets(insets);
  }

  /** @param {{ countryId: string | null, regionId: string | null }} selection */
  function onSelect(selection) {
    panel.show(selection);
    measureSheet();
    if (selection.countryId) hideHint();
  }

  async function start() {
    try {
      const topology = await ctx.readJson('data/map/middle_east.topo.json');
      if (destroyed) return;
      view = await createMapView({
        container: host,
        topology,
        countryName: (id) => ctx.data.countries.byId[id].name,
        regionName: (id) => ctx.data.regions.byId[id].name,
        onSelect,
      });
      if (destroyed) {
        view.destroy();
        return;
      }
      status.hidden = true;
      hud.hidden = false;
      hint.hidden = false;
      hintTimer = setTimeout(hideHint, 7000);
      host.addEventListener('pointerdown', hideHint, { once: true });
      Object.assign(globalThis, { __map: view }); // handy for the browser console and the e2e tests
      sheetObserver = new ResizeObserver(measureSheet);
      sheetObserver.observe(panel.el);
    } catch (err) {
      console.error('Map failed', err);
      status.textContent = t('map.failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
  void start();

  return {
    el,
    destroy() {
      destroyed = true;
      clearTimeout(hintTimer);
      sheetObserver?.disconnect();
      view?.destroy();
      if (/** @type {any} */ (globalThis).__map === view) delete (/** @type {any} */ (globalThis)).__map;
    },
  };
}
