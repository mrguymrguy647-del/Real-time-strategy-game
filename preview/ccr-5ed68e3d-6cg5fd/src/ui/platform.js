// What kind of device and mode we are running in. Used for install hints and diagnostics.

/**
 * @returns {{ family: 'ios' | 'android' | 'other', ios: boolean, android: boolean, standalone: boolean }}
 */
export function detectPlatform() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so also look for a touch screen.
  const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
  return { family: ios ? 'ios' : android ? 'android' : 'other', ios, android, standalone };
}
