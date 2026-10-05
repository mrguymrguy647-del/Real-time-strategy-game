// How tools and e2e tests find a browser. The cloud sandbox has Chromium pre-installed; GitHub
// runners and most dev machines have Chrome. Set CHROMIUM_PATH to force a specific binary.

import fs from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';

/** Flags that make headless WebGL work in containers (software rendering). */
export const CHROMIUM_ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** Options for playwright-core's chromium.launch(). */
export function launchOptions() {
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH, args: CHROMIUM_ARGS };
  if (fs.existsSync(SANDBOX_CHROMIUM)) return { executablePath: SANDBOX_CHROMIUM, args: CHROMIUM_ARGS };
  return { channel: /** @type {string} */ ('chrome'), args: CHROMIUM_ARGS };
}

/** Phone-like browser contexts for screenshots and tests. */
export const PHONES = {
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
