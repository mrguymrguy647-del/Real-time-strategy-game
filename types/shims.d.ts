// Phaser is vendored and loaded through the import map in index.html, so it has no
// installed type package. Treat it as untyped; the adapter in src/ui/phaser.js hides it.
declare module 'phaser';

/**
 * Set by the single-file download (tools/bundle-single.mjs, ARCHITECTURE T-18) before the app
 * starts: the data files and small images live inside the page. Absent in the normal web app.
 */
declare var __GS_INLINE__: { files: Record<string, any>; assets: Record<string, string> } | undefined;
