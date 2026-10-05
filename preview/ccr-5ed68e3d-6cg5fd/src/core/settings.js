// User settings (text size, ...) kept in the "settings" store. If storage fails the value still
// applies for this session; set() reports whether it was persisted.

/**
 * @template {Record<string, any>} T
 * @param {import('./storage/types.js').Storage} storage
 * @param {T} defaults
 */
export function createSettings(storage, defaults) {
  /** @type {T} */
  const values = { ...defaults };

  return {
    /** Read stored values over the defaults. Missing or unreadable values keep their default. */
    async load() {
      for (const key of Object.keys(defaults)) {
        try {
          const stored = await storage.get('settings', key);
          if (stored !== undefined) /** @type {any} */ (values)[key] = stored;
        } catch {
          // keep the default
        }
      }
      return { ...values };
    },
    /** @template {keyof T} K @param {K} key */
    get(key) {
      return values[key];
    },
    /**
     * @template {keyof T} K
     * @param {K} key
     * @param {T[K]} value
     * @returns {Promise<boolean>} true when the value was also written to storage
     */
    async set(key, value) {
      values[key] = value;
      try {
        await storage.put('settings', String(key), value);
        return true;
      } catch {
        return false;
      }
    },
    all() {
      return { ...values };
    },
  };
}
