// Getting files and text in and out of a phone browser: the share sheet (iOS "Save to Files"),
// plain downloads, a file picker, and the clipboard.

import { h } from './dom.js';

/**
 * Give the player a file. Prefers the system share sheet (works inside an installed iOS app),
 * falls back to a normal download.
 * @param {{ bytes: Uint8Array, filename: string, mime: string }} file
 * @returns {Promise<'shared' | 'downloaded' | 'cancelled'>}
 */
export async function deliverFile({ bytes, filename, mime }) {
  const file = new File([/** @type {BlobPart} */ (bytes)], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (/** @type {any} */ (err)?.name === 'AbortError') return 'cancelled';
      // Sharing failed for another reason; fall through to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: filename, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/**
 * Open the system file picker. Resolves null if the player cancels. No `accept` filter on purpose:
 * iOS greys out files whose type it does not know, and save files use a custom extension.
 * @returns {Promise<File | null>}
 */
export function pickFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', hidden: true });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

/**
 * Copy text to the clipboard. Falls back to a hidden textarea for browsers without the async API.
 * @param {string} text
 * @returns {Promise<boolean>} whether it worked
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { readOnly: true, value: text, class: 'offscreen' });
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
