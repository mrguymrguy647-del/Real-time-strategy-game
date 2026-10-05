// Browser entry point: load the game data and UI text, open storage, register the service worker,
// then start the app. If anything essential fails the player gets a clear retry screen instead of
// a blank page.

import { loadData } from './core/data.js';
import { createSettings } from './core/settings.js';
import { createSaveManager } from './core/save.js';
import { createIdbStorage, probeStorage } from './core/storage/idb.js';
import { createMemoryStorage } from './core/storage/memory.js';
import { createApp } from './ui/app.js';
import { createPwa } from './ui/pwa.js';
import { SETTING_DEFAULTS, applySettings } from './ui/settings.js';
import { setMissingHandler, setStrings, t } from './util/i18n.js';

/** @param {string} path */
async function readJson(path) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

/** Real storage when it works; otherwise memory, so the game is still playable. */
async function openStorage() {
  try {
    const storage = createIdbStorage();
    await probeStorage(storage);
    return { storage, error: /** @type {string | null} */ (null) };
  } catch (err) {
    return { storage: createMemoryStorage(), error: err instanceof Error ? err.message : String(err) };
  }
}

async function boot() {
  const data = await loadData(readJson);
  setStrings(data.i18n.strings);
  setMissingHandler((key) => console.warn(`[i18n] missing string: ${key}`));
  document.title = t('app.title');

  const { storage, error: storageError } = await openStorage();
  const settings = createSettings(storage, SETTING_DEFAULTS);
  applySettings(await settings.load());
  const saves = createSaveManager({ storage, dataVersion: data.version });
  const buildInfo = await readJson('build-info.json').catch(() => null);

  const pwa = createPwa();
  const app = createApp({ root: /** @type {HTMLElement} */ (document.getElementById('app')), data, saves, settings, pwa, storage, storageError, buildInfo });
  app.start();
  document.getElementById('splash')?.remove();
  void pwa.start();
  Object.assign(globalThis, { __app: app }); // handy for the browser console and the e2e tests
}

/** @param {unknown} err */
function showBootError(err) {
  console.error('Boot failed', err);
  document.getElementById('splash')?.remove();
  const template = /** @type {HTMLTemplateElement | null} */ (document.getElementById('boot-error'));
  const root = document.getElementById('app');
  if (!template || !root) return;
  const view = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
  const details = view.querySelector('[data-details]');
  if (details) details.textContent = err instanceof Error ? err.message : String(err);
  view.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
  root.replaceChildren(view);
}

boot().catch(showBootError);
