// The only file that imports Phaser (T-02, T-03). It loads on demand, so normal play never pays
// for it. Phaser 4 offers a default export; Phaser 3.90's ES build is namespace-only, so the
// adapter accepts both and everything else just uses the returned object.

/** @type {Promise<any> | null} */
let loading = null;

/** @returns {Promise<any>} the Phaser namespace */
export function loadPhaser() {
  loading ??= import('phaser').then((mod) => mod.default ?? mod);
  return loading;
}
