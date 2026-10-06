// What sits on top of the baked map as HTML and SVG, so it stays crisp at any zoom: the outline of the
// selected country and region (an SVG whose group is moved by the camera, strokes of constant pixel
// width) and the country and region names (HTML text positioned from the camera). Plain Phaser text
// shrinks with the camera zoom, so it is not used (ARCHITECTURE §9.5).

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

/** @param {{ minX: number, minY: number, maxX: number, maxY: number }} box */
const longerSide = (box) => Math.max(box.maxX - box.minX, box.maxY - box.minY);

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
  const countryPath = makePath('map__sel map__sel--country');
  const regionPath = makePath('map__sel map__sel--region');
  world.append(countryPath, regionPath);
  svg.append(world);

  const labelLayer = document.createElement('div');
  labelLayer.className = 'map__labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  parent.append(svg, labelLayer);

  /** @param {string} cls @param {string} text */
  const makeLabel = (cls, text) => {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    el.hidden = true;
    labelLayer.append(el);
    return el;
  };
  // In priority order, so when names collide the country beats its regions and the bigger beats the smaller.
  const labels = [
    ...geometry.countries.map((c) => ({ el: makeLabel('map__label', countryName(c.id)), at: c.label, size: longerSide(c.box), region: false, shown: false, w: 0, h: 0 })),
    ...geometry.regions.map((r) => ({ el: makeLabel('map__label map__label--region', regionName(r.id)), at: r.label, size: longerSide(r.box), region: true, shown: false, w: 0, h: 0 })),
  ].sort((a, b) => Number(a.region) - Number(b.region) || b.size - a.size);

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
  const countries = new Map(geometry.countries.map((c) => [c.id, c]));
  const regions = new Map(geometry.regions.map((r) => [r.id, r]));

  return {
    /** Move everything to match the camera. @param {import('./view.js').View} view @param {import('./view.js').Viewport} viewport @param {import('./view.js').Insets} [insets] what a panel covers */
    update(view, viewport, insets = NO_INSETS) {
      svg.setAttribute('width', String(viewport.width));
      svg.setAttribute('height', String(viewport.height));
      const tx = viewport.width / 2 - view.cx * view.zoom;
      const ty = viewport.height / 2 - view.cy * view.zoom;
      world.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${view.zoom.toFixed(5)})`);
      const wanted = labels.filter((label) => {
        const pixels = label.size * view.zoom;
        return label.region ? pixels >= REGION_LABEL_MIN_PX && view.zoom >= REGION_LABEL_MIN_ZOOM : pixels >= COUNTRY_LABEL_MIN_PX;
      });
      measure(wanted.filter((label) => label.w === 0));
      const boxes = labels.map((label) => {
        if (!wanted.includes(label)) return null;
        const [x, y] = worldToScreen(view, viewport, label.at[0], label.at[1]);
        return { x, y, w: label.w, h: label.h };
      });
      const show = chooseLabels(boxes, { left: insets.left, top: insets.top, right: viewport.width - insets.right, bottom: viewport.height - insets.bottom });
      labels.forEach((label, i) => {
        if (show[i] !== label.shown) {
          label.shown = show[i];
          label.el.hidden = !show[i];
        }
        const box = boxes[i];
        if (show[i] && box) label.el.style.transform = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px) translate(-50%, -50%)`;
      });
    },

    /** @param {string | null} countryId @param {string | null} regionId */
    setSelection(countryId, regionId) {
      const country = countryId ? countries.get(countryId) : null;
      const region = regionId ? regions.get(regionId) : null;
      countryPath.setAttribute('d', country ? dataFor(`c:${country.id}`, country.polygons) : '');
      regionPath.setAttribute('d', region ? dataFor(`r:${region.id}`, region.polygons) : '');
    },

    destroy() {
      svg.remove();
      labelLayer.remove();
    },
  };
}
