// A tiny publish/subscribe bus so the UI can react to the game ("turn:end", "turn:failed").
// The simulation never reads from it; systems talk through state, so determinism is safe.

export function createBus() {
  /** @type {Map<string, Set<(payload: any) => void>>} */
  const handlers = new Map();

  return {
    /**
     * Subscribe; returns the function that unsubscribes.
     * @param {string} type
     * @param {(payload: any) => void} fn
     */
    on(type, fn) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    },
    /**
     * Deliver to every subscriber. A failing handler is logged and never stops the others.
     * @param {string} type
     * @param {any} [payload]
     */
    emit(type, payload) {
      for (const fn of [...(handlers.get(type) ?? [])]) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[bus] handler for "${type}" failed`, err);
        }
      }
    },
    clear() {
      handlers.clear();
    },
  };
}
