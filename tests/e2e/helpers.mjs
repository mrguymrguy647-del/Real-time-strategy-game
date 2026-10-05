// Shared setup for the e2e tests: a phone-sized browser context that records console errors.

import { chromium } from 'playwright-core';
import { PHONES, launchOptions } from '../../tools/lib/browser.mjs';
import { startSite } from '../../tools/lib/site.mjs';

/** Build and serve the site and launch a browser. Call from before(); pass the result to stop(). */
export async function startEnvironment() {
  const site = await startSite();
  const browser = await chromium.launch(launchOptions());
  return { site, browser };
}

/** @param {{ site: { close: () => Promise<void> } | undefined, browser: { close: () => Promise<void> } | undefined }} env */
export async function stopEnvironment(env) {
  await env.browser?.close();
  await env.site?.close();
}

/**
 * A fresh browser context (new storage, new service worker) behaving like a phone.
 * @param {import('playwright-core').Browser} browser
 * @param {'portrait' | 'landscape' | 'small'} [kind]
 * @param {import('playwright-core').BrowserContextOptions} [options]
 */
export async function freshPage(browser, kind = 'portrait', options = {}) {
  const context = await browser.newContext({ ...PHONES[kind], ...options });
  const page = await context.newPage();
  /** @type {string[]} */
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  return { context, page, problems };
}

/** A button found by its exact visible name. @param {import('playwright-core').Page | import('playwright-core').Locator} where @param {string} name */
export function button(where, name) {
  return where.getByRole('button', { name, exact: true });
}
