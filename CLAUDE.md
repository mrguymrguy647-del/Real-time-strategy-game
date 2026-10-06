# CLAUDE.md

Guide for Claude Code sessions on this repository. Read it first. It is short on purpose.

## Project

Offline, turn-based, modern-era grand strategy game for phones (installable PWA). Every country is AI-controlled; the player picks one. 1 turn = 1 month.

- Design: `GAME_DESIGN.md` (spec §1–§12, decision log G-nn, draft formulas)
- Architecture: `docs/ARCHITECTURE.md` (decisions T-nn)
- Data formats: `docs/DATA_SCHEMAS.md`
- Open questions and risks: `docs/RISKS_AND_QUESTIONS.md` (Q1…, R1…)

## Current status — update at the end of every session

- **Phase 0a: design documents approved by the user (2026-10-05).** Decided: Phaser 4.2.1 · no bundler · `gh-pages` branch with per-branch previews · 16-country Middle East roster · Regional Power score goal · approval gate after 0b and after each phase · **G-30: English only, all UI text in `data/i18n/en.json`**.
- **Phase 0b is approved** (2026-10-06, tested on the user's Android phone: install, airplane mode, save survives, both orientations). They kept the repo name and the title "Grand Strategy". Their Diagnostics report came as template text only: ask again for real-phone numbers (CPU speed, map speed test).
- **Phase 1 is in progress; M1.1a (the interactive map) is built and published as a preview** (G-32, ARCHITECTURE §9.6/§17): the title screen's *Explore the map* opens a Phaser map of the 16-country Middle East with pan, pinch-zoom, tap-to-select and a country/region info panel (bottom sheet in portrait, side sheet in landscape). **The user tested it on Android Chrome: it feels good** (Q7 table approved too). They then asked for **the whole world in grey** (G-34, ARCHITECTURE §9.7: not playable, never in the simulation or `countries.json`; Settings → Map → *Middle East only* is the way back if it hurts their phone; tell them how it measured). Next: M1.1b (economy skeleton, country picker, report) → M1.2 … M1.5 (GAME_DESIGN Appendix C); wait for approval after Phase 1.
- **The one-file download exists** (T-18): the user asked for a download link instead of the Pages setting, so CI also publishes `grand-strategy.html` as a Release asset and it was sent to them directly. It carries Phaser as base64 and loads it through a Blob URL on first use (RISKS R18), so the map works from the file too. It is a way to try the game, not the product; the web build stays the real app.
- **Things only a real phone can confirm** (the sandbox cannot): installing to the Home Screen, airplane-mode launch, export/import through the iOS share sheet, touch feel of the map (pan, pinch, tap), real Phaser speed and sharpness at deep zoom (Diagnostics → Map speed test; sandbox Node reference for the CPU benchmark is about 15 ms via `npm run simulate -- --bench`).
- **The user's phone is Android (Chrome)** (they said so after the 0b hand-off). Lead install and test instructions with Chrome, but keep iOS Safari working (T-17). **Open, not blocking:** repo rename (default keep), game title (default "Grand Strategy"). GitHub Pages is on (the user installed and tested the app from the preview link, so a CI push does publish the site: RISKS R7). The sandbox cannot reach `github.io` (proxy 403), so check a deploy through the `gh-pages` branch (`get_file_contents` of `preview/<branch>/build-info.json`, ref `refs/heads/gh-pages`) and the live URL only through the user.
- **Git:** develop only on the branch the session names; never push elsewhere; no pull requests unless asked.

## The user

Develops entirely from a phone through Claude Code. Therefore:
- Everything must be testable in a mobile browser. Give a preview URL or a screenshot when something visible changes.
- Keep chat replies short and scannable: bullets, no wide tables, plain words. Say plainly what works, what doesn't, and what is next.
- Ask for decisions with a recommended default, so "approved" is a valid answer.
- Give links as plain URLs on their own line, never inside backticks: code-formatted text is not tappable in the Claude app.
- "Download link" means a tappable link that gets the game onto the phone. Give the **single-file download** (GitHub Release asset `download-<branch>/grand-strategy.html`, built by CI; or send `dist-single/grand-strategy.html` with SendUserFile) and the installable web link. There is no APK (Q18, parked).

## Working rules (from the user)

1. **Don't build everything at once.** Phase by phase; wait for approval between phases.
2. After every phase the game is **playable and deployable**. Never leave the project broken.
3. **Small, focused files**, one system per module (soft limit 300 lines, hard 500; data JSON excluded).
4. **All content is JSON** in `data/`: countries, regions, resources, governments, traits, events, technologies, scenarios. Nothing content-like is hard-coded in logic.
5. Core formulas (combat, economy, endurance, stability) are **pure functions with unit tests**.
6. When the spec is ambiguous, choose the simplest version that keeps the intent and log it in `GAME_DESIGN.md` Appendix A as `G-nn`.
7. Commit after each working milestone with a clear message.

## Architecture rules (hard)

- **Layers:** `util → formulas → core → systems → ai → ui`. A layer imports only from layers to its left. `core`, `formulas`, `systems` and `ai` never touch DOM, `window` or Phaser. `src/game.js` is the composition root. A test enforces this.
- **State is plain JSON** (no classes, Maps, Sets or functions). Static definitions live in loaded data and are never copied into state or saves.
- **All world changes are commands** (`core/commands.js`). The UI and the AI issue the same commands; the UI never mutates state.
- **Randomness only through the seeded RNG in state.** No `Math.random()` or `Date.now()` in simulation code.
- **Numbers come from `data/balance.json`;** formulas take params as arguments and return `{ value, parts }` so the UI can explain them.
- **Capabilities, not ids:** read flags like `hasCapital` and `canSignFormalAlliances`; never `if (government === 'anarchist')`.
- **Effects and conditions** use the shared vocabulary (DATA_SCHEMAS §3). New stats are registered in `core/stats.js`.
- **Ids are permanent.** Never rename; add `aliasOf`.
- **Relative URLs only** (the site is served under a subpath and under `/preview/<branch>/`).
- **Phaser only inside `src/ui/map/` and `src/ui/battle/`**, imported through `src/ui/phaser.js`. HUD, labels, panels and dialogs are HTML/CSS (plain Phaser text shrinks with camera zoom).
- **Never render the whole map per frame.** Bake to textures; redraw only dirty regions.
- Turns are crash-safe: snapshot, run, and roll back on error; never lose a save.

## Conventions

- ES modules, named exports, 2-space indent, semicolons, single quotes. JSDoc types, checked by `npm run typecheck` (covers `src/` and `types/`; `tools/` and `tests/` are covered by their own tests). It must pass.
- Files `camelCase.js`; ids `snake_case`; countries by Natural Earth `ADM0_A3`; regions `ISO3-slug`.
- Commit messages: `area: imperative summary` (areas: core, formulas, systems, ai, ui, data, tools, ci, docs), with the *why* in the body.
- **No new dependencies without asking.** Runtime: none (Phaser is vendored). Dev only: `ajv`, `typescript`, `playwright-core`, `mapshaper`.
- **All UI text lives in `data/i18n/en.json`** and is read with `t('key', params)` / `tn('key', n, params)` (`src/util/i18n.js`). Never hard-code visible text (G-30). English only. A content item's short `name`/`blurb` stays inline in its own data file.

## Testing

- `npm test` = unit tests (`node --test`) + data validation + a short simulation soak. It must pass before every commit.
- Every formula has table-driven tests and invariants (bounds, monotonicity, no NaN, parts sum to value).
- UI changes: take phone-sized screenshots and **look at them** (recipe below).
- Balance changes: run the simulator and report the numbers.

## Commands

`npm test` (unit + data + soak) · `npm run typecheck` (covers `src/`) · `npm run build` → `dist/` · `npm run build:single` → `dist-single/grand-strategy.html` (one-file download, T-18) · `npm run build:map` (rebuild the theater geometry, the grey world and the generated fields of `data/regions.json`; `-- --only world|theater` for one; downloads Natural Earth into `.cache/` once) · `npm run serve` · `npm run e2e` (Playwright, phone-sized Chromium) · `npm run screenshot` (→ `tmp/screenshots/`, then read the PNGs) · `npm run validate` · `npm run simulate` · `npm run icons` · `npm run vendor:phaser`

Before every commit: `npm run typecheck && npm test`; run `npm run e2e` whenever UI, build or service-worker code changed. CI (`.github/workflows/ci.yml`) runs all of them, then publishes `main` to the site root and every other branch to `/preview/<branch>/` on `gh-pages`.

## Environment notes (cloud sandbox, verified 2026-10-05)

- Node 22, npm 10, Python 3.11. Chromium at `/opt/pw-browsers/chromium` (Playwright browsers are pre-installed; do **not** run `playwright install`).
- **Network:** npm registry ✅, Natural Earth (GitHub raw and S3) ✅. **unpkg, jsDelivr and phaser.io are blocked.** Fetch packages with `npm pack <pkg>@<version>` and read the tarball. The Phaser 4 tarball contains API guides at `package/skills/*/SKILL.md` and `package/changelog/v4/4.0/MIGRATION-GUIDE.md`.
- **Headless WebGL** works with `--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Phone emulation: viewport 844×390 (landscape) or 390×844 (portrait), `deviceScaleFactor: 2`, `isMobile`, `hasTouch`. Read the PNG to see the screen.
- Phaser 3.90's ESM build has no default export (`import * as`); 4.x has both. Use the adapter.
- On this Node version `node --test <directory>` fails; use globs: `node --test "tests/**/*.test.js"`.
- **Do not set `TMPDIR` to the scratchpad when launching Chromium:** its profile path becomes too long for a Unix socket and the browser dies with SIGTRAP. Tools use `/tmp` and clean up after themselves.
- Debug scripts that import project modules or `playwright-core` must live inside the repo (use the git-ignored `tmp/` folder) so `node_modules` resolves.
- `sleep` is blocked in the shell; to wait for CI, poll with the GitHub MCP tools (`actions_list` / `list_workflow_jobs` / `get_job_logs`).
- Tests that depend on async saving must wait for the save (`waitForSaved` in `tools/lib/drive.mjs`), exactly as a real player's tap would be seconds later.
- After a page reload the URL keeps its `#/route`, so e2e tests must not wait for the title screen unless they navigate there.
- Claude Artifacts are **not** an alternative host for the PWA: their viewer frame blocks service workers, self-started downloads and Web Share, so offline play, install and save export cannot work there (checked 2026-10-05). GitHub Pages is the only route; enabling it is a repo setting the sandbox cannot change (the `gh` Pages API path is refused by the proxy and the GitHub MCP tools have no Pages tool).
- Put scratch work in the scratchpad directory, never in the repo.
- The container is discarded at session end: commit and push anything worth keeping.
