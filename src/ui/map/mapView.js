// The interactive map (ARCHITECTURE §9). A Phaser canvas shows the baked pictures; an SVG layer and HTML
// labels sit on top (overlay.js); one pointer handler turns touches into pan, pinch-zoom and tap
// (gestures.js). The view reads the map and reports what was tapped; it never changes the game.
// The theater (the 16 playable countries) is always there; the grey rest of the world is optional
// (worldTopology) and drawn around it (detail.js, layers.js).

import { STYLE } from './bake.js';
import { boxContains } from './box.js';
import { createDetail } from './detail.js';
import { createGestures } from './gestures.js';
import { createHitIndex } from './hit.js';
import { HIGH, LOW, OVERVIEW, overviewDensity, sharpLayer, startLayers, wantsSharp, worldLayer } from './layers.js';
import { buildMapGeometry } from './mapData.js';
import { createOverlay } from './overlay.js';
import { createPhaserMap } from './phaserMap.js';
import { NO_INSETS, clampView, fitZoom, flingStep, panBy, screenToWorld, viewFor, visibleBounds, zoomAbout } from './view.js';

const MAX_DPR = 2;
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
 * @typedef {{ countryId: string | null, regionId: string | null, world: boolean }} Selection
 *   `world` is true for a grey country of the rest of the world, which has no regions and cannot be played
 */
/** @type {Selection} */
const NOTHING = { countryId: null, regionId: null, world: false };

/**
 * @param {{
 *   container: HTMLElement,
 *   topology: any,
 *   worldTopology?: any,
 *   countryName: (id: string) => string,
 *   regionName: (id: string) => string,
 *   onSelect: (selection: Selection) => void,
 * }} options
 */
export async function createMapView({ container, topology, worldTopology = null, countryName, regionName, onSelect }) {
  const geometry = buildMapGeometry(topology, worldTopology);
  const world = geometry.world;
  const theater = geometry.theater;
  /** Where the camera may go: the whole world when it is drawn, else the theater. */
  const bounds = world ? world.rect : theater;
  const hits = createHitIndex(geometry.regions);
  const worldHits = world ? createHitIndex(world.countries, { cell: 256 }) : null;
  const regionById = new Map(geometry.regions.map((r) => [r.id, r]));
  const countryById = new Map(geometry.countries.map((c) => [c.id, c]));

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
    const min = fitZoom(vp, bounds);
    return { min, max: Math.max(MAX_ZOOM, min * 8) };
  };
  let range = rangeFor(viewport);
  /** The map opens on the whole theater, whatever is drawn around it. @type {import('./view.js').View} */
  let view = clampView(viewFor(viewport, theater), viewport, bounds, range);
  /** True while the view is the opening one, so a change of screen size re-fits it. */
  let fitted = true;
  /** @type {Selection} */
  let selection = NOTHING;
  /** @type {import('./view.js').Insets} */
  let insets = NO_INSETS;
  /** Where the screen's own buttons sit, which names keep clear of. @type {import('./labelLayout.js').LabelBox[]} */
  let reserved = [];

  // The theater's small picture is baked now; the world and the sharp theater one after the first frame.
  const phaser = await createPhaserMap({ parent: stage, layers: startLayers(geometry), width: viewport.width, height: viewport.height, dpr, background: STYLE.sea });
  let sharpShown = false;
  let sharpReady = false;
  let worldReady = !world;
  phaser.setLayerVisible(LOW.key, true);

  const overlay = createOverlay({ parent: root, geometry, countryName, regionName });

  /** @type {{ vx: number, vy: number } | null} */
  let fling = null;
  /** @type {{ from: import('./view.js').View, to: import('./view.js').View, start: number, ms: number, fit: boolean } | null} */
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

  // The crisp redraw of the grey world, once the camera holds still (only when the world is drawn).
  const detail = world ? createDetail({ phaser, world, theater, overviewPxPerUnit: overviewDensity(geometry), getState: () => ({ view, viewport, dpr }), onChange: schedule }) : null;

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
      if (p >= 1) {
        fitted = animation.fit;
        animation = null;
      }
    }
    view = clampView(view, viewport, bounds, range, insets);

    // Pick the theater picture that is nearest one texture pixel per device pixel.
    const sharp = wantsSharp(view.zoom * dpr, sharpShown, sharpReady);
    if (sharp !== sharpShown) {
      sharpShown = sharp;
      phaser.setLayerVisible(HIGH.key, sharp);
      phaser.setLayerVisible(LOW.key, !sharp);
    }
    if (world) {
      // The small picture of the world is only the stand-in while the camera moves: leave it out (it would
      // be drawn for nothing, under pictures that cover it) when the theater or the crisp redraw fills the screen.
      const seen = visibleBounds(view, viewport);
      const covered = boxContains(theater, seen) || (detail?.coverage() ? boxContains(/** @type {import('./box.js').Box} */ (detail.coverage()), seen) : false);
      phaser.setLayerVisible(OVERVIEW.key, !covered);
    }
    phaser.wake();
    phaser.setView(view);
    overlay.update(view, viewport, insets, reserved);
    frames++;
    if (fling || animation) {
      schedule();
    } else {
      lastFrame = 0;
      detail?.settle();
      clearTimeout(sleepTimer);
      sleepTimer = setTimeout(() => phaser.sleep(), IDLE_SLEEP_MS);
    }
  }

  /** @param {import('./view.js').View} target @param {number} [ms] @param {boolean} [fit] the target is the opening view */
  function animateTo(target, ms = 320, fit = false) {
    fling = null;
    detail?.cancel();
    const to = clampView(target, viewport, bounds, range, insets);
    if (prefersReducedMotion()) {
      // No glide: the camera is simply there (and says so at once, not a frame or two later).
      animation = null;
      view = to;
      fitted = fit;
    } else {
      fitted = false;
      animation = { from: view, to, start: performance.now(), ms, fit };
    }
    schedule();
  }

  /** @param {number} factor @param {number} x @param {number} y */
  function zoomAt(factor, x, y) {
    view = zoomAbout(view, viewport, factor, x, y);
    fitted = false;
    detail?.cancel();
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

  /** @param {Selection} next @param {import('./box.js').Box} [focus] what to bring into view when the country changes */
  function choose(next, focus) {
    if (next.countryId === selection.countryId && next.regionId === selection.regionId && next.world === selection.world) return;
    const countryChanged = next.countryId !== selection.countryId;
    selection = next;
    overlay.setSelection(next);
    // Report first: the screen shows its panel and tells us how much of the map it covers (setInsets),
    // so the camera can frame the country in what is left.
    onSelect({ ...selection });
    if (countryChanged && focus) animateTo(viewForBox(focus));
    schedule();
  }

  /** @param {string | null} regionId a playable region */
  function select(regionId) {
    const region = regionId ? regionById.get(regionId) : null;
    choose(region ? { countryId: region.country, regionId: region.id, world: false } : NOTHING, region ? countryById.get(region.country)?.box : undefined);
  }

  /** @param {string | null} countryId a grey country of the rest of the world */
  function selectWorld(countryId) {
    const country = countryId ? world?.byId.get(countryId) : null;
    choose(country ? { countryId: country.id, regionId: null, world: true } : NOTHING, country?.focus);
  }

  /** @param {number} x @param {number} y CSS pixels inside the map */
  function tapAt(x, y) {
    const [wx, wy] = screenToWorld(view, viewport, x, y);
    const reach = Math.min(TAP_REACH_PX / view.zoom, TAP_REACH_CAP);
    const region = hits.hit(wx, wy, reach);
    if (region) return select(region.id);
    const grey = worldHits?.hit(wx, wy, reach);
    if (grey) return selectWorld(grey.id);
    return select(null);
  }

  // ---- input -------------------------------------------------------------------------------
  const gestures = createGestures({
    onStart: () => {
      fling = null;
      animation = null;
      detail?.cancel();
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
    if (fitted) view = viewFor(viewport, theater);
    schedule();
  });
  observer.observe(root);

  schedule();
  // Everything but the theater's small picture waits until the first frame is on screen, so the map appears quickly.
  if (world) {
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (destroyed) return;
        phaser.addLayer(worldLayer(geometry));
        phaser.setLayerVisible(OVERVIEW.key, true);
        detail?.renderNow(); // the crisp redraw of what is around the theater
        worldReady = true;
        schedule();
      }, 0),
    );
  }
  setTimeout(() => {
    if (destroyed) return;
    phaser.addLayer(sharpLayer(geometry));
    sharpReady = true;
    schedule();
  }, world ? 300 : 60);

  return {
    geometry,
    root,
    select,
    selectWorld,
    /** @param {string} id */
    focusCountry(id) {
      const country = countryById.get(id);
      if (country) animateTo(viewForBox(country.box));
    },
    zoomBy(/** @type {number} */ factor) {
      animateTo({ ...view, zoom: Math.min(Math.max(view.zoom * factor, range.min), range.max) }, 220);
    },
    /** Back to the opening view: the whole theater. */
    resetView() {
      animateTo(viewForBox(theater, 0, Infinity), 320, true);
    },
    /** Zoom out to the whole world (does nothing when only the theater is drawn). */
    showWorld() {
      if (world) animateTo(viewForBox(world.rect, 0, Infinity), 420);
    },
    /** Tell the map which parts a panel covers, so focusing frames the country in what is left. @param {import('./view.js').Insets} next */
    setInsets(next) {
      insets = next;
      schedule(); // the next frame re-applies the limits to the part that is still uncovered
    },
    /** Tell the map where the screen's buttons sit (centre and size in CSS pixels inside the map), so names keep clear of them. @param {import('./labelLayout.js').LabelBox[]} next */
    setReserved(next) {
      reserved = next;
      schedule();
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
    info: () => ({
      webgl: phaser.webgl,
      phaser: phaser.version,
      frames,
      /** Every picture is baked (the world and the sharp theater one come a moment after the first frame). */
      ready: sharpReady && worldReady,
      layer: sharpShown ? HIGH.key : LOW.key,
      dpr,
      viewport: { ...viewport },
      zoomRange: { ...range },
      world: Boolean(world),
      detail: detail?.info() ?? null,
    }),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frameRequest);
      clearTimeout(sleepTimer);
      detail?.destroy();
      observer.disconnect();
      for (const [type, handler, options] of listeners) root.removeEventListener(type, handler, options);
      overlay.destroy();
      phaser.destroy();
      root.remove();
    },
  };
}
