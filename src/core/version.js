// Identifiers shared by saves, storage and exports. Bump SAVE_VERSION whenever the shape of
// a saved game changes, and add a migration for the old version in migrations.js.

export const APP_ID = 'grand-strategy';
export const SAVE_VERSION = 3;
/** Saves from before this version lack what the game needs (a country, resources, the market) and cannot be continued (see migrations.js). */
export const OLDEST_PLAYABLE_SAVE = 3;
export const EXPORT_FORMAT = 'grand-strategy-save';
export const EXPORT_FORMAT_VERSION = 1;
