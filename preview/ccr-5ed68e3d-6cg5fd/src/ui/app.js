// The app shell: a hash router, the current game session, autosave, and the helpers every screen
// uses through `ctx`. Screens are functions that return { el, destroy? }. Hash routes
// (#/play, #/saves, ...) keep deep links and the system back gesture working on a static host.

import { createGame } from '../game.js';
import { t } from '../util/i18n.js';
import { confirmDialog, openDialog } from './components/dialog.js';
import { createToasts } from './components/toast.js';
import { saveErrorText } from './errors.js';
import { slotLabel } from './format.js';
import { detectPlatform } from './platform.js';
import { mountDiagnostics } from './screens/diagnostics.js';
import { mountMap } from './screens/map.js';
import { mountPick, SCENARIO_ID } from './screens/pick.js';
import { mountPlay } from './screens/play.js';
import { mountSaves } from './screens/saves.js';
import { mountSettings } from './screens/settings.js';
import { mountTitle } from './screens/title.js';

const ROUTES = {
  title: mountTitle,
  map: mountMap,
  pick: mountPick,
  play: mountPlay,
  saves: mountSaves,
  settings: mountSettings,
  diagnostics: mountDiagnostics,
};

/** @returns {number} a fresh seed for a new game (UI-level randomness, not simulation code) */
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/**
 * @param {{ root: HTMLElement, data: import('../core/data.js').GameData,
 *   saves: ReturnType<typeof import('../core/save.js').createSaveManager>,
 *   settings: ReturnType<typeof import('../core/settings.js').createSettings>,
 *   pwa: ReturnType<typeof import('./pwa.js').createPwa>,
 *   storage: import('../core/storage/types.js').Storage, storageError: string | null,
 *   buildInfo: any, readJson: (path: string) => Promise<any> }} options
 */
export function createApp({ root, data, saves, settings, pwa, storage, storageError, buildInfo, readJson }) {
  const toasts = createToasts(document.body);
  /** @type {{ game: import('../game.js').Game | null, lastManualSlot: string, persistAsked: boolean }} */
  const session = { game: null, lastManualSlot: 'manual-1', persistAsked: false };
  /** @type {{ el: HTMLElement, destroy?: () => void } | null} */
  let screen = null;
  /** @type {Array<() => void>} */
  let gameSubscriptions = [];

  async function autosave() {
    const game = session.game;
    if (!game) return;
    try {
      await saves.autosave(game.state);
      if (!session.persistAsked) {
        // Ask the browser not to evict our data; harmless if unsupported or declined.
        session.persistAsked = true;
        void navigator.storage?.persist?.().catch(() => {});
      }
    } catch {
      toasts.show(t('play.autosaveFailed'), { duration: 7000 });
    }
  }

  /** @param {import('../game.js').Game | null} game */
  function attach(game) {
    for (const off of gameSubscriptions) off();
    gameSubscriptions = [];
    session.game = game;
    if (game) gameSubscriptions.push(game.bus.on('turn:end', autosave));
  }

  const ctx = {
    data,
    saves,
    settings,
    pwa,
    storage,
    storageKind: storage.kind,
    storageError,
    buildInfo,
    readJson,
    platform: detectPlatform(),
    session,
    toast: toasts.show,
    confirm: confirmDialog,
    dialog: openDialog,

    /** @param {string} next */
    navigate(next) {
      const name = Object.hasOwn(ROUTES, next) ? /** @type {keyof typeof ROUTES} */ (next) : 'title';
      if (route !== name) {
        route = name;
        setHash(name);
      }
      render();
    },
    /** Back goes to the game if one is running, otherwise to the title. */
    back() {
      ctx.navigate(session.game ? 'play' : 'title');
    },
    /** Begin a new game as this country (chosen on the picker screen). @param {string} countryId */
    startGame(countryId) {
      attach(createGame({ data, seed: randomSeed(), scenarioId: SCENARIO_ID, playerId: countryId }));
      void autosave(); // so Continue finds this game even if the app is closed before the first turn ends
      ctx.navigate('play');
    },
    /** @param {any} state a loaded or imported saved state */
    openState(state) {
      attach(createGame({ data, state }));
      ctx.navigate('play');
    },
    quitToTitle() {
      attach(null);
      ctx.navigate('title');
    },
    async continueLatest() {
      try {
        const latest = await saves.loadLatest();
        if (!latest) return;
        if (latest.skipped.length > 0) toasts.show(t('title.skipped', { slots: latest.skipped.join(', ') }), { duration: 7000 });
        if (latest.dataMismatch) toasts.show(t('saves.dataMismatch'), { duration: 7000 });
        ctx.openState(latest.state);
      } catch (err) {
        toasts.show(saveErrorText(err), { duration: 7000 });
      }
    },
    /** Save to the manual slot used last (manual-1 at first). */
    async quickSave() {
      const game = session.game;
      if (!game) return;
      try {
        await saves.save(session.lastManualSlot, game.state);
        toasts.show(t('play.saved', { slot: slotLabel(session.lastManualSlot) }));
      } catch (err) {
        toasts.show(saveErrorText(err), { duration: 7000 });
      }
    },
  };

  /** The screen named by the URL hash (#/play, #/saves, ...); anything unknown is the title. */
  function routeFromHash() {
    const name = location.hash.replace(/^#\/?/, '').split('?')[0] || 'title';
    return Object.hasOwn(ROUTES, name) ? /** @type {keyof typeof ROUTES} */ (name) : 'title';
  }

  /** The hash mirrors the current screen so deep links and the back gesture work, but the app does not depend on it: some viewers refuse to change the URL. */
  let route = routeFromHash();

  /** @param {string} name @param {boolean} [replace] */
  function setHash(name, replace = false) {
    try {
      if (replace) location.replace(`#/${name}`);
      else location.hash = `#/${name}`;
    } catch {
      // The screen still changes; there is just no history entry for it.
    }
  }

  function render() {
    if (route === 'play' && !session.game?.state.player.countryId) {
      route = 'title'; // nothing to play yet, for example after a reload
      setHash(route, true);
    }
    screen?.destroy?.();
    screen = null;
    try {
      screen = ROUTES[route](ctx);
    } catch (err) {
      // For example a saved game with something missing: say so and go back to the title, never leave a dead screen.
      console.error(`The "${route}" screen could not be built`, err);
      if (route === 'title') throw err;
      toasts.show(t('app.screenFailed'), { duration: 7000 });
      route = 'title';
      setHash(route, true);
      screen = ROUTES.title(ctx);
    }
    root.replaceChildren(screen.el);
    window.scrollTo(0, 0);
  }

  let updateAnnounced = false;
  pwa.subscribe((state) => {
    if (state.updateReady && !updateAnnounced) {
      updateAnnounced = true;
      toasts.show(t('update.ready'), { actionLabel: t('update.reload'), onAction: () => pwa.applyUpdate(), duration: 0 });
    }
  });

  // The back gesture or a typed URL changes the hash; our own navigate() has already shown that screen.
  window.addEventListener('hashchange', () => {
    const next = routeFromHash();
    if (next === route) return;
    route = next;
    render();
  });
  return { start: render, ctx };
}
