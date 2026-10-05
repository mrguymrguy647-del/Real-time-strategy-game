// A synthetic world-sized map, to measure how this very device draws it (ARCHITECTURE §3 and §9).
// It compares two ways of showing about 1,500 polygons of 30 vertices (the full-world budget):
//   live   - Phaser re-draws every polygon every frame
//   baked  - the polygons are drawn once into a texture that the camera simply shows
// The answer decides how the real map is built, and the Diagnostics screen reports it.

import { loadPhaser } from '../phaser.js';

const POLYGONS = 1500;
const VERTICES = 30;
const WORLD_WIDTH = 2048;
const WORLD_HEIGHT = 1024;
const WARMUP_MS = 600;
const SAMPLE_MS = 2000;
const TIMEOUT_MS = 20_000;

/** @param {number} h 0-1 @param {number} s 0-1 @param {number} v 0-1 */
function hsvToRgb(h, s, v) {
  const f = (/** @type {number} */ n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255);
}

/** The same polygons on every device: a small deterministic generator, no Math.random. */
function makePolygons() {
  let seed = 7;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const polygons = [];
  for (let i = 0; i < POLYGONS; i++) {
    const cx = rnd() * WORLD_WIDTH;
    const cy = rnd() * WORLD_HEIGHT;
    const radius = 12 + rnd() * 22;
    /** @type {number[]} */
    const points = [];
    for (let k = 0; k < VERTICES; k++) {
      const angle = (k / VERTICES) * Math.PI * 2;
      const r = radius * (0.7 + rnd() * 0.5);
      points.push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    polygons.push({ color: hsvToRgb(rnd(), 0.5, 0.8), points });
  }
  return polygons;
}

/** @param {any} renderer */
function gpuName(renderer) {
  try {
    const gl = renderer.gl;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch {
    return '?';
  }
}

/**
 * Run one mode and resolve with its average frames per second.
 * @param {any} Phaser @param {HTMLElement} parent @param {'live' | 'baked'} mode
 * @param {Array<{ color: number, points: number[] }>} polygons
 * @returns {Promise<{ fps: number, webgl: boolean, gpu: string }>}
 */
function runMode(Phaser, parent, mode, polygons) {
  return new Promise((resolve, reject) => {
    /** @type {any} */
    let game = null;
    let finished = false;
    const timer = setTimeout(() => finish(new Error('benchmark timed out')), TIMEOUT_MS);

    /** @param {Error | { fps: number, webgl: boolean, gpu: string }} outcome */
    function finish(outcome) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        game?.destroy(true);
      } catch {
        // the benchmark is over either way
      }
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    }

    class Bench extends Phaser.Scene {
      constructor() {
        super('bench');
        this.startedAt = 0;
        this.sampleStart = 0;
        this.frames = 0;
      }

      create() {
        const graphics = this.add.graphics();
        for (const polygon of polygons) {
          graphics.fillStyle(polygon.color, 1);
          graphics.lineStyle(1, 0x000000, 0.6);
          graphics.beginPath();
          graphics.moveTo(polygon.points[0], polygon.points[1]);
          for (let i = 2; i < polygon.points.length; i += 2) graphics.lineTo(polygon.points[i], polygon.points[i + 1]);
          graphics.closePath();
          graphics.fillPath();
          graphics.strokePath();
        }
        if (mode === 'baked') {
          const texture = this.add.renderTexture(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setOrigin(0, 0);
          texture.draw(graphics, 0, 0);
          // Phaser 4 buffers drawing commands until render() is called; Phaser 3 draws at once.
          if (typeof texture.render === 'function') texture.render();
          graphics.destroy();
        }
        const { width, height } = this.scale;
        this.cameras.main.setZoom(Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT)).centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
        this.startedAt = performance.now();
        this.sampleStart = 0;
        this.frames = 0;
      }

      update() {
        const now = performance.now();
        if (now - this.startedAt < WARMUP_MS) return;
        if (this.sampleStart === 0) this.sampleStart = now;
        this.frames++;
        const elapsed = now - this.sampleStart;
        if (elapsed >= SAMPLE_MS) {
          finish({ fps: (this.frames * 1000) / elapsed, webgl: this.game.renderer.type === Phaser.WEBGL, gpu: gpuName(this.game.renderer) });
        }
      }
    }

    try {
      game = new Phaser.Game({ type: Phaser.AUTO, parent, backgroundColor: '#0b1a2b', banner: false, scale: { mode: Phaser.Scale.RESIZE }, scene: Bench });
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * @param {{ parent: HTMLElement }} options an element that fills the screen (Phaser needs a real size)
 * @returns {Promise<{ version: string, webgl: boolean, gpu: string, liveFps: number, bakedFps: number }>}
 */
export async function runMapBenchmark({ parent }) {
  const Phaser = await loadPhaser();
  const polygons = makePolygons();
  const live = await runMode(Phaser, parent, 'live', polygons);
  parent.replaceChildren();
  const baked = await runMode(Phaser, parent, 'baked', polygons);
  parent.replaceChildren();
  return { version: String(Phaser.VERSION), webgl: baked.webgl, gpu: baked.gpu, liveFps: live.fps, bakedFps: baked.fps };
}
