# Questions and Risks

> Related: [../GAME_DESIGN.md](../GAME_DESIGN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_SCHEMAS.md](DATA_SCHEMAS.md)

## Status after your approval (2026-10-05)

**Decided** (your "approved" accepted every ✔ default): Q1–Q6, which were the questions blocking Phase 0b and Phase 1, plus Q8–Q10 and Q15–Q16.
**Decided by your addition:** **G-30** — English only, all UI text in `data/i18n/en.json` (this replaces the earlier answer to Q14).
**Decided later in chat:** **Q17** — your phone is Android (Chrome). iOS Safari stays supported.

**Still open — none of these stops me from building:**
- **Q3 (rename) · Rename the repo?** Default: keep the current name.
- **Q13 · Game title.** Default: keep the working title "Grand Strategy" (it is one line in `data/i18n/en.json`).

**Comes up at the start of Phase 1:** Q7 — I send you the 16-country classification table to veto.
**Parked for later phases:** Q11 (Phase 4), Q12 (Phase 2).

**Needs you now (the Phase 0b gate):** (1) switch on GitHub Pages once (README, "Try it on your phone"); (2) open the preview on your phone, install it, and run the four checks; (3) paste the Diagnostics report and say "approved" or tell me what felt wrong. Phase 1 starts only after that.

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
