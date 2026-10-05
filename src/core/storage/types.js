// The storage contract the save manager depends on. Two implementations: memory.js (tests and
// the fallback when the browser blocks storage) and idb.js (IndexedDB, the real thing).
// This file has no runtime code; it only holds the type.

/**
 * @typedef {object} Storage
 * @property {'memory' | 'indexeddb'} kind
 * @property {(store: string, key: string) => Promise<any>} get  resolves undefined when absent
 * @property {(store: string) => Promise<any[]>} getAll  every value in the store
 * @property {(store: string, key: string, value: any) => Promise<void>} put
 * @property {(ops: Array<{ store: string, key: string, value: any }>) => Promise<void>} putMany  all or nothing
 * @property {(store: string, key: string) => Promise<void>} delete
 * @property {(ops: Array<{ store: string, key: string }>) => Promise<void>} deleteMany  all or nothing
 * @property {(store: string) => Promise<void>} clear
 */

/** Object stores used by the game. */
export const STORES = ['saves', 'slots', 'settings'];
