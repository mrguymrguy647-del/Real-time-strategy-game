// The Diagnostics checks. Each check has a group, a label and an async run() that returns a value
// and a status. They tell you (and me, through "Copy report") how the game really behaves on
// this device: offline readiness, storage, speed and graphics.

import { probeStorage } from '../../core/storage/idb.js';
import { createGame } from '../../game.js';
import { cpuBenchmark } from '../../util/bench.js';
import { t, tn } from '../../util/i18n.js';
import { formatBytes } from '../format.js';
import { runMapBenchmark } from '../map/benchmark.js';

/** @typedef {'ok' | 'warn' | 'fail' | 'info'} Status */
/** @typedef {{ id: string, group: string, manual?: boolean, label: () => string, run: () => Promise<{ value: string, status: Status }> }} Check */

/** Frames per second over about one second of animation frames. @returns {Promise<number>} */
function measureFps() {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      const elapsed = performance.now() - start;
      if (elapsed >= 1000) resolve((frames * 1000) / elapsed);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Read the device's safe-area insets (notch, home bar) in CSS pixels. */
function safeAreaInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  probe.remove();
  return insets;
}

/** @param {any} ctx @returns {Check[]} */
export function createChecks(ctx) {
  const platformName = () => ({ ios: t('diag.platform.ios'), android: t('diag.platform.android'), other: t('diag.platform.generic') })[/** @type {'ios' | 'android' | 'other'} */ (ctx.platform.family)];

  return [
    {
      id: 'build',
      group: 'app',
      label: () => t('diag.build.label'),
      async run() {
        const info = ctx.buildInfo;
        if (!info) return { status: 'fail', value: t('diag.build.missing') };
        return { status: 'ok', value: t('diag.build.value', { version: info.version, commit: info.commit, hash: info.hash, built: String(info.builtAt).slice(0, 10) }) };
      },
    },
    {
      id: 'mode',
      group: 'app',
      label: () => t('diag.mode.label'),
      async run() {
        const mode = ctx.platform.singleFile ? t('diag.mode.file') : ctx.platform.standalone ? t('diag.mode.installed') : t('diag.mode.browser');
        return { status: 'info', value: `${mode} · ${platformName()}` };
      },
    },
    {
      id: 'display',
      group: 'app',
      label: () => t('diag.display.label'),
      async run() {
        const orientation = innerWidth >= innerHeight ? t('diag.display.landscape') : t('diag.display.portrait');
        return { status: 'info', value: t('diag.display.value', { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, orientation }) };
      },
    },
    {
      id: 'safeArea',
      group: 'app',
      label: () => t('diag.safeArea.label'),
      async run() {
        const { top, bottom, left, right } = safeAreaInsets();
        return { status: 'info', value: t('diag.safeArea.value', { top, bottom, left, right }) };
      },
    },
    {
      id: 'sw',
      group: 'offline',
      label: () => t('diag.sw.label'),
      async run() {
        if (ctx.platform.singleFile) return { status: 'info', value: t('diag.file.na') };
        const pwa = ctx.pwa.getState();
        if (!pwa.supported) return { status: 'fail', value: t('diag.sw.unsupported') };
        if (pwa.error) return { status: 'fail', value: t('diag.sw.error', { error: pwa.error }) };
        if (!pwa.registered) return { status: 'warn', value: t('diag.sw.registering') };
        return pwa.controlled ? { status: 'ok', value: t('diag.sw.controlling') } : { status: 'warn', value: t('diag.sw.notControlling') };
      },
    },
    {
      id: 'cache',
      group: 'offline',
      label: () => t('diag.cache.label'),
      async run() {
        if (ctx.platform.singleFile) return { status: 'info', value: t('diag.file.na') };
        if (!('caches' in window)) return { status: 'fail', value: t('diag.cache.unavailable') };
        if (!ctx.buildInfo) return { status: 'warn', value: t('diag.build.missing') };
        const name = `gs-${ctx.buildInfo.hash}`;
        if (!(await caches.has(name))) return { status: 'warn', value: t('diag.cache.none') };
        const have = (await (await caches.open(name)).keys()).length;
        const want = ctx.buildInfo.files.length + 2; // every file, build-info.json and the start URL
        return { status: have >= want ? 'ok' : 'warn', value: t('diag.cache.value', { have, want }) };
      },
    },
    {
      id: 'update',
      group: 'offline',
      label: () => t('diag.update.label'),
      async run() {
        if (ctx.platform.singleFile) return { status: 'info', value: t('diag.file.na') };
        return ctx.pwa.getState().updateReady ? { status: 'warn', value: t('diag.update.ready') } : { status: 'ok', value: t('diag.update.none') };
      },
    },
    {
      id: 'storage',
      group: 'storage',
      label: () => t('diag.storage.label'),
      async run() {
        if (ctx.storageKind !== 'indexeddb') return { status: 'warn', value: t('diag.storage.memory', { error: ctx.storageError ?? '-' }) };
        try {
          await probeStorage(ctx.storage);
          return { status: 'ok', value: t('diag.storage.idb') };
        } catch (err) {
          return { status: 'fail', value: t('diag.storage.failed', { error: err instanceof Error ? err.message : String(err) }) };
        }
      },
    },
    {
      id: 'persist',
      group: 'storage',
      label: () => t('diag.persist.label'),
      async run() {
        if (!navigator.storage?.persisted) return { status: 'info', value: t('diag.persist.unsupported') };
        return (await navigator.storage.persisted()) ? { status: 'ok', value: t('diag.persist.yes') } : { status: 'warn', value: t('diag.persist.no') };
      },
    },
    {
      id: 'usage',
      group: 'storage',
      label: () => t('diag.usage.label'),
      async run() {
        if (!navigator.storage?.estimate) return { status: 'info', value: t('diag.persist.unsupported') };
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        return { status: 'info', value: t('diag.usage.value', { used: formatBytes(usage), quota: formatBytes(quota) }) };
      },
    },
    {
      id: 'saves',
      group: 'storage',
      label: () => t('diag.saves.label'),
      async run() {
        try {
          const list = await ctx.saves.list();
          return { status: 'info', value: tn('diag.saves.value', list.length) };
        } catch {
          return { status: 'fail', value: t('diag.saves.failed') };
        }
      },
    },
    {
      id: 'fps',
      group: 'performance',
      label: () => t('diag.fps.label'),
      async run() {
        if (document.visibilityState !== 'visible') return { status: 'info', value: t('diag.fps.hidden') };
        const fps = await measureFps();
        return { status: fps >= 50 ? 'ok' : fps >= 30 ? 'warn' : 'fail', value: t('diag.fps.value', { fps: Math.round(fps) }) };
      },
    },
    {
      id: 'cpu',
      group: 'performance',
      label: () => t('diag.cpu.label'),
      async run() {
        return { status: 'info', value: t('diag.cpu.value', { ms: cpuBenchmark({ rounds: 3 }).toFixed(1) }) };
      },
    },
    {
      id: 'turns',
      group: 'performance',
      label: () => t('diag.turns.label'),
      async run() {
        const game = createGame({ data: ctx.data, seed: 1 });
        const turns = 200;
        const start = performance.now();
        for (let i = 0; i < turns; i++) game.endTurn();
        return { status: 'info', value: t('diag.turns.value', { ms: ((performance.now() - start) / turns).toFixed(3), turns }) };
      },
    },
    {
      id: 'webgl',
      group: 'graphics',
      label: () => t('diag.webgl.label'),
      async run() {
        const canvas = document.createElement('canvas');
        const gl = /** @type {WebGL2RenderingContext | WebGLRenderingContext | null} */ (canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
        if (!gl) return { status: 'fail', value: t('diag.webgl.no') };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
        const version = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'WebGL 2' : 'WebGL 1';
        return { status: 'ok', value: t('diag.webgl.yes', { version, gpu }) };
      },
    },
    {
      id: 'mapBench',
      group: 'graphics',
      manual: !ctx.platform.singleFile, // the downloaded file has no Phaser: show that at once instead of offering a button
      label: () => t('diag.mapBench.label'),
      async run() {
        if (ctx.platform.singleFile) return { status: 'info', value: t('diag.mapBench.notIncluded') };
        const stage = document.querySelector('[data-bench-stage]');
        if (!stage) return { status: 'fail', value: t('diag.mapBench.failed', { error: 'no stage' }) };
        try {
          const r = await runMapBenchmark({ parent: /** @type {HTMLElement} */ (stage) });
          const value = t('diag.mapBench.value', { version: r.version, live: Math.round(r.liveFps), baked: Math.round(r.bakedFps), gpu: r.gpu });
          if (!r.webgl) return { status: 'warn', value: `${value} ${t('diag.mapBench.noWebgl')}` };
          return { status: r.bakedFps >= 30 ? 'ok' : r.bakedFps >= 20 ? 'warn' : 'fail', value };
        } catch (err) {
          return { status: 'fail', value: t('diag.mapBench.failed', { error: err instanceof Error ? err.message : String(err) }) };
        }
      },
    },
  ];
}

/**
 * A plain-text report to paste into a chat.
 * @param {Array<{ label: string, value: string, status: Status }>} rows
 */
export function buildReport(rows) {
  const word = { ok: t('diag.status.ok'), warn: t('diag.status.warn'), fail: t('diag.status.fail'), info: t('diag.status.info') };
  return [
    t('diag.report.title'),
    new Date().toISOString(),
    navigator.userAgent,
    '',
    ...rows.map((row) => `[${word[row.status]}] ${row.label}: ${row.value}`),
  ].join('\n');
}
