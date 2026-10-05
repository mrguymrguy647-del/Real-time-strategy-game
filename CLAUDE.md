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
- **Phase 0b (scaffold) is in progress** — see ARCHITECTURE §16. When it is done the user installs it on their phone and approves; only then Phase 1 (five milestones, GAME_DESIGN Appendix C). At the start of Phase 1, send the user the 16-country classification table to veto (Q7).
- **Open, not blocking:** the user's phone (iPhone or Android — unknown, support both), repo rename (default keep), game title (default "Grand Strategy").
- **Git:** develop only on the branch the session names; never push elsewhere; no pull requests unless asked.

## The user

Develops entirely from a phone through Claude Code. Therefore:
- Everything must be testable in a mobile browser. Give a preview URL or a screenshot when something visible changes.
- Keep chat replies short and scannable: bullets, no wide tables, plain words. Say plainly what works, what doesn't, and what is next.
- Ask for decisions with a recommended default, so "approved" is a valid answer.

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

- ES modules, named exports, 2-space indent, semicolons, single quotes. JSDoc types and `// @ts-check`; `npm run typecheck` must pass.
- Files `camelCase.js`; ids `snake_case`; countries by Natural Earth `ADM0_A3`; regions `ISO3-slug`.
- Commit messages: `area: imperative summary` (areas: core, formulas, systems, ai, ui, data, tools, ci, docs), with the *why* in the body.
- **No new dependencies without asking.** Runtime: none (Phaser is vendored). Dev only: `ajv`, `typescript`, `playwright-core`, `mapshaper`.
- **All UI text lives in `data/i18n/en.json`** and is read with `t('key', params)` / `tn('key', n, params)` (`src/util/i18n.js`). Never hard-code visible text (G-30). English only. A content item's short `name`/`blurb` stays inline in its own data file.

## Testing

- `npm test` = unit tests (`node --test`) + data validation + a short simulation soak. It must pass before every commit.
- Every formula has table-driven tests and invariants (bounds, monotonicity, no NaN, parts sum to value).
- UI changes: take phone-sized screenshots and **look at them** (recipe below).
- Balance changes: run the simulator and report the numbers.

## Commands (created in Phase 0b — not available yet)

`npm test` · `npm run typecheck` · `npm run build` · `npm run serve` · `npm run simulate` · `npm run e2e` · `npm run screenshot`

## Environment notes (cloud sandbox, verified 2026-10-05)

- Node 22, npm 10, Python 3.11. Chromium at `/opt/pw-browsers/chromium` (Playwright browsers are pre-installed; do **not** run `playwright install`).
- **Network:** npm registry ✅, Natural Earth (GitHub raw and S3) ✅. **unpkg, jsDelivr and phaser.io are blocked.** Fetch packages with `npm pack <pkg>@<version>` and read the tarball. The Phaser 4 tarball contains API guides at `package/skills/*/SKILL.md` and `package/changelog/v4/4.0/MIGRATION-GUIDE.md`.
- **Headless WebGL** works with `--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Phone emulation: viewport 844×390 (landscape) or 390×844 (portrait), `deviceScaleFactor: 2`, `isMobile`, `hasTouch`. Read the PNG to see the screen.
- Phaser 3.90's ESM build has no default export (`import * as`); 4.x has both. Use the adapter.
- On this Node version `node --test <directory>` fails; use globs: `node --test "tests/**/*.test.js"`.
- Put scratch work in the scratchpad directory, never in the repo.
- The container is discarded at session end: commit and push anything worth keeping.
