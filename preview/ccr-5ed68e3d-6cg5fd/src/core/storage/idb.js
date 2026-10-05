// IndexedDB storage. Every call is a promise and every failure is an exception the caller can
// handle (§11). Safari sometimes closes the connection while a page sits in the background, so a
// call that hits a closed connection reopens it and retries once.

import { APP_ID } from '../version.js';
import { STORES } from './types.js';

/** @param {unknown} err */
function isStaleConnection(err) {
  const e = /** @type {any} */ (err);
  return e?.name === 'InvalidStateError' || /clos(ed|ing)/i.test(String(e?.message ?? ''));
}

/**
 * @param {{ name?: string, factory?: IDBFactory | undefined }} [options]
 * @returns {import('./types.js').Storage}
 */
export function createIdbStorage({ name = APP_ID, factory = globalThis.indexedDB } = {}) {
  if (!factory) throw new Error('IndexedDB is not available in this browser');
  const idb = factory;
  /** @type {Promise<IDBDatabase> | null} */
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = idb.open(name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
    return dbPromise;
  }

  /**
   * Run `work` inside one transaction; resolves with its result (or its request's result)
   * once the transaction has committed.
   * @param {string[]} stores
   * @param {IDBTransactionMode} mode
   * @param {(tx: IDBTransaction) => any} work
   * @param {number} [attempt]
   * @returns {Promise<any>}
   */
  async function run(stores, mode, work, attempt = 0) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        tx.oncomplete = () => resolve(result && typeof result === 'object' && 'readyState' in result ? result.result : result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
        const result = work(tx);
      });
    } catch (err) {
      if (attempt === 0 && isStaleConnection(err)) {
        dbPromise = null;
        return run(stores, mode, work, 1);
      }
      throw err;
    }
  }

  return {
    kind: 'indexeddb',
    get: (store, key) => run([store], 'readonly', (tx) => tx.objectStore(store).get(key)),
    getAll: (store) => run([store], 'readonly', (tx) => tx.objectStore(store).getAll()),
    put: (store, key, value) =>
      run([store], 'readwrite', (tx) => {
        tx.objectStore(store).put(value, key);
      }),
    putMany: (ops) =>
      run([...new Set(ops.map((op) => op.store))], 'readwrite', (tx) => {
        for (const op of ops) tx.objectStore(op.store).put(op.value, op.key);
      }),
    delete: (store, key) =>
      run([store], 'readwrite', (tx) => {
        tx.objectStore(store).delete(key);
      }),
    deleteMany: (ops) =>
      run([...new Set(ops.map((op) => op.store))], 'readwrite', (tx) => {
        for (const op of ops) tx.objectStore(op.store).delete(op.key);
      }),
    clear: (store) =>
      run([store], 'readwrite', (tx) => {
        tx.objectStore(store).clear();
      }),
  };
}

/**
 * Prove that storage really works: write, read back and delete a small record.
 * @param {import('./types.js').Storage} storage
 */
export async function probeStorage(storage) {
  const value = { at: Date.now() };
  await storage.put('settings', '__probe', value);
  const back = await storage.get('settings', '__probe');
  await storage.delete('settings', '__probe');
  if (!back || back.at !== value.at) throw new Error('storage read-back did not match what was written');
}
