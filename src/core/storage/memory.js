// In-memory storage. Used by tests and as the fallback when the browser blocks IndexedDB
// (for example some private modes). Values are cloned in and out, like the real thing.

/**
 * @returns {import('./types.js').Storage & { onOperation: (op: string, store: string, key?: string) => void }}
 *   `onOperation` is a hook tests can use to make operations throw.
 */
export function createMemoryStorage() {
  /** @type {Map<string, Map<string, any>>} */
  const stores = new Map();

  /** @param {string} name */
  function store(name) {
    let map = stores.get(name);
    if (!map) {
      map = new Map();
      stores.set(name, map);
    }
    return map;
  }

  const storage = {
    kind: /** @type {'memory'} */ ('memory'),
    onOperation: /** @type {(op: string, store: string, key?: string) => void} */ (() => {}),

    async get(name, key) {
      storage.onOperation('get', name, key);
      const value = store(name).get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async getAll(name) {
      storage.onOperation('getAll', name);
      return [...store(name).values()].map((value) => structuredClone(value));
    },
    async put(name, key, value) {
      storage.onOperation('put', name, key);
      store(name).set(key, structuredClone(value));
    },
    async putMany(ops) {
      for (const op of ops) storage.onOperation('put', op.store, op.key);
      const cloned = ops.map((op) => /** @type {const} */ ([op.store, op.key, structuredClone(op.value)]));
      for (const [name, key, value] of cloned) store(name).set(key, value);
    },
    async delete(name, key) {
      storage.onOperation('delete', name, key);
      store(name).delete(key);
    },
    async deleteMany(ops) {
      for (const op of ops) storage.onOperation('delete', op.store, op.key);
      for (const op of ops) store(op.store).delete(op.key);
    },
    async clear(name) {
      storage.onOperation('clear', name);
      store(name).clear();
    },
  };
  return storage;
}
