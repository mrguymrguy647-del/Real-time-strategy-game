// The interactive map (ARCHITECTURE §9). A Phaser canvas shows the baked map; an SVG layer and HTML
// labels sit on top (overlay.js); one pointer handler turns touches into pan, pinch-zoom and tap
// (gestures.js). The view reads the map and reports what was tapped; it never changes the game.

import { STYLE, bakeMap } from './bake.js';
import { createGestures } from './gestures.js';
import { createHitIndex } from './hit.js';
import { buildMapGeometry } from './mapData.js';
import { createOverlay } from './overlay.js';
import { createPhaserMap } from './phaserMap.js';
import { NO_INSETS, clampView, fitZoom, flingStep, panBy, viewFor, zoomAbout, screenToWorld } from './view.js';

/** The baked levels of detail: a small one for the whole-map view, a large one for zooming in. */
const LOW = { key: 'map-low', width: 1024 };
const HIGH = { key: 'map-high', width: 3072 };
const MAX_DPR = 2;
/** Device pixels per world unit above which the large texture is used (with some hysteresis). */
const SWITCH_UP = 0.6;
const SWITCH_DOWN = 0.5;
/** Deepest zoom, in CSS pixels per world unit (one world unit is about 1.5 km). */
const MAX_ZOOM = 1.6;
/** Tapping a little beside a tiny region still selects it, but never more than this many world units away. */
const TAP_REACH_PX = 10;
const TAP_REACH_CAP = 25;
const IDLE_SLEEP_MS = 500;

/** @param {number} p 0..1 */
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** People who ask their phone for less motion get camera moves that just jump. */
const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * @typedef {{ countryId: string | null, regionId: string | null }} Selection
 */

/**
 * @param {{
 *   container: HTMLElement,
 *   topology: any,
 *   countryName: (id: string) => string,
 *   regionName: (id: string) => string,
 *   onSelect: (selection: Selection) => void,
 * }} options
 */
export async function createMapView({ container, topology, countryName, regionName, onSelect }) {
  const geometry = buildMapGeometry(topology);
  const hits = createHitIndex(geometry.regions);
  const regionById = new Map(geometry.regions.map((r) => [r.id, r]));
  const countryById = new Map(geometry.countries.map((c) => [c.id, c]));
  const world = { minX: 0, minY: 0, maxX: geometry.width, maxY: geometry.height };

  const root = document.createElement('div');
  root.className = 'map';
  const stage = document.createElement('div');
  stage.className = 'map__stage';
  root.append(stage);
  container.replaceChildren(root);

  const dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
  let rect = root.getBoundingClientRect();
  let viewport = { width: Math.max(rect.width, 200), height: Math.max(rect.height, 200) };
  const rangeFor = (/** @type {{ width: number, height: number }} */ vp) => {
    const min = fitZoom(vp, world);
    return { min, max: Math.max(MAX_ZOOM, min * 8) };
  };
  let range = rangeFor(viewport);
  /** @type {import('./view.js').View} */
  let view = clampView(viewFor(viewport, world), viewport, world, range);
  let fitted = true;
  /** @type {Selection} */
  let selection = { countryId: null, regionId: null };
  /** @type {import('./view.js').Insets} */
  let insets = NO_INSETS;

  // The first level of detail is baked now; the sharp one while the first frame is already showing.
  const lowCanvas = bakeMap(geometry, { width: LOW.width });
  const phaser = await createPhaserMap({
    parent: stage,
    layers: [{ key: LOW.key, canvas: lowCanvas, worldWidth: geometry.width }],
    width: viewport.width,
    height: viewport.height,
    dpr,
    background: STYLE.sea,
  });
  let shownLayer = LOW.key;
  let highReady = false;
  phaser.showLayer(LOW.key);

  const overlay = createOverlay({ parent: root, geometry, countryName, regionName });

  /** @type {{ vx: number, vy: number } | null} */
  let fling = null;
  /** @type {{ from: import('./view.js').View, to: import('./view.js').View, start: number, ms: number } | null} */
  let animation = null;
  let frameRequest = 0;
  let lastFrame = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let sleepTimer;
  let destroyed = false;
  let frames = 0;

  function schedule() {
    if (!frameRequest && !destroyed) frameRequest = requestAnimationFrame(frame);
  }

  /** @param {number} now */
  function frame(now) {
    frameRequest = 0;
    const dt = lastFrame ? Math.min(now - lastFrame, 50) : 16;
    lastFrame = now;
    if (fling) {
      const step = flingStep(fling, dt);
      view = panBy(view, step.dx, step.dy);
      fling = step.moving ? { vx: step.vx, vy: step.vy } : null;
    }
    if (animation) {
      const p = Math.min(Math.max((now - animation.start) / animation.ms, 0), 1);
      const e = ease(p);
      const { from, to } = animation;
      view = { cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, zoom: from.zoom * (to.zoom / from.zoom) ** e };
      if (p >= 1) animation = null;
    }
    view = clampView(view, viewport, world, range, insets);
    fitted = fitted && Math.abs(view.zoom - range.min) < 1e-9;

    // Pick the level of detail that is nearest one texture pixel per device pixel.
    const deviceScale = view.zoom * dpr;
    const wanted = highReady && (shownLayer === HIGH.key ? deviceScale >= SWITCH_DOWN : deviceScale >= SWITCH_UP) ? HIGH.key : LOW.key;
    if (wanted !== shownLayer) {
      shownLayer = wanted;
      phaser.showLayer(wanted);
    }
    phaser.wake();
    phaser.setView(view);
    overlay.update(view, viewport, insets);
    frames++;
    if (fling || animation) {
      schedule();
    } else {
      lastFrame = 0;
      clearTimeout(sleepTimer);
      sleepTimer = setTimeout(() => phaser.sleep(), IDLE_SLEEP_MS);
    }
  }

  /** @param {import('./view.js').View} target @param {number} [ms] */
  function animateTo(target, ms = 320) {
    fling = null;
    animation = { from: view, to: clampView(target, viewport, world, range, insets), start: performance.now(), ms: prefersReducedMotion() ? 1 : ms };
    schedule();
  }

  /** @param {number} factor @param {number} x @param {number} y */
  function zoomAt(factor, x, y) {
    view = zoomAbout(view, viewport, factor, x, y);
    fitted = false;
    schedule();
  }

  /** The view that frames a box, in the part of the map that no panel covers. @param {{ minX: number, minY: number, maxX: number, maxY: number }} box @param {number} [margin] @param {number} [maxZoom] */
  function viewForBox(box, margin = 28, maxZoom = 0.9) {
    const free = { width: Math.max(viewport.width - insets.left - insets.right, 120), height: Math.max(viewport.height - insets.top - insets.bottom, 120) };
    const zoom = Math.min(fitZoom(free, box, margin), maxZoom, range.max);
    const cx = (box.minX + box.maxX) / 2 - (insets.left - insets.right) / 2 / zoom;
    const cy = (box.minY + box.maxY) / 2 - (insets.top - insets.bottom) / 2 / zoom;
    return { cx, cy, zoom: Math.max(zoom, range.min) };
  }

  /** @param {string | null} regionId */
  function select(regionId) {
    const region = regionId ? regionById.get(regionId) : null;
    const next = { countryId: region?.country ?? null, regionId: region?.id ?? null };
    if (next.countryId === selection.countryId && next.regionId === selection.regionId) return;
    const countryChanged = next.countryId !== selection.countryId;
    selection = next;
    overlay.setSelection(next.countryId, next.regionId);
    // Report first: the screen shows its panel and tells us how much of the map it covers (setInsets),
    // so the camera can frame the country in what is left.
    onSelect({ ...selection });
    if (countryChanged && next.countryId) {
      const country = countryById.get(next.countryId);
      if (country) animateTo(viewForBox(country.box));
    }
    schedule();
  }

  /** @param {number} x @param {number} y CSS pixels inside the map */
  function tapAt(x, y) {
    const [wx, wy] = screenToWorld(view, viewport, x, y);
    const reach = Math.min(TAP_REACH_PX / view.zoom, TAP_REACH_CAP);
    select(hits.hit(wx, wy, reach)?.id ?? null);
  }

  // ---- input -------------------------------------------------------------------------------
  const gestures = createGestures({
    onStart: () => {
      fling = null;
      animation = null;
    },
    onPan: (dx, dy) => {
      view = panBy(view, dx, dy);
      fitted = false;
      schedule();
    },
    onPinch: ({ scale, x, y, dx, dy }) => {
      view = panBy(zoomAbout(view, viewport, scale, x, y), dx, dy);
      fitted = false;
      schedule();
    },
    onFling: (vx, vy) => {
      fling = { vx, vy };
      schedule();
    },
    onTap: tapAt,
  });
  const local = (/** @type {PointerEvent} */ e) => [e.clientX - rect.left, e.clientY - rect.top];
  /** @type {Array<[string, (e: any) => void, AddEventListenerOptions?]>} */
  const listeners = [
    ['pointerdown', (/** @type {PointerEvent} */ e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      rect = root.getBoundingClientRect();
      root.setPointerCapture?.(e.pointerId);
      gestures.down(e.pointerId, ...(/** @type {[number, number]} */ (local(e))), e.timeStamp);
    }],
    ['pointermove', (/** @type {PointerEvent} */ e) => gestures.move(e.pointerId, ...(/** @type {[number, number]} */ (local(e))), e.timeStamp)],
    ['pointerup', (/** @type {PointerEvent} */ e) => gestures.up(e.pointerId, ...(/** @type {[number, number]} */ (local(e))), e.timeStamp)],
    ['pointercancel', (/** @type {PointerEvent} */ e) => gestures.cancel(e.pointerId)],
    ['wheel', (/** @type {WheelEvent} */ e) => {
      e.preventDefault();
      rect = root.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false }],
  ];
  for (const [type, handler, options] of listeners) root.addEventListener(type, handler, options);

  // ---- size changes ---------------------------------------------------------------------------
  const observer = new ResizeObserver(() => {
    rect = root.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) return;
    viewport = { width: rect.width, height: rect.height };
    range = rangeFor(viewport);
    phaser.resize(viewport.width, viewport.height, dpr);
    if (fitted) view = viewFor(viewport, world);
    schedule();
  });
  observer.observe(root);

  schedule();
  // Bake the sharp texture once the first frame is up, so the map appears quickly.
  setTimeout(() => {
    if (destroyed) return;
    phaser.addLayer({ key: HIGH.key, canvas: bakeMap(geometry, { width: HIGH.width }), worldWidth: geometry.width });
    highReady = true;
    schedule();
  }, 60);

  return {
    geometry,
    root,
    select,
    /** @param {string} id */
    focusCountry(id) {
      const country = countryById.get(id);
      if (country) animateTo(viewForBox(country.box));
    },
    zoomBy(/** @type {number} */ factor) {
      animateTo({ ...view, zoom: Math.min(Math.max(view.zoom * factor, range.min), range.max) }, 220);
    },
    resetView() {
      fitted = true;
      animateTo(viewForBox(world, 0, Infinity), 320);
    },
    /** Tell the map which parts a panel covers, so focusing frames the country in what is left. @param {import('./view.js').Insets} next */
    setInsets(next) {
      insets = next;
      schedule(); // the next frame re-applies the limits to the part that is still uncovered
    },
    getView: () => ({ ...view }),
    /** @param {Partial<import('./view.js').View>} next */
    setView(next) {
      view = { ...view, ...next };
      fitted = false;
      schedule();
    },
    getSelection: () => ({ ...selection }),
    /** What the renderer really is, for Diagnostics and tests. */
    info: () => ({ webgl: phaser.webgl, phaser: phaser.version, frames, layer: shownLayer, dpr, viewport: { ...viewport }, zoomRange: { ...range } }),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frameRequest);
      clearTimeout(sleepTimer);
      observer.disconnect();
      for (const [type, handler, options] of listeners) root.removeEventListener(type, handler, options);
      overlay.destroy();
      phaser.destroy();
      root.remove();
    },
  };
}
