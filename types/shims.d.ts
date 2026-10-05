// Phaser is vendored and loaded through the import map in index.html, so it has no
// installed type package. Treat it as untyped; the adapter in src/ui/phaser.js hides it.
declare module 'phaser';
