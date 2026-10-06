// The only file that talks to Phaser for the map (T-02): it shows baked canvases through a camera and
// nothing else. All input, labels and selection live in HTML on top of it, so Phaser is just the
// GPU-backed pan/zoom surface. World units are the pixels of the sharpest texture; y points down.

import { loadPhaser } from '../phaser.js';

/**
 * @typedef {{ key: string, canvas: HTMLCanvasElement, worldWidth: number }} Layer a baked canvas that covers the whole world
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
        render: { antialias: true, roundPixels: false, powerPreference: 'low-power' },
        // The canvas is drawn at device resolution and shown at CSS size (zoom = 1 / dpr).
        scale: { mode: Phaser.Scale.NONE, width: Math.round(options.width * dpr), height: Math.round(options.height * dpr), zoom: 1 / dpr },
        scene: MapScene,
      });
    } catch (err) {
      reject(err);
    }
  });
  await ready;

  /** @param {Layer} layer */
  function addLayer(layer) {
    if (!scene || images.has(layer.key)) return;
    scene.textures.addCanvas(layer.key, layer.canvas);
    const image = scene.add.image(0, 0, layer.key).setOrigin(0, 0).setScale(layer.worldWidth / layer.canvas.width).setVisible(false);
    images.set(layer.key, image);
  }

  const camera = () => scene.cameras.main;

  return {
    /** Which renderer Phaser really got; the map needs WebGL to be fast. */
    get webgl() {
      return game.renderer.type === Phaser.WEBGL;
    },
    version: String(Phaser.VERSION),

    /** Add a baked level of detail after start-up (the sharp one is baked while the first frame shows). @param {Layer} layer */
    addLayer,

    /** Show exactly one baked layer. @param {string} key */
    showLayer(key) {
      for (const [k, image] of images) image.setVisible(k === key);
    },

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
