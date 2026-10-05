// Typed errors so the UI can show the right message without parsing text.

/**
 * Problems while saving, loading, importing or exporting.
 * Codes: bad_slot, not_found, write_failed, read_failed, bad_file, too_new,
 * migration_missing, migration_failed, storage_unavailable.
 */
export class SaveError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'SaveError';
    this.code = code;
  }
}

/** Problems while loading or checking the JSON content in /data. */
export class DataError extends Error {
  /**
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'DataError';
  }
}
