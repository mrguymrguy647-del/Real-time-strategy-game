# Architecture Plan

> Phase 0 proposal, awaiting your approval. The short plan comes first; everything after "At a glance" is reference.
> Game rules: [../GAME_DESIGN.md](../GAME_DESIGN.md) · data formats: [DATA_SCHEMAS.md](DATA_SCHEMAS.md) · questions and risks: [RISKS_AND_QUESTIONS.md](RISKS_AND_QUESTIONS.md)
> `T-nn` = a technical decision (§2). `G-nn` = a game-design decision (GAME_DESIGN.md, Appendix A). `Qn` = an open question.

## At a glance

- **Stack.** Plain JavaScript ES modules with **no bundler** (T-01). **Phaser** draws the map and the battle only (T-02); every panel and menu is HTML/CSS. Saves in IndexedDB. A service worker makes it work offline. Hosted on GitHub Pages.
- **The simulation has no UI in it.** `core`, `formulas`, `systems` and `ai` are plain JS with no DOM and no Phaser (T-04). They run identically in a phone browser and in Node, so the whole game can be tested without a phone.
- **State and content are separate JSON.** Content in `/data` never changes at runtime; state is what changes and is what gets saved (T-05).
- **Everything is a command.** The player and the AI act through the same validated commands, so the AI cannot cheat (T-06).
- **A turn is an ordered pipeline of registered systems** (economy, war, …). Adding a system never edits the loop (§6.4).
- **Formulas are pure functions** fed by `balance.json`, unit-tested, and able to explain their result (T-08).
- **Rules are data.** A small effects/conditions language lets events, technologies, governments and traits change the game without code (T-09).
- **The map is baked.** Geometry is generated offline from Natural Earth; Phaser bakes it into textures and redraws only what changed (§9). This was measured: see §3.
- **Safety nets.** Schema-validated data, rollback if a turn throws, autosave every turn, CI blocks broken deploys, and a preview URL per branch to test on your phone (§13).

### Layers

```text
util → formulas → core → systems → ai → ui
```

A layer may import only from layers **to its left**. `src/game.js` is the composition root: it wires data, state, systems and AI into a *headless game object*. The UI and every test tool use that object, so tests and the simulator exercise the real game.

### Phone layout (landscape; portrait turns the side sheet into a bottom sheet)

```text
+----------------------------------------+
| Jan 2026  $61bn  Oil+3  14 mo (oil)    |
+---------------------------+------------+
|                           | Basra      |
|   MAP (Phaser canvas)     | owner: IRQ |
|   drag = pan              | oil  +12%  |
|   pinch = zoom            | [Details]  |
|   tap = select            |            |
+---------------------------+------------+
| [Menu] [Economy] [War]     [END TURN]  |
+----------------------------------------+
```

---

## 1. Goals and constraints

In priority order, the architecture optimizes for:

1. **Testable without a phone.** You develop from a phone and I cannot see it, so almost everything must be verifiable in Node and in a phone-sized headless browser.
2. **Content is data.** Adding countries, events or technologies must not need code changes (your rule).
3. **Fast on mid-range phones.** World-wide end of turn and 60 fps map panning on modest hardware.
4. **Offline, and survives updates.** No network in play; new versions must not break saves.
5. **Hard to break while editing blind.** Validation, rollback and CI gates everywhere.

## 2. Technical decisions

**T-01 · No bundler.** Native ES modules. The only build step is a small Node script that copies files to `dist/` and writes the offline-cache manifest. *Why:* nothing to configure or break from a phone, dev equals prod, and Node can import the same modules for tests. Our code is plain ESM, so adding esbuild later (if load time demands it) needs no code changes.

**T-02 · Phaser is a thin view adapter.** Phaser is imported in exactly one file (`src/ui/phaser.js`) and used only in `src/ui/map/` and `src/ui/battle/`. *Why:* an upgrade or swap touches one folder. **Version: 4.2.1 (decided, Q1).** The original spec said Phaser 3; 4.2.1 is the maintained stable line (see §3). The adapter normalizes the two ESM shapes (`mod.default ?? mod`), so going back to 3.90 stays cheap.

**T-03 · Phaser is vendored.** `vendor/phaser/phaser.esm.min.js` plus its license and a `VERSION` file, refreshed by `tools/vendor-phaser.mjs` from the npm tarball. `index.html` has an import map (`"phaser": "./vendor/phaser/phaser.esm.min.js"`). *Why:* CDNs are blocked in my sandbox and offline play needs a local copy anyway.

**T-04 · The simulation is UI-free and JSON-only.** `core`, `formulas`, `systems` and `ai` never touch `window`, `document` or Phaser, and state contains only JSON types (no classes, Maps, Sets or functions). *Why:* the whole game runs in tests and the simulator, and the simulation can later move into a Web Worker without a rewrite (T-16).

**T-05 · Data versus state.** `/data` is loaded once, validated and frozen. `state` holds only changing values keyed by id. Saves contain state plus a data version, never copies of data. *Why:* small saves, content edits don't corrupt old saves, no double source of truth.

**T-06 · Commands.** Every change to the world, whether from the player, the AI or delegation (G-20), is a command object validated by the same code (`core/commands.js`). The UI never edits state directly. *Why:* "same rules as the player" holds by construction, and commands can be logged, replayed and tested.

**T-07 · Seeded RNG in state.** One generator (sfc32); its four 32-bit words are saved with the game. No `Math.random()` or `Date.now()` in simulation code. What-if previews run on a *copy* (G-06). *Why:* reproducible bugs, stable reloads, estimates that cannot change outcomes.

**T-08 · Formulas are pure and explainable.** `src/formulas/*` take plain numbers plus a params object from `balance.json` and return `{ value, parts }`; the "why?" popovers read `parts`. *Why:* unit-testable, tunable without code, and pillar 2 ("causes are visible") comes for free.

**T-09 · Effects, conditions and a stat registry.** Content changes the game through one small closed vocabulary (DATA_SCHEMAS §3). Valid stats are registered in `core/stats.js`; rare custom actions are named handlers. *Why:* events, technologies, governments, traits and shortages share one engine.

**T-10 · Capabilities, not ids.** Logic reads flags such as `hasCapital` and `canSignFormalAlliances` from data. It never branches on `government === 'anarchist'`.

**T-11 · Crash-safe turns.** `endTurn` snapshots state (`structuredClone`), runs the pipeline, checks invariants (finite numbers, non-negative stocks, valid ids) in tests and dev builds, and on any exception restores the snapshot, shows a "Turn failed" panel with a copy-able error, and keeps the last good autosave. *Why:* a bug in month 120 must never destroy a game.

**T-12 · Relative URLs and gh-pages previews.** All URLs are relative, so one build works at the site root and under `/preview/<branch>/`. CI publishes `main` to the root and every other branch to `/preview/<branch>/` on the `gh-pages` branch, using only official GitHub Actions plus our own `tools/publish-pages.mjs` (plain git). *Why:* you can test each branch on your phone without merging.

**T-13 · Types without TypeScript.** JSDoc types, `// @ts-check`, and `tsc --noEmit` as a dev-only check. It covers `src/` and `types/` (a one-line shim for the vendored Phaser module); `tools/` and `tests/` are exercised by the tests themselves. *Why:* catches mistakes early when I cannot click through every screen.

**T-14 · Layering is a test.** `tests/unit/architecture.test.js` scans imports and fails on a violation (for example `systems` importing `ui`, or anything outside `src/ui` importing Phaser).

**T-15 · Plain DOM UI, no framework.** Panels are functions `(game) → HTMLElement` built with a tiny `h()` helper; the shell re-renders an open panel when the game emits `turn:end` or `command:applied`. *Why:* a turn-based game has no 60 fps UI state, and it means zero dependencies. Preact + htm is the fallback if panels get hard to manage.

**T-16 · Main-thread simulation first.** Phases 1–4 run the simulation on the main thread behind a "Processing…" overlay; it is worker-ready by T-04. I will profile in Phase 5 and move it to a Web Worker only if needed.

**T-17 · Support floor.** iOS/iPadOS Safari 16.4+ and the current and previous two versions of Chrome/Edge/Firefox on Android. *Why:* import maps (Safari 16.4), `<dialog>`, `structuredClone`, `CompressionStream`.

**T-18 · A single-file download for trying the game without hosting.** `npm run build:single` makes `dist-single/grand-strategy.html`: the whole app, its data and styles in one page that runs from a plain file (no server, install or network). The native TypeScript compiler (already a dev dependency) turns every module in `src/` into plain CommonJS, `tools/single.runtime.js` runs them, the JSON in `data/` and the SVG icons are inlined, and the page sets `globalThis.__GS_INLINE__` so the app reads them from memory instead of fetching. CI publishes the file as a GitHub Release asset (tag `download-<branch>`), a link that downloads on any phone with no Pages setting. It cannot be installed or update itself; the app says so (`platform.singleFile`), and the web build stays the product. **Phaser rides along** (about 1.4 MB) as base64 text in an inert `<script type="application/octet-stream" id="gs-phaser">` element with its license in a comment; the first time the map (or the Diagnostics map speed test) needs it, `globalThis.__GS_LOAD_PHASER__` (defined by `tools/single.runtime.js`, used by `src/ui/phaser.js`) decodes it into a Blob and imports that, which works from a file and inside a locked-down frame (R18). The app no longer depends on the URL hash to switch screens (some viewers refuse to change it); the hash only mirrors the screen. *Why:* the user works from a phone and asked for a download link; Pages needs a repo setting only they can change.

**T-19 · The rest of the world is a grey, optional, separate backdrop.** `data/map/world.topo.json` holds every country except the 16 playable ones, coarse (2% of Natural Earth's 10 m detail, about 120 KB), in the same Mercator kilometres as the theater file so the two line up. It is picture and name only: it is never in `countries.json` or `regions.json`, `core/data.js` does not load it, and the simulation never sees it (Phase 5 turns countries into data). The map screen reads it when the setting `mapWorld` is on (default) and falls back to the Middle East alone when it is off or unreadable. *Why:* the user asked for the whole world now (G-34) but also for a way back if it hurts a phone; a separate file and a switch make that a setting, not a rewrite. See §9.7.

**T-20 · Map pictures are plain textures, not CanvasTextures.** Phaser's `addCanvas` makes a CanvasTexture that reads every pixel back into a second in-memory copy (for drawing on it later) and stalls while it does; the map never draws on a finished picture, so `src/ui/map/phaserMap.js` uses `textures.addImage(key, canvas)`. Pictures shown small have power-of-two sides and the renderer uses `LINEAR_MIPMAP_NEAREST`, so a far zoom-out is averaged smoothly while a picture shown at about its own size looks exactly as without mipmaps. *Why:* it removed one full copy of every texture (about 37 MB for the sharp theater picture alone) and the readback stall at start-up.

**T-21 · A forecast is the turn itself, run without applying it.** The Budget's "next month" numbers and the alerts call `previewEconomy`, which runs `economyMonth` (the same pure function the monthly turn runs) on the current state and changes nothing; the turn then applies that result. There is no second formula to drift, and a test checks that the forecast equals what the next turn does. *Why:* pillar 2 (causes are visible) only works if the explanation and the outcome come from one computation; the same pattern serves the capture estimate (M1.2) and the war-win probability (M1.3).

**T-22 · One read-only view of a country's resources, and a month's lag on prices.** `systems/resourceFlows.js` is the only place that knows where a country's production, consumption and stock come from and what stands in the way of its trade (`countryFlows`); it changes nothing. The resources system (order 55), the economy (order 50, for the state's resource income and the growth effect of prices), the budget forecast, the screens and the what-if previews all read through it, so they cannot disagree. A month is valued at the price the market had when it began, and the new price (which draws from the seeded RNG) is set at the end of the turn for the next one: the forecast needs no random number and is exactly what the turn then does. Previews (a region's worth, a closed strait) run the same functions on adjusted figures or on a `structuredClone` of the state with its own RNG copy, so the real generator is never used. *Why:* a market that straits and wars can move must stay explainable, and an estimate must never be a second, drifting model.

## 3. Verified in this sandbox (2026-10-05)

So the plan rests on measurements rather than guesses:

- **Tooling:** Node 22.22, npm 10.9 (so the built-in `node --test` runner and `structuredClone` are available), Python 3.11. Chromium is pre-installed at `/opt/pw-browsers/chromium`.
- **Headless WebGL works.** With `--use-angle=swiftshader --enable-unsafe-swiftshader`, Phaser reports renderer type WEBGL in a phone-emulated viewport (844×390, 2× pixel ratio, touch).
- **Both Phaser lines boot from vendored ESM files.** Phaser 3.90.0 has *no default export* (use `import * as`); 4.2.1 offers both forms.
- **Bundle size:** Phaser 3.90.0 `phaser.min.js` is 1.20 MB (315 KB gzipped); 4.2.1 is 1.38 MB (352 KB gzipped).
- **Map rendering experiment** — 1,500 random polygons of 30 vertices each (about the full-world budget). Redrawn as live vector Graphics every frame: **about 10 fps**. Baked once into a RenderTexture and shown through the camera: **about 60 fps**, on both Phaser versions. The environment uses software GL on a server CPU, so absolute numbers are not phone numbers; the roughly 6× ratio is the point. It is why §9 requires baking.
- **Text inside a zoomed Phaser camera shrinks with the zoom**, even with scroll factor 0. HUD and labels therefore must not rely on plain Phaser text (§9.5, §10).
- **Network:** the npm registry and Natural Earth (GitHub raw and S3) are reachable. **unpkg, jsDelivr and phaser.io are blocked.** Everything shipped to the browser must be vendored from npm tarballs, which also fits offline play.
- **Phaser 4.2.1 ships API guides for AI agents inside its npm package** (`package/skills/*/SKILL.md`, plus `changelog/v4/4.0/MIGRATION-GUIDE.md`) — valuable because phaser.io cannot be reached. Phaser 4 deprecates its Canvas renderer (still present, but WebGL is the supported path); `RenderTexture` drawing must be flushed with `render()`; camera `scrollX/scrollY/zoom` are unchanged; Phaser 4.0 was released 10 April 2026.
- **Repository:** public, so GitHub Pages is free. Pages is **not enabled yet** (§13 has the one-time step).

## 4. Repository layout

The suggested structure, adapted. Additions are marked; reasons are in §2.

```text
index.html                 shell + import map (manifest and service worker are generated into dist/ by the build)
package.json               scripts; dev dependencies only (+ Phaser as a vendored file)
tsconfig.json  types/      type-check setup (T-13)                   (+ added)
CLAUDE.md  GAME_DESIGN.md  README.md
docs/                      ARCHITECTURE.md, DATA_SCHEMAS.md, RISKS_AND_QUESTIONS.md, later PHASE_n_PLAN.md
src/
  game.js                  composition root: headless game object (data+state+systems+AI)
  main.js                  browser boot
  util/                    i18n t(), compression, hashing, bench     (+ added)
  formulas/                pure math: combat, economy, endurance,    (+ added)
                           stability, market, ...
  core/                    state, clock, rng, commands, turn pipeline, stats/effects/conditions,
                           data loader, save + migrations, event bus
  systems/                 war, capitalBattle, economy, endurance, resources, diplomacy,
                           technology, government, stateCondition, stability, events
  ai/                      scheduler, strategic (tier 1-2), simple (tier 3), personalities, explain
  ui/                      app shell, dom helper, screens, panels, dialogs, theme.css
    map/                   Phaser map adapter (bake, overlays, input, hit-testing)
    battle/                Phaser capital-battle view (Phase 2)
data/                      JSON content (DATA_SCHEMAS.md), i18n/en.json (all UI text, G-30),
                           schema/, map/ (generated geometry)
vendor/phaser/             pinned Phaser build + license + VERSION   (+ added)
assets/                    icons, later sounds
tests/                     unit/, data/, e2e/
tools/                     build, serve, validate-data, simulate, build-map, import-world-data,
                           vendor-phaser, screenshot, make-icons, publish-pages,
                           bundle-single, publish-download   (+ added; T-18)
.github/workflows/         ci.yml (checks, then deploy)              (+ added)
```

File-size rule: soft limit 300 lines, hard limit 500 per source file (JSON data excluded).

## 5. Layers and dependency rules

- `util` imports nothing. `formulas` may import `util`. `core` may import `formulas`, `util`. `systems` may import `core`, `formulas`, `util`. `ai` may import `systems` and everything to its left. `ui` may import anything except tools.
- `core` does **not** import `systems`. Systems register themselves (turn steps, command handlers, stat definitions) with `core` from `src/game.js`.
- Phaser is imported only under `src/ui/`. `tools/` and `tests/` may import anything.
- Enforced by a test (T-14).

## 6. Core runtime

### 6.1 Data loading

`loadData(readJson)` reads every file in `/data`, validates the basics (ids, references, required fields), builds indexes (`byId`, regions by country, adjacency lists, chokepoint control) and deep-freezes the result in dev and test. `readJson` is injected: `fetch` in the browser, `fs` in Node. Strict schema validation (Ajv) runs in CI, not in the shipped game (§14).

### 6.2 State shape (sketch)

```jsonc
{
  "meta":      { "saveVersion": 1, "dataVersion": "…", "scenarioId": "me_2026", "difficulty": "normal", "worldMode": "real", "seed": 12345 },
  "rng":       { "s": [0, 0, 0, 0] },
  "clock":     { "year": 2026, "month": 1, "week": 1, "turn": 0, "scale": "month" },
  "player":    { "countryId": "IRQ" },
  "world":     { "tension": 30, "market": { "oil": { "price": 100, "supply": 0, "demand": 0 } }, "crises": [], "flags": {} },
  "countries": { "IRQ": { "economy": {}, "budget": {}, "military": {}, "resources": {}, "internal": {}, "government": {}, "modifiers": [], "ai": {} } },
  "regions":   { "IRQ-basra": { "owner": "IRQ", "controller": "IRQ", "unrest": 0, "fortification": 0, "siteDamage": {}, "progress": {} } },
  "wars":      {},
  "fronts":    {},
  "diplomacy": { "pairs": {}, "treaties": [], "ultimatums": [] },
  "decisions": [],
  "news":      [],
  "chronicle": [],
  "log":       []
}
```

Countries and regions are objects keyed by id (JSON-friendly, O(1) lookup). Diplomacy pairs are stored sparsely: only pairs that differ from their computed default exist (Phase 3).

**As built in M1.2** (save version 3): each country also has `resources`, `{ oil: { stock, step, last }, food: …, steel: …, rare: … }` (`step` is how deep into its shortage ladder the country is, 0 for none; `last` is what the last month did: production, consumption, imports, exports, drawn, stored, wasted, coverage, price and the state's income from it), and the `world` is `{ tension, flags, market: { oil: { price, shock, last: { supply, demand, previous } }, … }, chokepoints: { hormuz: { blockade }, … } }` (`blockade` 0 open … 1 closed). `economy.last` splits the income into `taxMn` and `resourceMn`. Production, consumption and the state's share are read from the country's data, not copied into the state. **Earlier, in M1.1b** (save version 2): `meta`, `rng`, `clock`, `player { countryId }`, `world`, `countries`, `regions` (empty until M1.3), `decisions`, `news`, `chronicle`, `log`. Each country is `{ government, economy: { gdpBn, taxRate, treasuryMn, debtMn, last }, budget: { military, research, welfare, infrastructure } }`. `economy.last` is what the last month did (period, income, spending, interest, rate, growth, balance, borrowed) and, for the **player's country only**, `why`: the explained values (value, op and parts) behind the report's "Why?" lists. Money is USD millions, GDP billions, shares and rates fractions (G-25). A `-0` is refused by the invariant check, because a save file would turn it into `0` and change the state.

### 6.3 Commands

```text
registerCommand(type, { validate(state, data, cmd) → null | "reason", apply(state, data, cmd, ctx) })
dispatch(game, cmd) → { ok, error? }
```

Examples: `SET_BUDGET`, `SET_TAX`, `SET_STANCE`, `DECLARE_WAR`, `OFFER_PEACE`, `BORROW`, `PRINT_MONEY`, `TOGGLE_WAR_ECONOMY`, `RESOLVE_DECISION`. Rules:
- Player commands apply **immediately** (instant feedback, previews stay truthful). Stances and budgets are *standing orders* read by the next turn.
- AI commands go through the same `dispatch` during the AI step.
- Every applied command is appended to a capped `log`, which helps debugging and delegation.

**As built in M1.1b** (`core/commands.js`, `systems/economyCommands.js`): `createCommands(definitions)` gives `dispatch(ctx, command)`; a definition is `{ validate(ctx, command) → null | reason code, apply(ctx, command) }`. A refused command changes nothing and returns `{ ok: false, error: { code, message } }`; an applied one is logged (capped at 100, with the turn) and announced on the bus as `command`, which is how open panels redraw. `game.dispatch` is the one door; `COMMANDS` in `game.js` lists what is registered. Today: `SET_TAX { countryId, rate }` and `SET_BUDGET { countryId, category, share }`, each limited to the range around the country's starting value (`formulas/economy.js` `taxBounds`, `budgetBounds`) and rounded to four decimals (`tidy`), and `REPAY_DEBT { countryId, amountMn }`, a one-off payment out of the treasury (never more than is held or owed; the Budget's two buttons use `repayAmounts`). M1.2 adds `BUY_RESOURCE` and `SELL_RESOURCE { countryId, resource, units }` (`systems/resourceCommands.js`): a trade at the market price with a spread, refused with `storage_full`, `no_money`, `not_enough_stock` or `no_market_access` (`planTrade` is shared by validate, apply and the buttons that show a trade's price).

### 6.4 Turn pipeline

```text
order system         cadence  what it does
 10   events.pre     monthly  world events, crises
 20   ai             monthly  AI plans, issues commands (§7)
 30   orders         any      apply delayed effects
 40   diplomacy      monthly  meters, ultimatums     [P3]
 50   economy        monthly  income, debt, inflation
 55   resources      monthly  output, trade, prices
 60   war            monthly  fronts, battles, chaos
 62   capitalBattle  weekly   deep battle             [P2]
 70   endurance      monthly  runways and warnings
 80   stability      monthly  power centers, unrest
 82   government     monthly  abilities, elections    [P2]
 84   stateCondition monthly  cohesion, factions      [P5]
 90   technology     monthly  research, diffusion     [P4]
 95   events.post    monthly  follow-ups
 99   wrapup         any      news, win/lose checks
```

*As built:* `economy` (50) and `resources` (55) are registered in `game.js`. The economy reads the month's resource flows through `countryFlows` (T-22); the resources system then settles the stocks, the shortage steps and the next prices, and draws two random numbers per resource, in the order of `resources.json`.

`endTurn(game)`: refuse if blocking decisions are pending → snapshot → run the systems whose cadence matches the clock (in order) → advance the clock → wrap-up → autosave → emit `turn:end`.
- **Decisions never pause a turn.** Capital-battle offers, ultimatums and event choices are queued in `state.decisions` and must be answered before the next End Turn (G-05).
- A system mutates only its own slice. Effects on other slices go through modifiers (§6.7), commands, or `ctx` helpers (`ctx.news`, `ctx.queueDecision`, `ctx.addModifier`).
- Each step is O(countries + regions). Anything heavier needs a reason in a comment.

### 6.5 Time model

`clock = { year, month, week, turn, scale }`. In `scale: "month"` a turn advances one month. In `"week"` it advances one week (4 weeks per month). Systems declare a cadence: `monthly` systems run when the turn completes a month (always, in month scale; every 4th week in week scale), `weekly` systems run every turn in week scale. When a battle ends, play returns to `"month"` at the next month boundary (G-01).

### 6.6 Randomness

`core/rng.js`: `next()`, `int(a, b)`, `chance(p)`, `pick(list)`, `clone()`. The generator state lives in `state.rng`. Systems draw in a fixed order, so equal seed + equal commands = equal game.

### 6.7 Stats, effects and conditions

- A **stat** is a registered named number (`country.approval.people`) with bounds and a label.
- Every entity has `modifiers: [{ source, stat, op, value, expires? }]`. A value is `(base + Σ add) × Π mul`. Sources (a government, a technology, a trait, a shortage step, an event) add and remove their modifiers when they start and stop applying.
- **Conditions** are JSON predicates evaluated against state (`all`/`any`/`not`, comparisons, flags, `chance`).
- Per-turn caching keeps lookups cheap. Formal grammar: DATA_SCHEMAS §3.
- **Shortages (M1.2):** `core/modifiers.js` `shortageModifiers` and `shortagesOf` read each resource's current ladder step from the country's state and apply the step's effects from `resources.json` (only the deepest step reached); they are kept apart from the government's so a report can name both (`why.growth.shortages`). Growth reads them today.
- **As built:** `core/modifiers.js` `modifiersFor(data, country, statId)` returns `{ add, mul }` from the country's government today (traits, techs and events add their sources there later), so a system never names a government. `formulas/explain.js` `modifierPart` turns the pair into one term of an explained sum.

### 6.8 Formulas, explanations and what-if previews

- `formulas/*` export pure functions such as `combatStrength(inputs, params) → { value, parts }`, where `parts` are the factors or terms. `value` and `parts` come from the same computation, so there is no duplicate logic that can drift.
- The UI's **why?** popovers display `parts`. Tests assert that `parts` reproduce `value`.
- **Previews** (capture estimate, win probability, cost of an extension lever) are pure functions in `systems/` that run the same formulas on a read-only view of the state. They never mutate state and never consume the real RNG (they use `rng.clone()`).
- **As built** (`formulas/explain.js`, `formulas/economy.js`): an explained value is `{ value, op: 'sum' | 'product', parts: [{ id, value }] }`. `sumOf` and `productOf` make one, so the parts reproduce the value by construction; `limitSum` keeps a sum inside bounds and adds a `limit` part for the difference. The UI writes the parts with labels `why.<number>.<id>` (`ui/components/why.js`). `systems/resourcePreview.js` adds the capture estimate (`captureEstimate`: what a region is worth to a country, from `resourceMonth` on adjusted figures) and the strait what-if (`closureEstimate`: the resources system played forward on a copy, with the strait closed and open, so the market's random mood cancels out). `economyMonth` is one whole month for one country; `systems/economy.js` `previewEconomy` runs it without changing anything (the Budget's forecast and the alerts use it) and the turn runs the very same function and applies it, so a forecast is never different from what happens (a test checks it).

### 6.9 Crash-safe turns

See T-11. A debug flag enables invariant checks after every system; the simulator and tests always enable it, so the shipped build pays no cost.

### 6.10 News and chronicle

Systems emit compact entries `{ turn, importance, template, params, refs }` via `ctx.news(...)`; the UI turns a template id and its params into text (templates live in data). AI-vs-AI news is filtered by relevance to the player (neighbors, allies, trade partners, oil exporters) plus a global top-N by importance (design §3.7). Entries above an importance threshold are copied to `chronicle`, which becomes the end-of-game headline history (§11 of the design). Both arrays are size-capped.

## 7. AI

- **Modules:** `scheduler.js` (who thinks this turn), `strategic.js` (tiers 1–2), `simple.js` (tier 3), `personalities.js` (data-driven weights), `explain.js` (decision traces).
- **Tiers (G-19):** tier 1 every turn, tier 2 every 2–3 turns staggered by country, tier 3 event-driven (war declared nearby, a crisis, an ultimatum) plus a slow background cadence. A lower-tier country is promoted while it is at war with, or next to, the player.
- **Decision loop:** assess (threat, opportunity, economic health, endurance) → generate candidate intents (declare war, seek peace, set stances, adjust budget, propose treaty, research priority) → score each by personality-weighted utilities minus risk → pick the best few within an action budget → emit **commands**. Peace-seeking at low endurance is just a utility term, so it follows the same math as the player's endurance (§4 of the design).
- **Same rules, enforced:** the AI has no write access except `dispatch`. Difficulty only changes multipliers (G-21).
- **Explainability:** in dev builds each decision keeps its top scored options and weights, so "why did X attack Y?" is answerable and AI behavior can be debugged from a phone screenshot.
- **Delegation (G-20):** the player's delegated domains run the same decision code with player-set priorities, issuing commands for the player's country.

## 8. Capital Battle module `[P2]`

- **One state machine, two controllers.** `capitalBattle` holds the battle state (districts, control, supply/food, morale, special units, week counter). Each week it takes *orders* for both sides and advances. In deep mode the player supplies orders through the battle screen; in auto-resolve an **autopilot** supplies the player's orders with the ×0.90 penalty; the AI always uses the autopilot (G-06).
- **Interface to the war system:** `war` detects the trigger and queues a decision; on *Command* or *Auto-Resolve* the clock switches to week scale and `capitalBattle` runs; on resolution it returns an `outcome` (surrender terms, failed assault, exile) that `war` applies (G-07, G-08, G-11).
- **Win probability:** `estimateWinProbability(battle)` runs 200 autopilot-vs-autopilot simulations on a cloned RNG (G-06). It returns a range when intelligence is poor (G-04).
- **Rendering** lives in `ui/battle/` and reads state only; it never decides anything.

## 9. Map and rendering

### 9.1 Geometry pipeline (offline, `tools/build-map.mjs`)

1. Download Natural Earth 10m admin-0 (countries) and admin-1 (states/provinces) into an ignored cache.
2. Group admin-1 units into game regions using a small hand-edited mapping file per theater (region id → admin-1 codes, plus name). Unmapped units are flagged, never silently dropped.
3. Dissolve, simplify (topology-preserving, via mapshaper as a dev tool), project, quantize, and write TopoJSON to `data/map/<theater>.topo.json` — shared borders are stored once, so there are no gaps or overlaps.
4. Compute and write only the **generated** fields in `regions.json` (neighbors from shared arcs, centroid, coastal flag, size). Hand-edited fields are never touched.
5. Validate: every region has a polygon and vice versa; neighbor symmetry; no tiny slivers.

**Projection:** Mercator, pre-projected into map units so the runtime does no projection math (decided in the Phase 1 geometry spike). The theater is clipped to its box; the world file is clipped to latitudes −58° to 80° (Antarctica and the polar cap are left out) **in lon/lat before projecting**, because Mercator is infinite at the poles. **Budgets:** Phase 1 about 100 regions and ≤ 150 KB; Phase 5 about 1,200 regions, ≤ 120,000 vertices, ≤ 1.5 MB gzipped. Neighbors outside the active theater are in the file as non-interactive grey context.

### 9.2 Phaser view (`src/ui/map/`)

Layers, bottom to top: **base** (sea, land, borders — baked once), **ownership tint** (a RenderTexture; only *dirty* regions are redrawn when an owner or controller changes), **front lines**, **chokepoints and markers**, **selection highlight**, **labels**.
- Pan/zoom is the camera transform only; nothing is redrawn per frame.
- The device pixel ratio is capped at 2; each texture is at most 4096×4096 and the total GPU texture budget is about 64 MB. If deep zoom looks soft, a *detail redraw* of only the visible regions can be added (decided by a Phase 1 spike).
- Ownership colors come from a graph-coloring pass over a small colorblind-safe palette, so neighbors always differ; the player's country is outlined.

### 9.3 Input and hit-testing

- One finger drags (with inertia); two fingers pinch-zoom (clamped); a tap is under about 8 px of movement and about 250 ms. The canvas uses `touch-action: none`; everything else uses `touch-action: manipulation`.
- Selection uses a bounding-box grid index plus exact point-in-polygon (even-odd, with holes) on the few candidates. Nothing is made "interactive" per polygon.

### 9.4 Phaser version differences to absorb in the adapter

Phaser 4: import default or named, drawing into a RenderTexture must be followed by `render()`, `roundPixels` defaults to false. Phaser 3.90: namespace import, immediate drawing. The adapter hides both.

### 9.5 Labels and HUD

Labels for the few visible major regions and countries are HTML elements positioned from the camera transform (or counter-scaled by `1/zoom`), with level-of-detail culling. The HUD is HTML. Plain Phaser text is not used for either (§3).

### 9.6 As built in M1.1a

- **Data:** `npm run build:map` → `data/map/middle_east.topo.json` (about 112 KB, 33 KB gzipped; budget 150 KB): objects `regions` (96), `countries` (16, sharing the regions' arcs) and `context` (grey neighbours clipped to the box), plus a `gs` block with the box (km) and a label point per country and region (found at build time with the pole-of-inaccessibility search, so a name never lands outside a crescent-shaped country). Natural Earth is cached in the git-ignored `.cache/` and pinned to a commit.
- **Runtime geometry** (`topology.js`, `mapData.js`): decode once; **world units are the pixels of the sharpest texture** (3072 wide, y down). Each arc is classified once — coast or frontier, region line, country border, or grey-only — so a shared border is stroked once and the map edge gets no coast line. Neighbouring countries are found from shared arcs and colored with a greedy graph coloring (`coloring.js`).
- **Rendering** (`bake.js`, `phaserMap.js`): Canvas2D bakes the map twice, 1024 px and 3072 px wide (the sharp one a moment after the first frame); Phaser 4.2.1 shows whichever is nearer one texture pixel per device pixel, with hysteresis. The camera is a plain `{cx, cy, zoom}` value (`view.js`, no Phaser) that is copied to the Phaser camera each frame; Phaser's own input is off, and its loop sleeps when nothing moves. The grey neighbours fade into the sea at the map edge.
- **Overlay** (`overlay.js`, `labelLayout.js`): the selection outline is an SVG moved by the camera (strokes keep a constant pixel width); names are HTML. A name is shown when its shape is big enough on screen, fully inside the part of the screen no panel covers, and not on top of a more important name.
- **Input** (`gestures.js`, `hit.js`): one Pointer Events handler; a drag pans (with a glide), two fingers pinch about their midpoint, a quick touch taps. A tap is tested against a grid of region boxes, then point-in-polygon with a small slop (10 px, at most 25 world units) so tiny regions can be hit with a thumb.
- **Panels:** `clampView` and `viewForBox` take **insets** (the part of the screen a panel covers), so a country is framed in what is left and an edge country can be brought out from behind the sheet. The info sheet is HTML (`panels/countryPanel.js`): a bottom sheet in portrait, a side sheet in landscape, compact, scrolling inside itself.
- **In the one-file download too:** that file carries Phaser as base64 and loads it through a Blob URL on first use (T-18, R18); tests open the map from disk and from a locked-down frame.

### 9.7 The grey world (M1.1a, G-34, T-19)

- **Data** (`tools/build-world.mjs`, run by `npm run build:map`, or alone with `npm run build:map -- --only world`): Natural Earth 10 m admin-0, minus the 16 playable countries, clipped in lon/lat, projected, filtered (nothing under 1 km², and no shape-less specks), simplified (Visvalingam, 2%, shapes kept) and written as TopoJSON with a label point per country. About 236 countries, 10,400 vertices, 122 KB. Names are Natural Earth's short `NAME` (so "Dem. Rep. Congo"); borders are its de facto lines (R9).
- **Runtime geometry** (`mapData.js`): the world is laid out in the theater's world units, so it starts at a negative corner and is about 27,000 units wide (the theater is 3,072). Each country keeps its polygons, a box, the box of its **largest polygon** (`focus`, so France is the mainland, not French Guiana) and its size. Arcs lying along the theater's box are their own kind (`ARC.EDGE`) and are never drawn, so the box does not show as a line.
- **Layers, bottom to top** (`phaserMap.js` `DEPTH`): the **overview** (all the world, 2048×1024, always sharp when the whole world is on one screen); the **crisp redraw** (`detail.js`); the **theater** (`LOW` 1024², `HIGH` 3072 wide, as before but with hard edges and no fade into the sea). The overview is the stand-in while the camera moves and is **not drawn** when the theater or the redraw already covers the screen.
- **The crisp redraw:** once the camera has rested 140 ms, the part of the world on screen plus a 30% margin is drawn again as vectors at CSS-pixel density (a phone's full density would be four times the pixels for scenery). `planDetail` decides, as a pure function: nothing while the screen is inside the theater (it is freed), nothing while the overview is sharp enough, nothing while the old redraw still covers the screen at about the right density, otherwise a new one. A pan within the margin costs nothing.
- **Camera:** it may go anywhere in the world; it opens on the whole theater (⌖ returns to it); 🌍 zooms out to the whole world. No zoom limit outside the theater: the grey coasts are coarse when deep, which is accepted for scenery.
- **Taps and names:** a tap tries the playable regions first, then the grey countries (a separate hit index); a grey country shows its name and "Not playable yet" in the info sheet, with an outline. Names appear by the same size and no-overlap rules, ranked after the playable countries and before regions, and keep clear of the on-screen buttons.
- **Cost:** memory is below what the map used before the world existed, because of T-20: overview 8 MB, theater small 4 MB, theater sharp 34 MB, redraw about 3 MB, each once on the GPU and once as a canvas. Start-up bakes only the theater's small picture; the world, its redraw and the sharp theater picture follow after the first frame. Measured in the sandbox (software rendering, so read it as a ratio): first frame the same as before, panning inside the theater about 20-30% slower per frame with the world on. Not yet measured on a phone.
- **The way back:** Settings → Map → *Middle East only* (`mapWorld` false, applied the next time the map opens): the world file is not even read, and the map looks as it did before.

## 10. UI

- **Screens:** Title → New Game (country picker on the map, difficulty, world mode) → Game; plus Settings, Diagnostics, and (Phase 2) Battle.
- **Panels** (bottom sheets in portrait, side sheets in landscape): Country, Region, Economy, Military/War, Report/News, and later Government, Diplomacy, Technology. **Dialogs:** pending decisions, confirmations, "Turn failed".
- **Touch rules:** tap targets at least 44×44 CSS px; primary action (End Turn) reachable by one thumb; no hover-only information (tooltips become tap-to-reveal **why?** popovers); text at least 14 px; `viewport-fit=cover` with safe-area insets; no `100vh` (use `dvh`); `overscroll-behavior: none` to block pull-to-refresh.
- **Wiring:** the shell subscribes to the game's events and re-renders the open panel; panels read state and dispatch commands, never mutate.
- **Information level (G-04)** is applied in one place (a `visible(stat, level)` helper), so every panel shows exact values, bands or "?" consistently.
- **As built in M1.1b:** routes `title`, `map` (explore), `pick` (new game), `play`, `saves`, `settings`, `diagnostics`. Explore, pick and play are all `components/mapStage.js` (the map, zoom buttons, hint, and the bookkeeping of what floats over the map) plus their own bars and panels: `panels/countryPanel.js` (with `economyOf` and `actionsFor` slots), `reportPanel.js`, `budgetPanel.js`, sharing `components/sheetHead.js`, `alerts.js` and `why.js`. The screen is a column: the map area (panels slide over it and never over the bar) and the action bar. Only one panel is open at a time. A panel that opens or closes moves the camera so the middle of the part it leaves free keeps the same map point (`mapView.setInsets`). The player's country is outlined by `overlay.setOwn`. Text with money in it uses params named `...Mn` (USD millions), written out by `format.js` `formatParams`, so state and news never hold formatted text. **Failure behaviour:** the picker's strip of countries does not wait for the map, so a phone that cannot draw the map can still start a game (the game screen's HUD, budget, report and End turn need no map either); a screen that throws while it is built sends the player back to the title with a message (`app.render`); a loaded save is checked country by country (`checkStateShape`: government, GDP, tax rate, treasury, debt and the four budget shares), so a damaged or hand-edited file is refused when opened. The budget panel is built once and updated in place, so a held button is never replaced under a finger.
- **As built in M1.2:** the game's action bar is Menu, Budget, Resources, Report, End turn; the status strip has a third row of resource chips (display only; the Resources button opens the details). `panels/resourcesPanel.js` (with `components/resourceCard.js`) shows each resource (price, what the country makes, uses and keeps, shortage and its ladder, Buy and Sell) and the straits with their what-if; the report ends with a resources block; the country panel gained a Resources block, the straits the country trades through, and, for the tapped region, its share of the country, what it makes and (in a game) `components/captureEstimate.js`. `ui/resourcesView.js` gives panels a country's resource lines from the data (the picker) or the running game, like `economyView.js`; `ui/resourceText.js` and `format.js` write them. The straits are markers on the map (`map/overlay.js` `setMarkers`, positions from `geometry.project(lon, lat)`, `map/projection.js`).
- **Look:** system font stack (no web fonts, so offline is trivial), CSS variables for a dark default theme, `prefers-reduced-motion` respected.
- **Text (G-30):** English only. Every visible string lives in `data/i18n/en.json` and is read with `t('key', params)` / `tn('key', n, params)` from `src/util/i18n.js`. A test checks that every key used in code exists in the file. The static HTML shell (page title, loading and no-script text) is filled from the same file at build time, so even that is never hard-coded.

## 11. Persistence

- **IndexedDB**, database `grand-strategy`, stores `saves` (full records), `slots` (a small summary per slot, so the Saves screen never loads whole games) and `settings`. Slots: `auto-1…auto-3` (rotating) and `manual-1…manual-5`.
- **Record:** `{ slot, savedAt, saveVersion, dataVersion, meta: { countryId, year, month, week, turn, scenarioId, difficulty }, state }`. State is stored as a structured-cloneable object (no JSON round trip).
- **Autosave:** after every `turn:end`. The state is cloned at once (the game keeps running while the write happens), and writes are **serialized** so they land in order. Each write is **atomic**: the record, its summary and the rotation pointer go into one IndexedDB transaction, so quitting mid-save can never leave the pointer on a slot with no record. It goes to the *next* rotating slot, so the two previous autosaves survive.
- **Failure handling:** every storage call is guarded and reports a `SaveError` with a code the UI can explain. A Safari "connection is closing" error reopens the database and retries once. If storage is unavailable (private mode, blocked, quota), the game keeps running from memory with a visible notice and offers **Export**.
- **Export/import:** one `.gsave` file (gzip via `CompressionStream` when available, plain JSON otherwise) holding a format header plus the record. Export goes through the system share sheet when possible (the only way out of an installed iOS app), else a download; import accepts either form, checks the header, migrates and loads into a slot.
- **Persistence request:** ask `navigator.storage.persist()` after the first save; Diagnostics shows persisted/quota. iOS Safari can evict storage of sites that are not installed to the Home Screen after about a week of non-use, so install is encouraged and exports are one tap away.
- **Save version 3 (M1.2):** the first economy preview (version 2) has no resources or market, whose stocks and prices would have to be invented, so its migration also refuses with `too_old`; `OLDEST_PLAYABLE_SAVE` is 3.
- **Save version 2 (M1.1b):** the Phase 0b test game (version 1) had no countries, so its migration refuses with `too_old` (a message the player can read); `OLDEST_PLAYABLE_SAVE` lets Continue leave such saves out without calling them damaged. The game is autosaved when it starts and after every turn.
- **Versioning:** `saveVersion` plus a chain of migrations (`migrations[n]: save → save`), with a fixture save per version in tests; `dataVersion` mismatches trigger a repair pass (drop unknown ids, report) or a clear "update the app" message.
- Settings use IndexedDB as well; `localStorage` is used only for tiny UI conveniences, always in try/catch.

## 12. PWA and offline

- **Manifest:** `start_url` and `scope` `./`, `display: standalone`, `orientation: any` (iOS ignores locks anyway), icons 192/512 plus maskable (generated by `tools/make-icons.mjs` using the same Chromium, so no image dependency).
- **Service worker:** precaches every file listed in `build-info.json` into a versioned cache (`gs-<hash>`); install is atomic (if any file fails, the old version stays); activate deletes old caches; fetch is cache-first for same-origin GET with an `index.html` fallback for navigation. No cross-origin requests exist.
- **Updates:** a new worker installs in the background; the game shows "Update ready — Reload" and applies it only **between turns** (never mid-battle), via a `SKIP_WAITING` message and one reload on `controllerchange`.
- **Tests:** Playwright loads the app, waits for the worker, goes offline, reloads, and asserts the game still boots.

## 13. Build, CI and deploy

- **`tools/build.mjs`:** copies `index.html`, `manifest.webmanifest`, `assets/`, `src/`, `data/` (JSON minified) and `vendor/` into `dist/`; hashes the files; writes `build-info.json` and a generated `sw.js`; adds `.nojekyll`. `dist/` is exactly what is served.
- **`ci.yml`** is one workflow with two jobs. **`check`** runs on every push and pull request: checkout → Node 22 → `npm ci` → typecheck → `npm test` → build → e2e (Playwright with the runner's Chrome, phone-sized). **`deploy`** runs after `check` passes, on pushes to branches only: build → `tools/publish-pages.mjs --push`. A failing check blocks deploy. (The first run: both jobs green in about a minute.)
- **`tools/publish-pages.mjs`** (plain git in a temporary worktree): `main` replaces the root of the `gh-pages` branch; any other branch goes to `preview/<branch-slug>/`. It regenerates `preview/index.html` (a list of previews with branch, commit and time), keeps a placeholder at the root until `main` exists, prunes previews of deleted branches, keeps at most 12, makes re-publishing the same commit a no-op, and retries when another deploy pushed first. Needs `contents: write`; deploys share a concurrency group so they never race. Tested against real local git repositories (`tests/unit/publish-pages.test.js`).
- **`tools/bundle-single.mjs` and `tools/publish-download.mjs` (T-18):** after the Pages publish, the `deploy` job runs `npm ci`, builds the one-file download and publishes it with the GitHub CLI as a prerelease named `download-<branch-slug>` (created once, then the file is replaced on every push). Direct link: `https://github.com/mrguymrguy647-del/Real-time-strategy-game/releases/download/download-<branch-slug>/grand-strategy.html`. Releases of deleted branches are not pruned yet.
- **One-time setup (you, on GitHub):** the first deploy creates the `gh-pages` branch (done). Then open *Settings → Pages → Build and deployment → Source: Deploy from a branch → `gh-pages` / `/ (root)`.* Until then the preview URL answers 404.
- **URLs:** `https://mrguymrguy647-del.github.io/Real-time-strategy-game/` (main) and `…/preview/<branch>/` (any branch).
- **Rollback:** revert on `main`; the next deploy publishes the previous good build. Previews can be deleted by deleting the branch.
- **Proven so far:** pushing the workflow file from the Claude Code environment worked, and the deploy job's `GITHUB_TOKEN` created and pushed `gh-pages`. **Not yet proven:** that such a push triggers the Pages build; that can only be seen once Pages is switched on. Fallbacks: a deploy-key secret, or `actions/deploy-pages` for `main` only.

## 14. Testing and QA

**On every commit (fast, `npm test`)**
- **Formulas:** table-driven tests plus invariants (bounds, monotonicity, no NaN, `parts` sum to `value`).
- **Core:** RNG determinism, commands, effects/conditions, clock, save round-trip and migrations.
- **Layering:** the import scan (T-14).
- **Data:** JSON Schema (Ajv) plus referential rules (DATA_SCHEMAS §9).
- **Simulation soak:** `tools/simulate.mjs` runs AI-vs-AI for 3 seeds × 60 turns with invariant checks on.

**In CI and before commits**
- **Types:** `tsc --noEmit`.
- **E2E smoke:** Playwright + Chromium at phone size: boot, new game, five turns, save/load, offline reload.

**When needed**
- **Balance:** `simulate` in batch (hundreds of games) with summary statistics; "golden seed" snapshots are reviewed whenever they change.
- **Visual:** `tools/screenshot.mjs` captures portrait and landscape; I look at the PNGs.
- **On your phone:** the **Diagnostics screen** shows build id, service-worker state, storage persisted/quota, FPS and a turn-time benchmark. One screenshot of it tells me how the game really runs on your device, which is how I calibrate §15.

## 15. Performance budgets

Rule of thumb (an assumption to calibrate with your Diagnostics benchmark): **Node milliseconds × about 4 ≈ a mid-range phone.**

- First cold load on 4G: menu in ≤ 4 s (Phaser about 350 KB gz + app ≤ 150 KB gz + Phase 1 data ≤ 300 KB gz). Warm or offline launch ≤ 1.5 s.
- End of turn: Phase 1 ≤ 50 ms on a phone (≈ 12 ms in Node); Phase 5 whole world ≤ 250 ms (≈ 60 ms in Node).
- Map: 60 fps pan and zoom, never below 30; GPU textures ≈ 64 MB; DPR cap 2.
- JS heap ≤ 150 MB. Save ≤ 2 MB in Phase 5; autosave ≤ 150 ms and non-blocking; load ≤ 1 s.
- Mitigations in order: stagger AI tiers → skip unchanged systems per country (dirty flags) → typed arrays for hot per-region data → worker (T-16).

## 16. Phase 0b — scaffold (built and approved on 2026-10-06)

1. `package.json` (ESM; scripts `test`, `typecheck`, `build`, `serve`, `simulate`, `e2e`, `screenshot`, `validate`, `icons`, `vendor:phaser`), `.gitignore`, `.editorconfig`, `tsconfig.json`. ✔
2. Folder layout from §4; `index.html` with import map, `src/main.js`, a shell with Title, **Play** (a small test game), **Saves**, Settings and **Diagnostics**. ✔
3. Generated manifest and icons, a generated service worker with a content-hash cache, a user-confirmed update toast, iOS install hint, Android install button. ✔
4. `tools/build.mjs`, `tools/serve.mjs`, `tools/vendor-phaser.mjs`; Phaser 4.2.1 vendored. ✔
5. Core with tests: `rng`, `clock`, `bus`, `data` loader, `state`, crash-safe `turn` runner with invariants, `save` (3 autosaves + 5 slots, export/import, migrations) over a memory adapter and an IndexedDB adapter, `stats` and `actions` registries. A scaffold-only `demoRoll` system (a d100 roll) exercises the pipeline and is replaced in Phase 1. ✔
6. Minimal real data (`balance`, `resources`, `governments` with the six types, one scaffold scenario, `i18n/en.json`) with schemas; `tools/validate-data.mjs`. ✔
7. Tests: 139 unit tests (including layering and a build/service-worker test), data validation, a 3-seed determinism soak, 14 Playwright tests (boot, offline reload, saves surviving reload, export/import, update flow, turn-failure rollback, boot-failure retry, Diagnostics, Phaser map benchmark, tap-target and overflow rules at three phone sizes); `npm run screenshot` for phone screenshots. ✔
8. `ci.yml` (checks, then deploy) with previews and `tools/publish-pages.mjs`; README steps for enabling Pages. ✔ (first run green)

**Deviations from the plan above:** one workflow file instead of two (§13); `tsconfig.json` instead of `jsconfig.json`; the manifest is generated by the build instead of kept in the repo; the Play and Saves screens and the `bus`, `state`, `turn`, `invariants`, `stats`, `actions` modules were added because the crash-safe turn and the Diagnostics checks need something real to run.

**Done when:** the preview URL opens on your phone, installs to the Home Screen, opens in airplane mode, a test save survives a reload, Diagnostics is green, and CI is green. **Passed on 2026-10-06** on an Android phone (install, airplane mode, save survives, both orientations). Not yet seen: real-phone Diagnostics numbers (the report arrived as template text); my Node reference for the CPU benchmark is about 15 ms.

## 17. Phase 1 technical plan (sketch)

- **M1.1a (first, G-32) — built:** the interactive map. `tools/build-map.mjs` for the 16-country theater (§9.1), `data/countries.json` and `data/regions.json` (identity, geography, government; economy blocks follow in M1.1b), `src/ui/map/*` (§9.2–§9.7), the map screen (reached from the title screen's *Explore the map*) with the whole world in grey around the Middle East (G-34), and a country info panel. Published as a preview before anything else. Not yet there, by design: ownership tints, the player's country, the country picker (M1.1b).
- **M1.1b — built (G-35, G-36):** `core/state.js` for real play (the `me_2026` scenario), `core/commands.js`, `core/modifiers.js`, `core/scenario.js`, `formulas/economy.js` + `explain.js`, `systems/economy.js` + `economyCommands.js`, the country picker, the game screen, the Budget and the monthly report with its "Why?" lists, autosave at the start and after every turn, save version 2.
- **M1.2 — built (G-37 to G-41):** `formulas/market.js`, `systems/resourceFlows.js`, `resources.js`, `resourceCommands.js`, `resourcePreview.js`, `data/chokepoints.json`, per-country resources and per-region shares in the data, the shortage ladder through `core/modifiers.js`, the Resources panel, strait markers on the map and the capture estimate; save version 3.
- **M1.3:** `systems/war.js`, `formulas/combat.js`, fronts, commands, off-map patrons, diplomacy stub.
- **M1.4:** `systems/endurance.js`, `formulas/endurance.js`, extension levers, basic `stability` and collapse stages.
- **M1.5:** `ai/*`, Regional Power score and endings, balancing with the simulator.

With the first map preview I post the one-screen table of the 16 countries (government type, AI tier) for you to veto (G-14); traits and start conditions follow with M1.1b.

## 18. Evolution notes

- **Worker:** the simulation can move to a Web Worker (T-04, T-16) if Phase 5 profiling needs it; the UI would receive snapshots instead of reading shared state.
- **Bundling:** add esbuild only if request count or load time matters; sources need no change (T-01).
- **Engine swap:** the Phaser adapter (T-02) is the only place that knows about Phaser.
- **World packs:** if the full world is too heavy for some phones, geometry can be split into per-theater files that are cached on demand.
- **Delegation and AI advisors** reuse the AI code (G-20).
