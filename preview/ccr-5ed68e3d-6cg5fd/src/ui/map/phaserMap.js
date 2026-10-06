// The only file that talks to Phaser for the map (T-02): it shows baked canvases through a camera and
// nothing else. All input, labels and selection live in HTML on top of it, so Phaser is just the
// GPU-backed pan/zoom surface. World units are the pixels of the sharpest theater texture; y points
// down. Layers stack by depth: the grey world's overview, then its crisp redraw, then the theater.

import { loadPhaser } from '../phaser.js';

/** Stacking order, bottom to top. */
export const DEPTH = { overview: 0, detail: 1, theater: 2 };

/**
 * @typedef {{ key: string, canvas: HTMLCanvasElement, rect: import('./box.js').Box, depth?: number }} Layer
 *   a baked canvas that covers `rect`, a rectangle in world units
 * @typedef {{
 *   parent: HTMLElement, layers: Layer[], width: number, height: number, dpr: number, background: string,
 * }} PhaserMapOptions  width and height are the map's size in CSS pixels
 */

/**
 * @param {PhaserMapOptions} options
 */
export async function createPhaserMap(options) {
  const Phaser = await loadPhaser();
  /** @type {any} */
  let scene = null;
  /** @type {Map<string, any>} */
  const images = new Map();
  /** The crisp redraw of the grey world: replaced as a whole each time, so its texture is never resized. @type {{ key: string, image: any } | null} */
  let detail = null;
  let detailSerial = 0;
  /** @type {any} */
  let game = null;
  let dpr = options.dpr;
  let destroyed = false;

  /** @type {Promise<void>} */
  const ready = new Promise((resolve, reject) => {
    class MapScene extends Phaser.Scene {
      constructor() {
        super('map');
      }

      create() {
        scene = this;
        for (const layer of options.layers) addLayer(layer);
        resolve();
      }
    }
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: options.parent,
        backgroundColor: options.background,
        banner: false,
        disableContextMenu: true,
        // The map handles its own pointers (gestures.js); Phaser's input would only get in the way.
        input: { mouse: false, touch: false, keyboard: false, gamepad: false },
        // Textures with power-of-two sides get mipmaps; the nearest level is used, so a picture shown at
        // about its own size looks exactly as without them and only a far zoom-out is averaged smoothly.
        render: { antialias: true, roundPixels: false, powerPreference: 'low-power', mipmapFilter: 'LINEAR_MIPMAP_NEAREST' },
        // The canvas is drawn at device resolution and shown at CSS size (zoom = 1 / dpr).
        scale: { mode: Phaser.Scale.NONE, width: Math.round(options.width * dpr), height: Math.round(options.height * dpr), zoom: 1 / dpr },
        scene: MapScene,
      });
    } catch (err) {
      reject(err);
    }
  });
  await ready;

  /**
   * Hand a finished canvas to the GPU. Not addCanvas: that makes a CanvasTexture, which reads every pixel
   * back into a second copy kept in memory (for drawing on it later) and stalls while it does. These
   * canvases are never drawn on again, so a plain texture over the canvas is all that is needed.
   * @param {string} key @param {HTMLCanvasElement} canvas
   */
  function addTexture(key, canvas) {
    scene.textures.addImage(key, canvas);
  }

  /** @param {import('./box.js').Box} rect @param {string} key @param {number} depth */
  function placeImage(rect, key, depth) {
    return scene.add.image(rect.minX, rect.minY, key).setOrigin(0, 0).setDisplaySize(rect.maxX - rect.minX, rect.maxY - rect.minY).setDepth(depth);
  }

  /** @param {Layer} layer */
  function addLayer(layer) {
    if (!scene || images.has(layer.key)) return;
    addTexture(layer.key, layer.canvas);
    images.set(layer.key, placeImage(layer.rect, layer.key, layer.depth ?? DEPTH.theater).setVisible(false));
  }

  function clearDetail() {
    if (!detail || !scene) return;
    detail.image.destroy();
    scene.textures.remove(detail.key);
    detail = null;
  }

  const camera = () => scene.cameras.main;

  return {
    /** Which renderer Phaser really got; the map needs WebGL to be fast. */
    get webgl() {
      return game.renderer.type === Phaser.WEBGL;
    },
    version: String(Phaser.VERSION),

    /** Add a baked layer, also after start-up (the sharp one is baked while the first frame shows). @param {Layer} layer */
    addLayer,

    /** Show or hide one baked layer. @param {string} key @param {boolean} visible */
    setLayerVisible(key, visible) {
      images.get(key)?.setVisible(visible);
    },

    /**
     * Show a freshly drawn canvas that covers `rect` above the overview and below the theater, and drop
     * the one it replaces. A new texture each time, because a texture cannot change size.
     * @param {HTMLCanvasElement} canvas @param {import('./box.js').Box} rect
     */
    setDetail(canvas, rect) {
      if (!scene || destroyed) return;
      const key = `detail-${++detailSerial}`;
      addTexture(key, canvas);
      const image = placeImage(rect, key, DEPTH.detail);
      clearDetail();
      detail = { key, image };
    },
    clearDetail,

    /** @param {{ cx: number, cy: number, zoom: number }} view zoom is CSS pixels per world unit */
    setView(view) {
      if (destroyed) return;
      camera().setZoom(view.zoom * dpr);
      camera().centerOn(view.cx, view.cy);
    },

    /** @param {number} width @param {number} height CSS pixels @param {number} [newDpr] */
    resize(width, height, newDpr = dpr) {
      if (destroyed) return;
      dpr = newDpr;
      game.scale.setZoom(1 / dpr);
      game.scale.resize(Math.round(width * dpr), Math.round(height * dpr));
      camera().setSize(Math.round(width * dpr), Math.round(height * dpr));
    },

    /** Stop drawing while nothing moves (saves battery), and start again for the next change. */
    sleep() {
      if (!destroyed) game.loop.sleep();
    },
    wake() {
      if (!destroyed && !game.loop.running) game.loop.wake();
    },

    destroy() {
      destroyed = true;
      try {
        game.destroy(true);
      } catch {
        // already gone
      }
    },
  };
}
