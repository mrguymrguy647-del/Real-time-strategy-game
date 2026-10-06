// What sits on top of the baked map as HTML and SVG, so it stays crisp at any zoom: the outline of the
// selected country and region (an SVG whose group is moved by the camera, strokes of constant pixel
// width), the country and region names, and the markers of the places that can be tapped (the
// straits), all HTML positioned from the camera. Plain Phaser text shrinks with the camera zoom, so it
// is not used (ARCHITECTURE §9.5).

import { longerSide } from './box.js';
import { chooseLabels } from './labelLayout.js';
import { NO_INSETS, worldToScreen } from './view.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** A country name appears once its shape is this many CSS pixels across (its longer side). */
const COUNTRY_LABEL_MIN_PX = 64;
/** A region name appears once the region is this many pixels across, and the map is zoomed in enough. */
const REGION_LABEL_MIN_PX = 96;
const REGION_LABEL_MIN_ZOOM = 0.3;

/** @param {import('./topology.js').Polygon[]} polygons SVG path data in world units */
export function pathData(polygons) {
  /** @type {string[]} */
  const parts = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      let d = `M${ring[0].toFixed(1)} ${ring[1].toFixed(1)}`;
      for (let i = 2; i < ring.length; i += 2) d += `L${ring[i].toFixed(1)} ${ring[i + 1].toFixed(1)}`;
      parts.push(`${d}Z`);
    }
  }
  return parts.join('');
}

/**
 * @param {{
 *   parent: HTMLElement,
 *   geometry: import('./mapData.js').MapGeometry,
 *   countryName: (id: string) => string,
 *   regionName: (id: string) => string,
 * }} options
 */
export function createOverlay({ parent, geometry, countryName, regionName }) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map__overlay');
  svg.setAttribute('aria-hidden', 'true');
  const world = document.createElementNS(SVG_NS, 'g');
  /** @param {string} cls */
  const makePath = (cls) => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('fill-rule', 'evenodd');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    return p;
  };
  const ownPath = makePath('map__sel map__sel--own'); // the player's own country, under the selection
  const countryPath = makePath('map__sel map__sel--country');
  const regionPath = makePath('map__sel map__sel--region');
  world.append(ownPath, countryPath, regionPath);
  svg.append(world);

  const labelLayer = document.createElement('div');
  labelLayer.className = 'map__labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  const markerLayer = document.createElement('div');
  markerLayer.className = 'map__markers';
  parent.append(svg, labelLayer, markerLayer);

  /** @param {string} cls @param {string} text */
  const makeLabel = (cls, text) => {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    el.hidden = true;
    labelLayer.append(el);
    return el;
  };
  // In priority order, so when names collide a playable country beats a grey one, a country beats
  // regions, and the bigger beats the smaller. `rank` is 0 playable country, 1 grey country, 2 region.
  const label = (/** @type {string} */ cls, /** @type {string} */ text, /** @type {[number, number]} */ at, /** @type {number} */ size, /** @type {number} */ rank) => ({ el: makeLabel(cls, text), at, size, rank, shown: false, w: 0, h: 0 });
  const labels = [
    ...geometry.countries.map((c) => label('map__label', countryName(c.id), c.label, longerSide(c.box), 0)),
    ...(geometry.world?.countries ?? []).map((c) => label('map__label map__label--world', c.name, c.label, c.size, 1)),
    ...geometry.regions.map((r) => label('map__label map__label--region', regionName(r.id), r.label, longerSide(r.box), 2)),
  ].sort((a, b) => a.rank - b.rank || b.size - a.size);

  /** Read the size of labels that have not been measured yet, all in one layout pass. @param {typeof labels} fresh */
  function measure(fresh) {
    for (const label of fresh) label.el.hidden = false;
    for (const label of fresh) {
      label.w = label.el.offsetWidth || 60;
      label.h = label.el.offsetHeight || 18;
    }
    for (const label of fresh) label.el.hidden = !label.shown;
  }

  /** @type {Map<string, string>} */
  const cache = new Map();
  /** @param {string} id @param {import('./topology.js').Polygon[]} polygons */
  const dataFor = (id, polygons) => {
    let d = cache.get(id);
    if (d === undefined) cache.set(id, (d = pathData(polygons)));
    return d;
  };
  /** @type {Array<{ id: string, at: [number, number], el: HTMLElement }>} */
  let markers = [];
  const countries = new Map(geometry.countries.map((c) => [c.id, c]));
  const regions = new Map(geometry.regions.map((r) => [r.id, r]));
  const greyCountries = geometry.world?.byId ?? new Map();

  return {
    /**
     * Move everything to match the camera.
     * @param {import('./view.js').View} view @param {import('./view.js').Viewport} viewport
     * @param {import('./view.js').Insets} [insets] what a panel covers @param {import('./labelLayout.js').LabelBox[]} [reserved] where buttons sit
     */
    update(view, viewport, insets = NO_INSETS, reserved = []) {
      svg.setAttribute('width', String(viewport.width));
      svg.setAttribute('height', String(viewport.height));
      const tx = viewport.width / 2 - view.cx * view.zoom;
      const ty = viewport.height / 2 - view.cy * view.zoom;
      world.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${view.zoom.toFixed(5)})`);
      const wanted = labels.filter((label) => {
        const pixels = label.size * view.zoom;
        return label.rank === 2 ? pixels >= REGION_LABEL_MIN_PX && view.zoom >= REGION_LABEL_MIN_ZOOM : pixels >= COUNTRY_LABEL_MIN_PX;
      });
      measure(wanted.filter((label) => label.w === 0));
      const boxes = labels.map((label) => {
        if (!wanted.includes(label)) return null;
        const [x, y] = worldToScreen(view, viewport, label.at[0], label.at[1]);
        return { x, y, w: label.w, h: label.h };
      });
      const show = chooseLabels(boxes, { left: insets.left, top: insets.top, right: viewport.width - insets.right, bottom: viewport.height - insets.bottom }, reserved);
      labels.forEach((label, i) => {
        if (show[i] !== label.shown) {
          label.shown = show[i];
          label.el.hidden = !show[i];
        }
        const box = boxes[i];
        if (show[i] && box) label.el.style.transform = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px) translate(-50%, -50%)`;
      });
      // The markers: where they are, unless they are off the screen or under a panel.
      for (const marker of markers) {
        const [x, y] = worldToScreen(view, viewport, marker.at[0], marker.at[1]);
        const visible = x >= 0 && x <= viewport.width - insets.right && y >= 0 && y <= viewport.height - insets.bottom;
        marker.el.hidden = !visible;
        if (visible) marker.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    },

    /**
     * The tappable places on the map (the straits). Replaces the ones there were.
     * @param {Array<{ id: string, at: [number, number], label: string, title: string, blocked?: boolean, onTap: (id: string) => void }>} next
     *   `at` in world units; `label` is the short text shown, `title` the full name
     */
    setMarkers(next) {
      for (const marker of markers) marker.el.remove();
      markers = next.map((spec) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `map__marker${spec.blocked ? ' is-blocked' : ''}`;
        el.setAttribute('data-marker', spec.id);
        el.setAttribute('aria-label', spec.title);
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '⚓';
        el.append(icon, ` ${spec.label}`);
        // The map beneath captures the pointer on a press; a marker must not start a pan, or its tap never arrives.
        el.addEventListener('pointerdown', (event) => event.stopPropagation());
        el.addEventListener('click', () => spec.onTap(spec.id));
        el.hidden = true; // placed by the next update()
        markerLayer.append(el);
        return { id: spec.id, at: spec.at, el };
      });
    },

    /** Outline a playable country (and a region of it), or a grey one. @param {{ countryId: string | null, regionId: string | null, world: boolean }} selection */
    setSelection({ countryId, regionId, world }) {
      const country = countryId ? (world ? greyCountries.get(countryId) : countries.get(countryId)) : null;
      const region = regionId ? regions.get(regionId) : null;
      countryPath.setAttribute('d', country ? dataFor(`${world ? 'w' : 'c'}:${country.id}`, country.polygons) : '');
      regionPath.setAttribute('d', region ? dataFor(`r:${region.id}`, region.polygons) : '');
    },

    /** Mark the player's own country, or nothing. @param {string | null} countryId a playable country */
    setOwn(countryId) {
      const country = countryId ? countries.get(countryId) : null;
      ownPath.setAttribute('d', country ? dataFor(`c:${country.id}`, country.polygons) : '');
    },

    destroy() {
      svg.remove();
      labelLayer.remove();
      markerLayer.remove();
    },
  };
}
