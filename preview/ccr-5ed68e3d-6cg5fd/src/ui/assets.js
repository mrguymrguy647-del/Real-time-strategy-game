// Where to find a static image. Normally that is its relative path; in the single-file download
// (T-18) the image is a data: URL inside the page, so nothing is fetched.

/** @param {string} path a path such as "assets/icons/icon.svg" @returns {string} */
export function assetUrl(path) {
  return globalThis.__GS_INLINE__?.assets[path] ?? path;
}
