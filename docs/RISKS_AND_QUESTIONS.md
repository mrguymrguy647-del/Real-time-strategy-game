# Questions and Risks

> Related: [../GAME_DESIGN.md](../GAME_DESIGN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_SCHEMAS.md](DATA_SCHEMAS.md)

## Status (2026-10-06): Phase 0b approved, Phase 1 started

**Decided** (your "approved" accepted every ✔ default): Q1–Q6, which were the questions blocking Phase 0b and Phase 1, plus Q8–Q10 and Q15–Q16.
**Decided by your addition:** **G-30** — English only, all UI text in `data/i18n/en.json` (this replaces the earlier answer to Q14).
**Decided later in chat:** **Q17** — your phone is Android (Chrome); iOS Safari stays supported. **Q3** — keep the repo name. **Q13** — keep the title "Grand Strategy" for now.
**Phase 0b gate passed (2026-10-06):** tested on your Android phone — opens full screen from the Home Screen icon, works in airplane mode, a save survives closing and reopening, both orientations usable. The Diagnostics report arrived as the template text only, so I still have no real-phone numbers (CPU speed, map speed test).

**M1.2 (resources and the market, G-37 to G-41) is built** and waits for your test on the phone. You approved M1.1b with the defaults (**Q19**: the report keeps opening after End turn; the starting balance stays as it is) and asked for detailed balance feedback after resources and war are in.

**Phase 1 order (G-32):** you asked for the interactive map first (pan, pinch-zoom, tap a country for its info panel), published as a preview before the economy and war systems. **M1.1a is built and tested by you.** **M1.1b is built** (G-35, G-36): the country picker, the economy skeleton, the budget and the monthly report; it waits for your test on the phone.
**Q7 decided:** you approved the government and AI-tier table as it was.
**World map (G-34):** at your request the whole world is drawn in grey around the Middle East (not playable, not in the simulation). You tested the first map on Android Chrome: pan, pinch and tap feel good, deep zoom is acceptable. **Not yet seen on a real phone:** how the world map feels (R19); the Settings switch *Middle East only* is the way back.
**Not yet seen on a real phone:** touch feel, the map's frame rate and how sharp it looks at deep zoom (the sandbox only has software rendering).
**Parked for later phases:** Q11 (Phase 4), Q12 (Phase 2), Q18 (an APK, default no).

---

## A. Blocking decisions — all decided at approval

**Q1 · Phaser 3 (your spec) or Phaser 4?**  ✔ **Decided: 4.2.1.**
- Facts I checked: Phaser 4.0 shipped on 10 April 2026 and 4.2.1 is now npm's `latest`; 3.90.0 is the last 3.x release. Both booted with WebGL in my phone-sized test. 4.2.1 is 352 KB gzipped, 3.90.0 is 315 KB.
- Why 4: it is the maintained line, and its npm package contains official API guides for AI agents. That matters because phaser.io is blocked in my sandbox. The map needs only Graphics, RenderTexture, the camera and touch input, which migrate with little change.
- Costs of 4: newer (fewer public examples), its Canvas renderer is deprecated (still present, but WebGL is the supported path), and `RenderTexture` drawing needs an explicit `render()`.
- Alternative: **3.90.0 exactly as specified**. Either way Phaser stays behind a one-folder adapter (T-02), so switching later is cheap.

**Q2 · Build tooling: no bundler, or Vite?**  ✔ **Decided: no bundler.**
- Native ES modules plus a tiny Node build script. Nothing to configure or break from a phone, dev equals prod, and Node tests import the same files.
- If load time ever suffers, esbuild can be added without touching the code (T-01).
- Alternative: Vite (hot reload and bundling) at the price of a bigger toolchain that I cannot babysit visually.

**Q3 · Hosting and previews.**  ✔ **Decided: `gh-pages` branch — `main` → site root, every other branch → `/preview/<branch>/`.**
- Your repo is **public**, so GitHub Pages is free. It is **not enabled yet**.
- Why previews: you test from your phone while I work on a branch; previews let you try each push without merging anything.
- **One-time step for you** (the first deploy has created the branch): *Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`.* The exact taps are in the README.
- Optional: the repo is named "Real-time-strategy-game" but the game is turn-based. Renaming is free *now* and breaks URLs later. If you rename, do it between sessions and tell me first.

**Q4 · Phase 1 roster (G-23).**  ✔ **Decided: 16 countries, about 100 regions.**
Turkey, Syria, Lebanon, Israel, Palestinian territories, Jordan, Iraq, Iran, Saudi Arabia, Kuwait, Bahrain, Qatar, UAE, Oman, Yemen, Egypt. Neighbors outside the theater appear in grey as context. Three off-map "patron" great powers and one world market stand in for the rest of the world (G-29). Chokepoints: Hormuz, Suez, Bab-el-Mandeb.
- Alternative: a smaller slice (for example the Gulf plus Iran and Iraq, about 9 countries) to reach a playable build sooner.

**Q5 · What is the Phase 1 goal (G-24)?**  ✔ **Decided: a Regional Power score over 10 years.**
You rank the 16 countries by a score (regional GDP share, controlled population, oil income, stability). You lose by surrender or elimination. It gives the "is it fun?" test a purpose without building the Phase 6 victory conditions early.

**Q6 · Approval gates.**  ✔ **Decided: a gate after Phase 0b (you install on your phone), then one after every phase.** Inside Phase 1 you get five preview builds (M1.1–M1.5) and tell me when something feels wrong; no formal gate between them.
- Each later phase starts with a one-page plan for you to approve.

---

## B. Other questions

**Q7 · Government classification (G-14).**  Open until Phase 1 starts. I propose the table (government type, AI tier, traits, start condition per country) and you veto it before it is committed. The method is neutral and rule-based, and everything is editable data.
**Q8 · Fog of war as uncertainty bands (G-04).**  ✔ Accepted. The map is not hidden; enemy data is exact, estimated, rough or unknown depending on intelligence.
**Q9 · Difficulty changes numbers, never rules (G-21).**  ✔ Accepted.
**Q10 · Leaders are archetypes, never real people (G-18).**  ✔ Accepted.
**Q11 · Can nuclear weapons ever be used? (Phase 4)**  Parked. The spec calls them "a deterrence tool, not an everyday weapon." My suggestion: deterrence plus a catastrophic last-resort strike (maximum World Tension, a global coalition forms), or deterrence only. I will ask again at Phase 4.
**Q12 · Anarchist federation ability (G-15).**  Parked until Phase 2. The spec lists no ability for it. Proposal: **Mutual Aid** (regions share supplies).
**Q13 · Game title, repo license.**  Open, not blocking. Working title "Grand Strategy" (one line in `data/i18n/en.json`); the repo has no license, so by default all rights are reserved. Decide before any public release.
**Q14 · Language and analytics.**  ✔ Decided: **English only** with every UI string in `data/i18n/en.json` (G-30); no analytics or telemetry of any kind (fully offline).
**Q15 · Saves.**  ✔ Accepted: 3 rotating autosaves plus 5 manual slots, with export/import.
**Q16 · "Not yet" on the capital-battle dialog (G-05).**  ✔ Accepted. My addition to the spec's two buttons, so nobody is forced into a hopeless assault.
**Q17 · Your phone: iPhone or Android?**  ✔ Decided: Android (Chrome). The app still supports both; my install and test instructions lead with Chrome.
**Q18 · A real download file?**  You asked for a "download link" after the 0b hand-off, so there is now a **single-file download** (T-18): one HTML file, sent to you directly and published by CI as a GitHub Release asset. It plays offline but cannot be installed or update itself. An **Android APK** stays parked. Default: **no, not now** — the plan (spec §2) is an installable web app, and Chrome's Install puts it on your Home Screen like any app. An APK would need new build tools (for example Capacitor plus an Android build in CI), your approval for the new dependencies, and extra work so save export and the back button behave. Revisit in Phase 7 (polish) if you want it.
**Q19 · The monthly report opens by itself after End turn.**  Open, not blocking. Default: yes (it is the point of the turn, and the action bar stays free, so a fast player just taps End turn again). If it gets in the way, a Settings switch is a ten-minute change. Related defaults I picked in M1.1b: a country's *role* label comes from its AI tier (major power, mid-size power, small state); the game autosaves when it starts and after every turn, not after each budget change.

---

## C. Risk register

Each entry: what could go wrong → what I do about it.

**R1 · Scope.** The spec is the size of a commercial grand-strategy game. → Strict phases; every system gets a minimal v1 first and grows through data; five playable milestones inside Phase 1; I cut scope before quality.

**R2 · Balancing blind.** Seven interlocking systems can death-spiral, and I cannot play like a human. → A headless **simulator** runs hundreds of seeded AI-vs-AI games and reports statistics; invariants catch NaN and negative stocks; every key number has a "why?" breakdown; all constants live in `balance.json`; you answer five playtest questions after Phase 1.

**R3 · Map performance on mid-range phones.** *Measured:* redrawing 1,500 polygons as live vector graphics ran at about 10 fps, versus about 60 fps when baked into a texture (software GL, so read it as a ratio). → Bake the map, redraw only dirty regions, cap the pixel ratio at 2 and textures at 4096, keep a region budget (about 100 in Phase 1, about 1,200 in Phase 5), and show FPS in the Diagnostics screen.

**R4 · I cannot see your phone.** Real Safari and Android Chrome differ from emulated Chromium (touch feel, memory, GPU). → Phone-sized screenshots in CI, a Diagnostics screen you can screenshot back to me, iOS-safe CSS (`dvh`, safe areas, no hover-only UI), and early installs on your phone (Phase 0b gate). *What only a real device can confirm:* Home Screen install, an airplane-mode launch, the iOS share sheet for exporting a save, touch feel, and true Phaser speed (the Diagnostics map benchmark; the headless numbers come from software GL).

**R5 · iOS storage eviction.** Safari may clear site data after about a week of non-use unless the app is installed to the Home Screen. → Encourage install, request persistent storage, one-tap export/import, rotating autosaves, a "last backup" reminder.

**R6 · Service-worker staleness.** Old cached code could meet new saves or data. → Versioned precache, updates applied only between turns after you tap Reload, save migrations, a data-version check with a repair pass.

**R7 · Pages deploy from CI.** One manual repo setting is required. *Outcome so far (first CI run):* the checks and the deploy job both passed, and the deploy job's `GITHUB_TOKEN` created `gh-pages` with the preview in it. *Still to prove:* that a push from CI triggers the Pages build — visible only after you switch Pages on and the next push deploys. → If it does not, fallbacks are a deploy-key secret or `main`-only deploys through `actions/deploy-pages`.

**R8 · World data workload and accuracy.** About 195 countries with economy, military and resource numbers, plus about 1,200 regions, is a lot of data and easy to get wrong. → Phase 1 is hand-curated for 16 countries; Phase 5 uses an import script from public datasets (World Bank, SIPRI, EIA…) with `source`/`asOf`; minor countries get coarse data; numbers are rounded and balanced for play, not published as statistics (G-22).

**R9 · Geopolitical sensitivity.** Disputed borders, place names and government labels in the Middle East are sensitive. → Natural Earth's de facto defaults, `contested` flags with neutral names, rule-based government classification you can veto (Q7), no real leaders (Q10), no claims in labels or text (G-22).

**R10 · AI emergent weirdness.** Same-rules AI across many systems can spiral into coalition chains, bankruptcies, or suicidal wars. → Utility-based AI with sanity guards ("don't start a war you cannot pay for"), decision traces to answer "why did they do that?", soak tests, bounded personalities.

**R11 · The capital battle is a game inside the game.** → Built only in Phase 2, after the war model works; one state machine serves both deep and auto-resolve; a narrow interface to the war system (ARCHITECTURE §8).

**R12 · UI density on small screens.** Many systems, little room. → Bottom sheets, progressive disclosure, an alerts queue, tap-to-reveal "why?" popovers; delegation (G-20) can move earlier if micromanagement bites.

**R13 · Engine dependency.** Phaser adds about 350 KB gzipped and carries version risk. → A thin adapter, a pinned vendored build, and a simulation that never imports it (T-02, T-03, T-04).

**R14 · Save compatibility.** Content changes can break old saves. → Permanent ids with `aliasOf`, versioned migrations with fixture saves, `dataVersion` checks, a repair pass.

**R15 · Sandbox network limits.** unpkg, jsDelivr and phaser.io are blocked; only the npm registry and Natural Earth hosts are confirmed reachable. → Vendor everything the browser needs; if I need another host, I will ask you.

**R16 · Editing JSON blind from a phone.** A typo could break the data. → Strict schemas, CI as a gate, preview URLs; a broken data file never reaches `main`.

**R17 · Session continuity.** Each cloud session starts cold, and the container is discarded when it ends. → Everything worth keeping is committed and pushed; `CLAUDE.md` holds status and decisions; each phase has a written plan.

**R19 · The grey world could slow the map on a weak phone.** The world adds a second small picture (8 MB), a crisp redraw of the screen's surroundings after the camera rests (drawn at CSS-pixel density, about 3 MB), 236 more names to place and a bigger camera range. → The theater's pictures are unchanged and the world follows after the first frame; the overview is not drawn when the theater or the redraw covers the screen; pictures are plain textures, which saves more memory than the world uses (T-20); the redraw is a pure decision tested without a browser. Measured in the sandbox only (software rendering: first frame the same, panning inside the theater about 20-30% slower per frame). **Safety valve:** Settings → Map → *Middle East only*. If a phone struggles anyway, the next steps are a lower redraw density, no redraw (overview only), then dropping the sharp theater picture in favour of a redraw.

**R18 · The one-file download can drift from the web app.** It is built from the same sources, and since M1.1a it carries Phaser too (base64 in the page, loaded through a Blob URL on first use), so the map works from it. A file opened from a phone's Downloads may still get no storage or a stricter viewer. → Tests open it from disk and inside a locked-down frame (memory saves with a notice; the map and its engine load there too); screen switching does not depend on the URL. **Not yet seen on a real phone:** an in-app viewer that blocks Blob URLs would show the map's "could not be shown" message; open the file in Chrome.

**R20 · The economy numbers are rough.** The 16 starting economies are rounded, game-balanced approximations (G-22). *Since M1.2* the tax rate is the taxes alone and the state's income from selling oil and the rest is separate (G-39), and every starting balance is where you approved it (the retune is checked by the validator). Over ten years with no one adjusting anything, the simulator shows every economy staying sane (no collapse); the countries with a surplus pile up cash and keep their debts (nobody repays by themselves: only the player's Repay buttons do, and the AI does not use them yet), and a few borrow (Iran, Syria, Yemen, the Palestinian territories, and Iraq a little once its oil money falls behind its GDP: R22). → Numbers live in `balance.json` and `countries.json`; M1.5 balances with the simulator. **What I need from you:** whether the starting situation of the country you picked *feels* right (is it too easy, too hard, too boring?), not whether each number is exact.

**R21 · Importers feel world prices only through growth.** An importer pays no import bill out of the treasury (the nation pays, G-39); a dearer oil costs Türkiye or Jordan a little growth (a quarter of the change in its yearly trade bill, as a share of GDP: about −0.1 points a year for Türkiye while oil stays 20% dearer, −0.4 for Jordan; a seller gains more: +1.9 for Iraq) and makes reserves dearer to buy, but nothing hits their budget. Likewise a blockaded exporter loses the state's share of what it can no longer sell, but its GDP is untouched. That keeps the starting balances you approved, but a price spike may feel too gentle for an importer. → One number (`growth.resourcePrices` in `balance.json`), or a real import bill as a new spending line; decide after you have played wars and seen how prices move.

**R22 · Production and consumption do not grow.** Both are fixed at their starting figures (G-37), so an exporter's resource income stays flat while its GDP and its budget grow: after ten years Iraq's oil pays 24% of GDP instead of 30% and its balance slips to about −3% of GDP, and Kuwait's surplus shrinks from +4% to about +1%. → Production and use could grow with GDP (one exponent per resource) in the M1.5 balance pass; it also lets importers' deficits grow.

**R23 · A shortage needs a blockade, and nothing causes one yet.** In peace every route is open, so no one runs short; the Resources panel shows the ladder, the reserves and "What if it closed?", and the tests and the e2e close a strait directly, but a player cannot see a real shortage until wars can close a strait (M1.3: control of the regions beside it). Importers with thin reserves (Syria, Yemen, Lebanon, the Palestinian territories) carry low-reserve warnings from the first turn. → Say if you would like a way to try a closure sooner (for example a switch in Settings); my default is no, because it would be a cheat button the finished game does not have.

**R24 · Region shares and resource figures are approximations.** Each region's share of its country's people, GDP and production (96 regions × 6 numbers) is my estimate from public sources, rounded; production, consumption and stocks of the four resources for 16 countries are converted to game units (oil 10 million barrels, food 100 kt of grain-equivalent, steel 100 kt, rare minerals 1 kt, an abstract index). Good enough to make the picture right (Basra is Iraq's oil, Eastern Province Saudi Arabia's, Kuwait imports almost all its food), not to quote (G-22). → Every number is data, and the sources are named in `countries.json`; tell me when one looks wrong.
