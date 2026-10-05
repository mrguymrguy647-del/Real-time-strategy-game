# Real-time-strategy-game

An offline, turn-based, modern-era grand strategy game for phones (working title *Grand Strategy*). Every country in the world is AI-controlled; you pick one. War, economy, resources, diplomacy, technology and government all feed each other, so every success creates a new problem.

**Status:** Phase 0b — the installable, offline-capable app shell exists and is tested. It contains a small test game (calendar, seeded dice, saves) plus a Diagnostics screen; the real game starts in Phase 1.

## Try it on your phone

Every push builds a preview of its branch:

`https://mrguymrguy647-del.github.io/Real-time-strategy-game/preview/<branch>/`

(for the current work branch: `…/preview/ccr-5ed68e3d-6cg5fd/`; the list of all previews is at `…/preview/`).

**One-time setup (needed once, after the first successful deploy):** open `https://github.com/mrguymrguy647-del/Real-time-strategy-game/settings/pages` in your phone's browser (signed in as the repo owner; the GitHub app cannot change this). Set **Source** to *Deploy from a branch*, then **Branch** to `gh-pages` and folder `/ (root)`, and save. The first publish takes a minute or two; the page then says "Your site is live at …". If Settings looks cramped, use the browser's *Desktop site* option.

**Install it**
- **Android (Chrome):** open the preview link → tap *Install* on the title screen (or the ⋮ menu → *Install app*) → open it from the new Home Screen icon.
- **iPhone / iPad (Safari):** open the preview link → tap the Share button → *Add to Home Screen*.

**What to check** (open *Diagnostics* in the app and tap *Copy report* to send me the result)
1. Opens from the Home Screen icon, full screen.
2. Switch on airplane mode → it still opens and a test game still works.
3. Start a test game, end a few turns, save, close the app, reopen → *Continue* is there.
4. Rotate the phone: both orientations are usable.

## Develop

Node 22 or newer. No bundler; the only runtime file is the vendored Phaser.

```text
npm ci               install dev tools (ajv, typescript, playwright-core)
npm test             unit tests, data validation and a simulation soak
npm run typecheck    JSDoc type check of src/
npm run build        build the site into dist/
npm run serve        build and serve dist/ at http://127.0.0.1:4173/
npm run e2e          Playwright tests in a phone-sized Chromium
npm run screenshot   phone screenshots of every screen into tmp/screenshots/
npm run validate     validate everything in data/
npm run simulate     headless game runs (--seeds 1,2,3 --turns 120, --bench)
```

## Documents

- [GAME_DESIGN.md](GAME_DESIGN.md) — what the game is: the full spec, decision log and draft formulas
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it is built
- [docs/DATA_SCHEMAS.md](docs/DATA_SCHEMAS.md) — JSON formats for countries, regions, resources, governments and more
- [docs/RISKS_AND_QUESTIONS.md](docs/RISKS_AND_QUESTIONS.md) — decisions and the risk register
- [CLAUDE.md](CLAUDE.md) — working rules and current status for Claude Code sessions

## Plan

Built phase by phase, each one playable and deployed: setup → Middle East MVP → war depth and governments → diplomacy → technology → the whole world → replayability → polish. See GAME_DESIGN.md §12.
