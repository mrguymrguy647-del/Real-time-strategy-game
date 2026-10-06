// The only file that imports Phaser (T-02, T-03). It loads on demand, so normal play never pays
// for it. Phaser 4 offers a default export; Phaser 3.90's ES build is namespace-only, so the
// adapter accepts both and everything else just uses the returned object.
//
// The one-file download cannot fetch a second file, so it carries Phaser inside the page and supplies
// its own loader as globalThis.__GS_LOAD_PHASER__ (tools/single.runtime.js).

/** @type {Promise<any> | null} */
let loading = null;

/** @returns {Promise<any>} the Phaser namespace */
export function loadPhaser() {
  if (loading) return loading;
  const inline = /** @type {any} */ (globalThis).__GS_LOAD_PHASER__;
  const attempt = (typeof inline === 'function' ? inline() : import('phaser'))
    .then((/** @type {any} */ mod) => mod.default ?? mod)
    .catch((/** @type {unknown} */ err) => {
      if (loading === attempt) loading = null; // a failed load can be tried again (a memory squeeze, say)
      throw err;
    });
  loading = attempt;
  return attempt;
}
