// The map as part of a screen, shared by Explore, the country picker and the game. It owns the map
// itself, the zoom buttons, the one-line hint and the status text, and keeps the map and its names
// clear of whatever floats over it: panels (the part of the map they cover) and buttons (names keep
// away from them). The screen adds its own bars and panels inside `area` and tells the stage about
// them with watch().

import { t } from '../../util/i18n.js';
import { h } from '../dom.js';
import { COUNTRY_PALETTE } from '../map/coloring.js';
import { createMapView } from '../map/mapView.js';

/** A small globe for the "show the whole world" button. */
const GLOBE_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/></svg>';

/**
 * @param {{
 *   ctx: any,
 *   hint?: string,
 *   bar?: HTMLElement,
 *   onSelect: (selection: { countryId: string | null, regionId: string | null, world: boolean }) => void,
 *   onReady?: (view: Awaited<ReturnType<typeof createMapView>>) => void,
 * }} options
 *   `hint`: the one-line reminder shown over the map until the first touch; `bar`: an action bar under the map
 */
export function createMapStage({ ctx, hint: hintText, bar, onSelect, onReady }) {
  /** @type {Awaited<ReturnType<typeof createMapView>> | null} */
  let view = null;
  let destroyed = false;
  /** @type {ResizeObserver | null} */
  let observer = null;
  /** @type {HTMLElement[]} */
  let chrome = [];
  /** @type {HTMLElement[]} */
  let sheets = [];

  const host = h('div', { class: 'map-host' });
  const status = h('p', { class: 'map-status', role: 'status' }, t('map.loading'));
  const zoomIn = h('button', { class: 'map__btn', type: 'button', 'aria-label': t('map.zoomIn'), onclick: () => view?.zoomBy(1.8) }, '+');
  const zoomOut = h('button', { class: 'map__btn', type: 'button', 'aria-label': t('map.zoomOut'), onclick: () => view?.zoomBy(1 / 1.8) }, '−');
  const reset = h('button', { class: 'map__btn', type: 'button', 'aria-label': t('map.reset'), onclick: () => view?.resetView() }, '⌖');
  const globe = h('button', { class: 'map__btn', type: 'button', hidden: true, 'aria-label': t('map.showWorld'), onclick: () => view?.showWorld() });
  globe.innerHTML = GLOBE_ICON; // fixed markup of our own, no data in it
  const hud = h('div', { class: 'map__hud', hidden: true }, zoomIn, zoomOut, reset, globe);
  const hint = h('p', { class: 'map-hint', hidden: true }, hintText ?? '');
  const area = h('div', { class: 'map-area' }, host, hud, hint, status);
  const el = h('section', { class: `screen screen--map${bar ? ' screen--bar' : ''}` }, area, bar);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let hintTimer;

  /** Tell the map and the buttons how much of the screen the panel covers, and where the buttons are. */
  function measure() {
    const map = area.getBoundingClientRect();
    const sheet = sheets.find((candidate) => !candidate.hidden && candidate.getBoundingClientRect().width > 0);
    const box = sheet?.getBoundingClientRect();
    const side = box ? box.width < map.width - 2 : false;
    const insets = { top: 0, left: 0, bottom: box && !side ? Math.max(map.bottom - box.top, 0) : 0, right: box && side ? Math.max(map.right - box.left, 0) : 0 };
    area.style.setProperty('--sheet-h', `${insets.bottom}px`);
    area.style.setProperty('--sheet-w', `${insets.right}px`);
    view?.setInsets(insets);
    // Names on the map keep clear of the buttons floating over it.
    view?.setReserved(
      [...chrome, hud, hint]
        .filter((part) => !part.hidden)
        .map((part) => {
          const rect = part.getBoundingClientRect();
          return { x: rect.left - map.left + rect.width / 2, y: rect.top - map.top + rect.height / 2, w: rect.width, h: rect.height };
        }),
    );
  }

  function hideHint() {
    hint.hidden = true;
    clearTimeout(hintTimer);
    measure(); // the names may use the room the hint took
  }

  async function start() {
    try {
      const wantsWorld = ctx.settings?.get('mapWorld') !== false;
      const [topology, worldTopology] = await Promise.all([
        ctx.readJson('data/map/middle_east.topo.json'),
        // The grey world is a nicety: if it cannot be read, the Middle East is still shown.
        wantsWorld ? ctx.readJson('data/map/world.topo.json').catch((/** @type {unknown} */ err) => (console.warn('The world map could not be read', err), null)) : null,
      ]);
      if (destroyed) return;
      view = await createMapView({
        container: host,
        topology,
        worldTopology,
        countryName: (id) => ctx.data.countries.byId[id].name,
        regionName: (id) => ctx.data.regions.byId[id].name,
        onSelect: (selection) => {
          onSelect(selection);
          measure();
          if (selection.countryId) hideHint();
        },
      });
      if (destroyed) {
        view.destroy();
        return;
      }
      status.hidden = true;
      hud.hidden = false;
      globe.hidden = !view.geometry.world;
      if (hintText) {
        hint.hidden = false;
        hintTimer = setTimeout(hideHint, 7000);
        host.addEventListener('pointerdown', hideHint, { once: true });
      }
      Object.assign(globalThis, { __map: view }); // handy for the browser console and the e2e tests
      observer = new ResizeObserver(measure);
      observer.observe(el); // a turn of the phone moves the buttons
      for (const sheet of sheets) observer.observe(sheet);
      measure();
      onReady?.(view);
    } catch (err) {
      console.error('Map failed', err);
      status.textContent = t('map.failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
  void start();

  return {
    el,
    /** Where bars and panels go: the part of the screen the map fills. */
    area,
    get view() {
      return view;
    },

    /**
     * Tell the stage about the things that float over the map.
     * @param {{ chrome?: HTMLElement[], sheets?: HTMLElement[] }} parts
     *   chrome: buttons and bars names keep clear of; sheets: panels that cover part of the map (one shows at a time)
     */
    watch(parts) {
      chrome = parts.chrome ?? [];
      sheets = parts.sheets ?? [];
      if (observer) for (const sheet of sheets) observer.observe(sheet);
      measure();
    },
    measure,

    /** The palette color of a playable country, as drawn on the map. @param {string} countryId */
    colorOf: (countryId) => COUNTRY_PALETTE[(view?.geometry.colorOf.get(countryId) ?? 0) % COUNTRY_PALETTE.length],
    /** The name of a grey country of the rest of the world. @param {string} countryId */
    worldName: (countryId) => view?.geometry.world?.byId.get(countryId)?.name ?? countryId,

    destroy() {
      destroyed = true;
      clearTimeout(hintTimer);
      observer?.disconnect();
      view?.destroy();
      if (/** @type {any} */ (globalThis).__map === view) delete (/** @type {any} */ (globalThis)).__map;
    },
  };
}
