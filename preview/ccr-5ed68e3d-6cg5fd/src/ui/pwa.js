// Service worker registration, the update flow and the install prompt (ARCHITECTURE §12).
// A new version installs quietly in the background; it takes over only when the player taps
// "Reload", never by surprise in the middle of a turn.

/** @typedef {{ supported: boolean, registered: boolean, controlled: boolean, updateReady: boolean, canInstall: boolean, error: string | null }} PwaState */

export function createPwa() {
  /** @type {Set<(state: PwaState) => void>} */
  const listeners = new Set();
  /** @type {any} the browser's beforeinstallprompt event */
  let installEvent = null;
  /** @type {ServiceWorkerRegistration | null} */
  let registration = null;
  let reloadRequested = false;

  /** @type {PwaState} */
  const state = {
    supported: 'serviceWorker' in navigator,
    registered: false,
    controlled: Boolean(navigator.serviceWorker?.controller),
    updateReady: false,
    canInstall: false,
    error: null,
  };

  function notify() {
    for (const fn of listeners) fn({ ...state });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event;
    state.canInstall = true;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    state.canInstall = false;
    notify();
  });

  /** @param {ServiceWorkerRegistration} reg */
  function watch(reg) {
    const consider = () => {
      // A waiting worker while another one controls the page means an update is ready.
      if (reg.waiting && navigator.serviceWorker.controller) {
        state.updateReady = true;
        notify();
      }
    };
    consider();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') consider();
      });
    });
  }

  /** Ask the browser to look for a newer version. @returns {Promise<'unsupported' | 'error' | 'ready' | 'installing' | 'current'>} */
  async function checkForUpdates() {
    if (!registration) return 'unsupported';
    try {
      await registration.update();
    } catch {
      return 'error';
    }
    if (registration.waiting && navigator.serviceWorker.controller) return 'ready';
    if (registration.installing) return 'installing';
    return 'current';
  }

  async function start() {
    if (!state.supported) return;
    try {
      registration = await navigator.serviceWorker.register('./sw.js');
      state.registered = true;
      watch(registration);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        state.controlled = Boolean(navigator.serviceWorker.controller);
        notify();
        if (reloadRequested) location.reload();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdates();
      });
      await navigator.serviceWorker.ready;
      state.controlled = Boolean(navigator.serviceWorker.controller);
      notify();
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      notify();
    }
  }

  return {
    start,
    checkForUpdates,
    getState: () => ({ ...state }),
    /** @param {(state: PwaState) => void} fn @returns {() => void} unsubscribe */
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    /** Let the waiting version take over; the page reloads once it has. */
    applyUpdate() {
      reloadRequested = true;
      if (registration?.waiting) registration.waiting.postMessage('SKIP_WAITING');
      else location.reload();
    },
    /** Show the browser's install dialog (Chromium browsers only). */
    async promptInstall() {
      if (!installEvent) return;
      installEvent.prompt();
      await installEvent.userChoice;
      installEvent = null;
      state.canInstall = false;
      notify();
    },
  };
}
