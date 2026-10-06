# Real-time-strategy-game

An offline, turn-based, modern-era grand strategy game for phones (working title *Grand Strategy*). Every country in the world is AI-controlled; you pick one. War, economy, resources, diplomacy, technology and government all feed each other, so every success creates a new problem.

**Status:** Phase 1, milestone M1.1b — you can pick a country on the map of the 16-country Middle East (the rest of the world is grey), end turns month by month, read a monthly report that explains every money line, and set your taxes and spending in a budget. The app shell from Phase 0b (offline, installable, saves, Diagnostics) is still there. Resources, war and diplomacy come next.

## Try it on your phone

### Fastest: download one file (no GitHub setting needed)

Every push also publishes the whole game as a single file (about 2 MB, the map included). Tap to download it, then open it with Chrome. It plays offline, but it cannot be installed as an app or update itself.

- Download (this work branch): https://github.com/mrguymrguy647-del/Real-time-strategy-game/releases/download/download-ccr-5ed68e3d-6cg5fd/grand-strategy.html
- Release page (all builds): https://github.com/mrguymrguy647-del/Real-time-strategy-game/releases

If the file opens as plain text instead of the game, open your phone's *Files* or *Downloads* app, tap the file and choose Chrome. Rebuild it yourself with `npm run build:single`.

### Installable app (web link)

Every push builds a preview of its branch. Links (tap them):

- This work branch: https://mrguymrguy647-del.github.io/Real-time-strategy-game/preview/ccr-5ed68e3d-6cg5fd/
- All previews: https://mrguymrguy647-del.github.io/Real-time-strategy-game/preview/

Installing it from the link is how you get the real app. Android has no APK: Chrome's Install puts it on your Home Screen.

**One-time setup (needed once, after the first successful deploy).** Until you do this, the links above show "404".
1. Open https://github.com/mrguymrguy647-del/Real-time-strategy-game/settings/pages in your phone's browser, signed in as the repo owner (the GitHub app cannot change this).
2. Under *Build and deployment*, keep **Source** on *Deploy from a branch*. Open the **Branch** dropdown (it says *None*), pick `gh-pages`, keep `/ (root)`, and tap **Save**.
3. Wait a minute or two. The page then says "Your site is live at …".

If Settings looks cramped, use the browser's *Desktop site* option.

**Install it**
- **Android (Chrome):** open the preview link → tap *Install* on the title screen (or the ⋮ menu → *Install app*) → open it from the new Home Screen icon.
- **iPhone / iPad (Safari):** open the preview link → tap the Share button → *Add to Home Screen*.

**Play a month.** On the title screen tap **New game**, tap a country on the map (or in the strip along the top) and then **Play as …**. Your country is outlined in teal. Tap **Budget** to set the tax rate and four spending shares with the + and − buttons (the forecast at the top shows next month), then **End turn**: the **monthly report** opens, and tapping a line (Income, Spending, Interest, Growth) shows how it is worked out. **Report** brings it back, and tapping any country shows its numbers.

**Try the map on its own.** On the title screen tap **Explore the map**. Drag to move, pinch to zoom (or use the + and − buttons), tap a country: a panel shows its facts, and the chips at the bottom of the panel switch between its regions. ⌖ returns to the Middle East and the globe button shows the whole world. The rest of the world is drawn in grey; tapping a grey country shows its name (it is not playable yet). If the map feels slow, open Settings → Map → *Middle East only*.

**What to check** (open *Diagnostics* in the app and tap *Copy report* to send me the result)
1. Opens from the Home Screen icon, full screen.
2. Switch on airplane mode → it still opens and a game still works.
3. Start a game, end a few turns, close the app, reopen → *Continue* is there and shows your country.
4. Rotate the phone: both orientations are usable.

## Develop

Node 22 or newer. No bundler; the only runtime file is the vendored Phaser.

```text
npm ci               install dev tools (ajv, typescript, playwright-core, mapshaper)
npm test             unit tests, data validation and a simulation soak
npm run typecheck    JSDoc type check of src/
npm run build        build the site into dist/
npm run build:single build the one-file download into dist-single/
npm run build:map    rebuild the map geometry (data/map/*.topo.json: the theater and the grey world) and the generated fields of data/regions.json (downloads Natural Earth into .cache/ the first time; add -- --only world or -- --only theater for one file)
npm run serve        build and serve dist/ at http://127.0.0.1:4173/
npm run e2e          Playwright tests in a phone-sized Chromium
npm run screenshot   phone screenshots of every screen into tmp/screenshots/
npm run validate     validate everything in data/
npm run simulate     headless game runs (--seeds 1,2,3 --turns 120, --report for the economies, --player EGY, --bench)
```

## Documents

- [GAME_DESIGN.md](GAME_DESIGN.md) — what the game is: the full spec, decision log and draft formulas
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it is built
- [docs/DATA_SCHEMAS.md](docs/DATA_SCHEMAS.md) — JSON formats for countries, regions, resources, governments and more
- [docs/RISKS_AND_QUESTIONS.md](docs/RISKS_AND_QUESTIONS.md) — decisions and the risk register
- [CLAUDE.md](CLAUDE.md) — working rules and current status for Claude Code sessions

## Plan

Built phase by phase, each one playable and deployed: setup → Middle East MVP → war depth and governments → diplomacy → technology → the whole world → replayability → polish. See GAME_DESIGN.md §12.
