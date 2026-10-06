# Game Design Document

**Modern-era offline grand strategy for phones** · working title *Grand Strategy (TBD)*

> **Status:** Phase 0b approved on 2026-10-06 after your test on an Android phone. Phase 1 is in progress: the interactive map (M1.1a, G-32, G-33) and the grey world around it (G-34) are done and you tested the map; the country picker, economy skeleton, budget and monthly report (M1.1b, G-35, G-36) are built and waiting for your test. Resources and the world market (M1.2, G-37 to G-41) are built and wait for your test. Next: your feedback on the economy and the resources, then normal war (M1.3).
> This file says **what the game is**. How it is built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Data formats: [docs/DATA_SCHEMAS.md](docs/DATA_SCHEMAS.md). Open questions and risks: [docs/RISKS_AND_QUESTIONS.md](docs/RISKS_AND_QUESTIONS.md).
>
> Section numbers match your original spec (§1–§12). `[P1]`–`[P7]` mark the roadmap phase where a feature first appears. `G-nn` marks a decision I made where the spec was ambiguous (Appendix A) — tell me to change any of them.

## At a glance

- Turn-based, **1 turn = 1 month**. Every country is AI-controlled except the one you pick.
- 100% offline, installable PWA, built to be played and tested on a phone.
- War, economy, resources, diplomacy, technology and government feed each other: **every success creates a new problem**.
- Two-tier war: fast auto-resolved fronts, plus a deep **Capital Battle** (1 turn = 1 week) that you may command or auto-resolve.
- Long wars are very expensive, not impossible: a **War Endurance** meter says how many months you can last — and what limits you.
- Content is data (JSON). Formulas are pure, tested functions.

## Design pillars

1. **Every decision has a price.** No free power; options show their cost before you pick them.
2. **Causes are visible.** Nothing important is "just random." Any number or event can answer *why?* with its top drivers.
3. **Systems interlock.** Unpaid salaries cause desertion; an oil shortage grounds aircraft; heavy bombardment brings sanctions.
4. **Phone first, offline always.** Large tap targets, short sessions, no server.
5. **Content is data, code is rules.** Adding a country, event or technology never needs a code change.

---

## 1. Overview

- **Genre:** turn-based grand strategy, modern era (present day onward).
- **Mode:** single-player versus AI, 100% offline. No servers, accounts or multiplayer.
- **Scope:** every country exists and is AI-controlled; the player picks any country. Phase 1 starts with one region (§12).
- **Turn length:** 1 turn = 1 month. During a Capital Battle, 1 turn = 1 week (G-01).
- **Start date:** January 2026, editable per scenario (G-27).
- **Core fantasy:** every decision has a price.

### The monthly loop (player view)

1. Read the **monthly report**: news, alerts, forecasts (endurance, shortages, ultimatums).
2. Make a few decisions: budget, stance per front, diplomacy, research, government actions.
3. Tap **End Turn**. The world updates; AI countries act under the same rules.
4. Repeat. Target: under 30 seconds per turn in peace, 1–3 minutes in a hot war.

## 2. Platform and constraints (summary)

Details live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- Mobile-first web game, installable **PWA**, fully offline (a service worker caches all code and data).
- JavaScript ES modules. **Phaser 4.2.1** draws the map and the battle; HTML/CSS draws menus and panels.
- **English only.** Every piece of UI text lives in one file, `data/i18n/en.json` (G-30).
- **IndexedDB** saves: multiple slots, autosave every turn, all storage calls wrapped in try/catch, plus export/import as a backup.
- Map: Natural Earth (public domain), simplified, with each country split into a manageable number of regions.
- Hosting: GitHub Pages.
- Performance budget: the whole-world end of turn must stay fast on a mid-range phone, so AI is tiered and nothing heavy runs per frame.
- UI: touch-first, big tap targets, pinch-zoom and pan, landscape preferred for the map, menus also work in portrait.
- Graphics: simple and clean first (flat colors, icons); polish in Phase 7.

---

## 3. War (two tiers)

### 3.1 Normal war — simple and fast `[P1]`

- Each **front** has a front line that moves region by region (G-03).
- One clear strength formula per side: `units × technology × supply × morale` (draft numbers in Appendix B).
- The player makes few decisions: a **war budget allocation** and a **stance per front: Attack / Defend / Hold**.
- Battles auto-resolve every turn. The report is short and says *why*: "+18% advantage: better supply, higher morale."
- Forces are abstract strength pools assigned to fronts automatically, not individual unit tokens (G-02).

### 3.2 Fog-of-war chaos events — cause-driven, never purely random `[P2]`

Every event shows its visible **causes** and the **levers** you have to reduce them. (The drivers below are my initial proposals; they live in `events.json` and can be edited.)

- **Friendly fire** — causes: poor training, weak communications, heavy bombardment near own troops. Levers: training budget, communications tech, bombardment limits.
- **Desertion** — causes: low morale and **unpaid salaries** (direct link to the economy). Levers: pay on time, win battles, propaganda.
- **Surrender** — causes: encirclement with no supply. Levers: keep supply lines open, retreat early, air resupply.
- **Officer defection to the enemy** — causes: an army unhappy with the regime, enemy influence. Lever: keep the army loyal.
- **Unit mutiny** — causes: unpaid salaries, heavy losses, low morale.
- **Ammunition shortage** — causes: low steel stock, damaged industry, stretched supply.
- **Heroic commander** (a *good* event) — more likely after a long defense against the odds.
- **Bad weather** — grounds air power; depends on season and region; reduced by all-weather technology.

Each roll is `baseline + weighted drivers`, capped, and the battle report lists the drivers.

### 3.3 Capital Battle — deep mode `[P2]`

**Trigger:** a front reaches the region adjacent to an enemy capital (G-05).
**Time slows:** 1 turn = 1 week while a battle involving the player is active (G-01).

**Districts.** The capital is split into districts, each with a function:
- **Airport** — air resupply (supply drops, evacuation, air strikes).
- **Port** — supply route by sea.
- **TV station** — morale and propaganda, for both sides.
- **Industrial zone** — local production of ammunition and replacements.
- **Presidential palace** — the final objective; taking it makes the capital fall.

**Siege.** If the capital is encircled, supplies and food drain every turn; the starvation timeline is shown in advance.
**Urban warfare.** Strong defender advantage; storming is costly.
**Special units** appear only here: special forces, snipers, drones.

**Attacker options:** fast, costly **assault** · long **siege** (starvation) · heavy **bombardment** (fast, but causes international outrage and sanctions) · offer **surrender terms**.
**Defender options:** **last stand** · call **allies for relief** · **negotiate** · **relocate the government** to another city — the capital falls, but the war goes on as an insurgency that drains the occupier for years (G-07).

**Outcomes**
- Formal surrender → **peace treaty**: annexation, puppet government, or reparations.
- Failed assault → the front is pushed back.
- Government in exile → long resistance.

### 3.4 Command or Auto-Resolve `[P2]`

Before a capital battle (attacking *or* defending) a dialog shows the **estimated win probability** and the buttons **Command the Battle** / **Auto-Resolve** (plus **Not yet**, G-05).
- Auto-resolve is about **10% less effective** for the player's side, to reward manual play without forcing it (G-06).
- The estimate is a range when your intelligence is poor (G-04).
- Settings: **Always ask** / **Always auto-resolve** / **Always deep battle**.

### 3.5 Cooldown — logical, not an arbitrary timer `[P2]`

- The **attacker** suffers war exhaustion and needs several months to regroup before another attempt (G-11).
- A **successful defender** gets a period to rebuild fortifications (G-11).
- The deep battle happens **once per capital per war**; later attempts in the same war auto-resolve (G-08).

### 3.6 Losing the capital — a shock, not instant game over `[P2]`

- Immediate collapse of stability and morale.
- Large economic loss (capitals produce a big share of national income).
- Some allies abandon you; some regions surrender or declare independence.
- The government-in-exile option remains.
- **Game over only on formal surrender or loss of the last major city** (G-09).

### 3.7 AI vs AI wars `[P1]`

Always resolved with the simple system, even at capitals, and shown to the player as **news**. The deep capital screen opens only when the player is a participant.

---

## 4. Economy and war endurance

### 4.1 Core economy `[P1]`

GDP, budget, taxes, spending categories (**military, research, welfare, infrastructure**), debt, inflation, trade income.

### 4.2 War Endurance meter `[P1]`

Shown as an estimate: *"You can sustain this war for about N months — limited by: Oil."* Recalculated every turn from treasury reserves and economy size, monthly war cost (upkeep, losses, intensity), resource access (especially oil), sanctions and blockades, and public support.
- Endurance is the **minimum of three runways: Money, Resources, Will**; the UI names the one that binds (G-10).
- **Design goal:** long wars are very expensive, *not impossible*. A well-prepared player who accepts the later cost can extend a war.

### 4.3 Extending endurance — each with a price `[P1]`

- **Borrow:** extends the war; interest strangles you afterward.
- **Print money:** fast; causes inflation and anger.
- **Raise taxes:** immediate income; lower approval.
- **War-economy mode:** factories switch to military production; consumer goods vanish.
- **Allied aid:** generous, but creates dependency and allied demands.

### 4.4 Gradual collapse — with warnings before each stage `[P1]`

1. **Strain:** inflation, shortages, protests.
2. **Crisis:** delayed soldier salaries → desertion rises (§3.2), strikes, production falls.
3. **Collapse:** mutinies, coup risk, regions secede, forced negotiations.

Each stage is forecast in advance (warnings at about 6 and 3 months of endurance).

### 4.5 Modifiers `[P1]`

- **Defender advantage:** a population defending its own soil endures longer.
- **Post-war burden:** debt and reconstruction take years — a natural cooldown before the next war.
- **The AI follows the same rules** and seeks peace when its endurance is low, so outlasting an enemy is a valid way to win.

---

## 5. Resources

A small list; each resource has a clear, irreplaceable role.

- **Oil** — fuel for tanks, aircraft and ships; major export income. Shortage slows, then stops, mechanized units and grounds aircraft.
- **Food** — population stability; shortage causes protests and famine.
- **Steel / Iron** — units, factories, infrastructure (and ammunition output).
- **Rare minerals** — required for advanced technology (drones, precision missiles, modern jets). Found in few countries; the most valuable.
- **Water** — *optional module, disabled until after Phase 5* (G-12): rivers and dams controlled by upstream countries.

**Mechanics that make resources worth a war** (all `[P1]` unless noted)
1. **Realistic uneven distribution:** no country is self-sufficient.
2. **Visible effects of shortage** on units and population, not just numbers.
3. **Link to endurance:** import dependence becomes a weakness under blockade.
4. **Dynamic world market:** prices react to wars and events; when a major producer is at war, other producers profit.
5. **Strategic targets:** oil fields, ports and chokepoints (Hormuz, Suez, Malacca…). Controlling a strait can choke trade for many countries. Phase 1 has Hormuz, Suez and Bab-el-Mandeb.
6. **Scorched earth** `[P2]`: a retreating defender can sabotage resource sites; captured sites need months of repair.
7. **Strategic reserves:** stockpiling before a war rewards planning.

**UI requirement:** tapping a resource region shows a quick estimate, e.g. *"Capturing this region: +12% income, +4 months endurance, high sanctions risk."* It is computed by pure "what-if" functions that reuse the real formulas (ARCHITECTURE §6.8).

---

## 6. Diplomacy `[P3]`

Phase 1 has only a stub: declare war, ceasefire/peace offers, and the off-map patrons (G-29).

### 6.1 Three meters per country pair

- **Relations** — do they like you?
- **Trust** — do they believe your promises? Collapses after betrayal; **the AI remembers betrayals for years** (G-13).
- **Fear** — do they fear your power? A country can like you and still ally against you out of fear.

### 6.2 Tools

Defensive alliance · full alliance · trade agreement · arms deal · non-aggression pact · sanctions · oil embargo · ultimatum · guarantee of independence.

### 6.3 Tension and danger

1. **Counter-coalitions:** aggressive expansion raises your **threat level**; neighbors automatically band together against you.
2. **Betrayal:** allies may abandon you if your war goes badly or your enemy makes them a better offer.
3. **Ultimatums with countdowns:** "Withdraw within 3 months or we declare war."
4. **Domino effect:** alliance chains can drag a small war into a world war.
5. **Secret agreements:** countries can conspire against you; discovered only through intelligence or when they strike.

### 6.4 Rule-changing systems

- **International organization with votes** (fictional "International Council", G-28): resolutions such as arms embargoes, no-fly zones and comprehensive sanctions impose real gameplay restrictions. Major powers hold a **veto**.
- **World Tension meter:** higher tension makes AI more aggressive, raises oil prices and makes alliances trigger faster.
- **Global crises:** recession, energy crisis, pandemic reshape every country's priorities at once.
- **Regime change:** a coup or revolution can flip an ally into an enemy overnight.

---

## 7. Technology `[P4]`

**Principle:** every powerful technology has a counter, so no single weapon dominates.

### 7.1 Branches

- **Military:** drones, precision missiles, air defense, newer tanks and aircraft.
- **Economy & Industry:** automation, resource output, lower production costs.
- **Cyber & Intelligence:** hacking, espionage, satellites, electronic warfare.
- **Energy:** reducing oil dependence via renewables or civilian nuclear power.

### 7.2 Funding

The research budget is a share of national spending and competes with military and welfare. Advanced technology requires **rare minerals**.

### 7.3 Acquisition — each with risk

- **Own research:** slow, safe, independent.
- **Buy from an ally:** fast, but creates dependency. If the supplier sanctions you, spare parts stop and imported aircraft are grounded.
- **Espionage theft:** cheap; exposure causes a diplomatic scandal.
- **Capture:** seize enemy factories and research centers.
- **Brain drain:** scientists flee unstable countries toward rich, safe ones.

### 7.4 Game-changing technologies and counters

- **Drones** make war cheaper for small states → countered by **electronic warfare**.
- **Cyber attacks** damage an enemy economy *without declaring war* (a gray zone between war and peace) → countered by **cyber security**.
- **Satellites** remove fog of war for the owner (they raise your information level, G-04).
- **Missile defense** protects cities but is very expensive and can be saturated.
- **Nuclear program:** a deterrence tool, not an everyday weapon. Starting one triggers an international crisis, sanctions, possible preemptive strikes and a sharp rise in World Tension — the highest-risk path in the game. *(Open question Q11: can nuclear weapons ever be used?)*

### 7.5 Diffusion

Old technologies get cheaper and spread over time, so any lead is temporary. Players balance spending now against strength later.

---

## 8. Government systems `[P2]`

**Principle:** no system is strictly best; each has strengths and a price. Classification of real countries is simplified, neutral and stored in an editable data file (G-14).

### 8.1 Government types

- **Democracy** — *+* stronger economy and innovation, higher international trust. *−* elections can be lost (policies change); declaring war needs public support; war weariness rises fast. **Ability: Mobilize Public Opinion** (temporary war-support boost).
- **One-Party / Authoritarian** — *+* fast decisions, war without approval, long-term planning. *−* higher corruption, brain drain, **hidden discontent that erupts suddenly**. **Ability: Emergency Decree** (implement a policy instantly).
- **Monarchy** — *+* stability, historical legitimacy, strong loyalty. *−* succession crises when the ruler dies. **Ability: Call to Loyalty** (calm a crisis).
- **Military Junta** — *+* cheap, fast conscription and a strong army. *−* weaker economy, international isolation, frequent coups. **Ability: General Mobilization** (rapidly expand the army).
- **Communist (command economy)** — *+* the state owns everything; can switch the economy to war instantly; industrializes quickly. *−* over time: stagnation, black markets, weak innovation, difficult trade with market economies. **Ability: Five-Year Plan** (set a major goal; success gives a large bonus, failure shakes stability).
- **Anarchist (stateless federation of local councils)** — *+* **no capital to capture**; every region resists independently, so occupation is a nightmare; excellent for defensive and guerrilla play. *−* cannot sign formal alliances or field a large organized army; slow research and industry. Capital Battle (§3.3) does not apply; **region-by-region resistance** is used instead (G-15).

### 8.2 Power centers

Every country has three internal power centers: **Army, Business Elite, People**. Each government type depends on a different one (democracy → People, junta → Army, …). Angering the center your regime relies on leads to the matching failure: lost elections, a coup, or a revolution.

### 8.3 Changing government

Through gradual reforms, coups or revolutions, followed by a **chaotic transition period**. Diplomatic relations shift: similar systems lean toward each other.

---

## 9. State condition (separate from government type) `[P2 basics · P5 factions]`

Any government can decline through a **State Cohesion** meter with five stages: **Stable → Troubled → Crisis → Failed → Collapsed.**

- **Failed state:** the government exists in name but controls only the capital area; warlords and militias hold regions.
- **Collapsed state:** the country splits into factions, each acting as a small AI-controlled state.

**Gameplay**
- **Reunification campaign:** play a weak government or one faction; reunify by force, negotiation, or both. Collapse is not game over for you (G-16).
- **Proxy wars:** foreign powers fund and arm factions, turning the country into a great-power battleground (links to §6).
- **Neighbor effects:** refugees, smuggling and border chaos for neighbors, plus chances to intervene.
- **A real downward path:** long wars and economic collapse can push *any* country, even a superpower, into this state.

**Internal stability** (approval, protests, unrest, coups, secession) connects Economy, War, Government and State Condition. Cohesion is the *slow* meter that integrates stability over time (G-17).

---

## 10. AI design `[P1 simple · P3 diplomacy · P5 tiers at scale]`

- **Same rules as the player.** No hidden cheating at Normal difficulty; the AI issues the same commands the UI does (G-21).
- **Leader personalities**, randomized each game (aggressive, cautious, opportunistic…). They are archetypes, not real people (G-18). The same country behaves differently each playthrough.
- **Tiered AI for performance:** major powers get full strategic AI; minor countries use simplified rules and think less often (G-19).
- The AI seeks peace when endurance is low, forms coalitions against threats, remembers betrayals, and exploits weakness.

---

## 11. Anti-boredom and replayability `[mostly P6, with early hooks]`

**Within a playthrough**
- **Success creates problems:** larger empires have higher admin costs, rebellious occupied regions, and coalitions against them.
- **Rising rivals:** AI powers emerge mid-game to challenge the player.
- **Escalating crises:** financial crashes, energy crises and climate disasters intensify over decades.
- **National missions:** short-term goals per country (e.g. "Achieve energy independence within 5 years") with rewards.
- **Delegation:** as the country grows, delegate the economy or specific fronts to automated ministers/commanders (G-20).

**Across playthroughs**
- **Every country plays differently** through national traits and starting challenges (small oil-rich state, large poor nation, landlocked country). Small countries are a natural hard mode.
- **Two world modes:** Real World (realistic data) and Randomized World (shuffled resources, regimes, relations).
- **Starting scenarios:** New Cold War, Oil Price Collapse, Global Crisis.
- **Multiple victory conditions:** military dominance, economic dominance, leadership of the international organization, technological supremacy.
- **Challenges and achievements:** e.g. "Win as a small country without a single war."
- **End-of-game history log:** a summary written as news headlines telling the story of your reign.

---

## 12. Roadmap

Each phase ends **playable and deployed**. Acceptance criteria: Appendix C.

- **Phase 0 — Setup.** *0a:* these documents (you approve). *0b:* repo scaffold, PWA shell with offline caching, GitHub Pages deploy with branch previews, save/load, data validation and the test harness.
- **Phase 1 — Regional MVP (Middle East).** Playable map, basic economy, the four core resources, normal war, war endurance, simple AI. Goal: *is it fun?* Built as five playable milestones.
- **Phase 2 — Depth.** Capital battles (deep + auto-resolve + cooldown), chaos events, government types and power centers, internal stability.
- **Phase 3 — Diplomacy.** Three meters, tools, coalitions, ultimatums, international organization, World Tension.
- **Phase 4 — Technology.** Branches, acquisition paths, counters, nuclear deterrence, diffusion.
- **Phase 5 — The World.** All countries, tiered AI, performance optimization, state condition and collapse/factions, proxy wars.
- **Phase 6 — Replayability.** Scenarios, randomized world, national missions, victory conditions, achievements, history log, delegation.
- **Phase 7 — Polish.** Visuals, sound, balancing, tutorial, optional native packaging later.

---

## Appendix A — Decision log

Where the spec was ambiguous I chose the simplest version that keeps its intent.

**G-01 · Time model.** Normal turns are 1 month. While a Capital Battle involving the player is active, turns are 1 week (4 weeks = 1 month). World systems (economy, AI, diplomacy…) still tick **once per month boundary**; only battle systems tick weekly. When the battle ends, play returns to monthly turns at the next month boundary. *Keeps "time slows" without running the whole world four times as often.*

**G-02 · Abstract forces.** No individual unit tokens on the map. Each country has force *pools* by class (land, armor, air; special forces and drones later), assigned to fronts automatically by weight. The player sets budget and stances, not unit moves. *Matches "few decisions" (§3.1) and keeps turns fast.*

**G-03 · Fronts and control.** A **front** is the border between two belligerents, split into **sectors** (pairs of adjacent regions). Each region has an *owner* (legal) and a *controller* (who holds it now). Taking a region is gradual: attackers build **progress** against its *hold value* (size × terrain × fortification), and the region flips when full. *No all-or-nothing flips; front lines stay readable.*

**G-04 · Fog of war = uncertainty bands.** The map itself is not hidden. Enemy strength, stockpiles and plans are shown at an information level set by your intelligence: *exact*, *estimate* (about ±15%), *rough* (about ±30%) or *unknown*. Borders, alliances, spies and satellites raise the level. Phase 1 shows *estimate* for adjacent enemies. *The simplest model that makes satellites (§7.4) meaningful.*

**G-05 · Capital Battle trigger and queued decisions.** The offer appears when an attacker holds a region adjacent to the enemy capital's region and has an *Attack* stance toward it (and when an AI attacks *your* capital). The dialog offers **Command the Battle**, **Auto-Resolve**, and **Not yet** (the stance falls back to Hold) — *"Not yet" is my addition so nobody is forced into a hopeless assault.* Offers, ultimatums and event choices are **queued as pending decisions** that must be answered before the next End Turn; the turn never pauses halfway. Only one deep battle runs at a time; others auto-resolve.

**G-06 · One battle model, two ways to play.** Deep mode and auto-resolve run the *same* weekly battle model. Auto-resolve is an autopilot choosing the player's actions, with the player's side at **×0.90 strength** (`autoResolvePenalty`). The win probability in the dialog is the share of 200 simulated autopilot runs the player wins, using a *copy* of the random generator so the estimate never changes the outcome. *Consistent results; the "10%" is one tunable number.*

**G-07 · Government in exile.** Available to a defender whose capital is threatened. The capital falls (with a reduced stability and morale shock), the seat of government moves to a safe controlled region or to an allied country that agrees to host, and the war continues as an **insurgency**: each occupied region gets a *resistance* meter that costs the occupier money and stability every month for years and can flip the region back. The exile keeps a smaller income (remaining regions, aid). *Delivers "drains the occupier for years" with one extra meter per region.*

**G-08 · Once per capital per war.** Each war has an id; each capital gets at most one deep battle per war. Later assaults on it in the same war auto-resolve. A *new* war can have a new deep battle.

**G-09 · Game over.** (a) A formal surrender or forced capitulation, or (b) you control no region with a major city and have no exile seat. Losing the capital alone is a shock, never game over. A "major city" is a city tagged `capital` or `major` in region data.

**G-10 · Endurance = the minimum of three runways:** Money, Resources, Will (public support). The UI shows the months left and names the limiting factor. Defending your own soil adds +25% to the Will runway. *Tells the player what to fix.*

**G-11 · One regroup timer.** After a capital battle the attacker is *exhausted* and a successful defender is *rebuilding fortifications*, both for `capitalRegroupMonths` (default 4). One timer, two effects.

**G-12 · Water is a disabled module** (`enabled: false` in `resources.json`) until after Phase 5.

**G-13 · Betrayal memory.** A betrayal lowers trust *and* sets a "betrayal scar" that caps how high trust can recover. The cap rises only about 1 point per 6 months, so the memory lasts years.

**G-14 · Government classification** is simplified, neutral and editable. Six types in v1. A real government that fits none cleanly (e.g. a theocratic system) is assigned to the nearest type by a stated rule and can be edited in `countries.json`; adding a type is a data-only change. Rule: monarchies and one-party systems by constitutional form; others by broad democracy-index bands; ruling militaries → junta. **I will show you the Phase 1 table to veto before it is committed.**

**G-15 · Anarchist federation.** Rules come from capability flags: no capital function (`hasCapital: false`), no formal alliances, capped organized army. Capital Battle never triggers; every region defends itself with its own resistance meter. Game over for an anarchist player = no region left under control. The spec lists no special ability for it; my proposal is **Mutual Aid** (regions share supplies).

**G-16 · Collapse is not game over.** If your country collapses into factions you continue as the faction holding the most population (or the capital); game over only if you hold nothing. *Required by the reunification campaign (§9).*

**G-17 · Cohesion has inertia.** Internal stability (three power-center satisfactions plus regional unrest) moves quickly. State Cohesion, the five-stage meter, drifts toward it slowly (at most about 3 points a turn). One bad month cannot collapse a state; years of bad months can.

**G-18 · Leaders are archetypes, not real people.** Each AI leader is a personality (aggressive, cautious, opportunistic…) with a generated name and title. No real individuals appear.

**G-19 · Tiered AI keeps the same rules.** Tier 1 (about 20 major powers) plans every turn; Tier 2 every 2–3 turns (staggered); Tier 3 reacts to events and plans rarely. Same commands, same constraints, no free resources. A lower-tier country is promoted for as long as it is at war with, or next to, the player.

**G-20 · Delegation reuses the AI.** Delegating the economy or a front means running the AI decision code for your country in that domain, with priorities you set.

**G-21 · Difficulty changes numbers, never rules.** Easy/Hard adjust multipliers (AI income, production, intelligence quality) in `balance.json`. Normal has none.

**G-22 · Real-World data is approximate, neutral and traceable.** Numbers are rounded and game-balanced, with `source` and `asOf`. Borders follow Natural Earth's default (de facto) boundaries. Disputed areas are separate regions flagged `contested`, with neutral names; the game takes no position in labels or text.

**G-23 · Phase 1 theater: the Middle East, 16 countries.** Turkey, Syria, Lebanon, Israel, Palestinian territories, Jordan, Iraq, Iran, Saudi Arabia, Kuwait, Bahrain, Qatar, UAE, Oman, Yemen, Egypt — about 90–120 regions. Neighbors outside the theater are drawn in grey as non-interactive context. Chokepoints: Hormuz, Suez, Bab-el-Mandeb.

**G-24 · Phase 1 goal.** A simple scored sandbox: a **Regional Power score** (share of regional GDP, controlled population, oil income, stability) ranks the 16 countries; horizon 10 years (120 turns). You lose by surrender or elimination. Real victory conditions arrive in Phase 6.

**G-25 · Units and scales.** Money in USD millions (flows per month); GDP in USD billions per year; population in thousands; shares and rates as fractions (0–1; debt can exceed 1); meters (approval, morale, stability, cohesion, trust, tension) 0–100.

**G-26 · Ids are permanent.** Countries use Natural Earth `ADM0_A3` codes; regions `ISO3-slug`; everything else `snake_case`. Renames break saves, so use `aliasOf` instead.

**G-27 · Start date.** Real World scenarios start in January 2026 (editable per scenario), with data rounded from the latest full-year statistics.

**G-28 · The international organization** has the fictional neutral name "International Council"; no real-world body is imitated.

**G-29 · The world outside the theater (Phase 1).** Three abstract off-map **patrons** (great powers) can give aid, sell arms and impose sanctions, plus one **world market** for prices. They follow simple scripted rules, not the full AI. They are replaced by real countries in Phase 5.

**G-30 · English only; all UI text in one file.** *(Added by you at approval.)* The game is English only. Every sentence, label, button, message, tooltip, error, news line and event text shown to the player lives in a single file, `data/i18n/en.json`, and is read with `t('key', params)`; nothing visible is hard-coded in code. Keys are flat and dotted (`title.newGame`), placeholders are `{name}`, plurals use `.one` / `.other` keys. The short display *name* (and one-line blurb) of a content item — a country, resource, government, technology — stays inline in that item's own data file, so adding content is still one entry in one file. *Text is easy to edit later, in one place.*

**G-32 · Phase 1 starts with the map.** *(Your instruction at the Phase 0b approval.)* M1.1 is reordered: first an interactive map of the 16-country theater (drag to pan, pinch to zoom, tap a country for its info panel), published as a preview, and only then the economy skeleton, report panel and country picker. Everything the map needs (geometry, countries, regions) is data in `data/`, so the later systems build on the same files. The first preview also carries the government classification table for your veto (G-14).

**G-33 · What a tap on the map selects (M1.1a).** The spec says "tap a country to see its info panel" but not what a tap on a region inside a country does. Simplest version that keeps the intent: a tap selects the **region** under the finger and the panel shows the **country** first (government, capital, population, economy) and the tapped region under it (terrain, cities); chips in the panel switch to the country's other regions. The camera glides to frame a newly chosen country in the part of the screen the panel leaves free, but stays put when only the region changes. Tapping the sea, or the close button, clears the selection. A tap can land up to about 10 pixels beside a tiny region and still select it, so Bahrain or Gaza can be hit with a thumb. Country colors only tell neighbours apart (they are not ownership yet); the player's country and ownership tints arrive with the country picker (M1.1b).

**G-34 · The whole world is drawn now, in grey, and is not playable.** *(Your instruction after you tried the first map.)* The map shows every country of the world around the Middle East; the 16 playable countries keep their colors. The others are **not playable until Phase 5** and are **not in the simulation**: they are a picture and a name only (`data/map/world.topo.json`), never in `countries.json`, `regions.json` or a save. Simplest version that keeps the intent: Antarctica and the far polar cap are left out (latitudes −58° to 80°); borders and names are Natural Earth's de facto defaults, as for the playable countries (R9); a tap on a grey country shows its name and "Not playable yet", outlined, and glides the camera to it like a playable one; the map still opens on the Middle East, a globe button shows the whole world and the target button returns. **Your safety valve:** if drawing the world hurts speed on your phone, Settings → Map → *Middle East only* brings back the old map (applied the next time the map opens), and the world file is then not even read. I measure the cost in the sandbox and report it; only you can tell how it feels on the phone.

**G-35 · The economy skeleton (M1.1b).** The spec lists the economy ("GDP, budget, taxes, spending categories, debt, inflation, trade income", §4.1) without numbers. Simplest version that keeps the intent: each country has **GDP**, a **tax rate** (state income as a share of GDP), a **treasury**, a **debt** and four **budget shares** of GDP (military, research, welfare, infrastructure). Every month: income = GDP ÷ 12 × tax rate; spending = Σ shares × GDP ÷ 12; interest = debt × yearly rate ÷ 12 (4% base, plus 2 points for every 100% of GDP of debt above 60%, at most 12%). What is left goes into the treasury (a shortfall comes out of it), so **the treasury moves every month by exactly what the month earned or lost**. It never goes below zero: a shortfall it cannot cover is **borrowed at once**. Debt is **never repaid by itself**: the Budget has two buttons, *Repay 10%* and *Repay all you can*, which pay it back out of the treasury (that cuts the interest and the cash with it). *(First draft: a surplus repaid debt first. A player found the treasury frozen for a country with a surplus and a debt, so the surplus now goes where a player expects it.)* GDP then grows by a twelfth of its yearly growth rate. Growth starts from the country's own trend (data) and moves with how far today's policies are from its starting ones: +1 point of GDP on infrastructure is +0.8 points of growth, +1 on research +1.0, +1 on taxes −0.4, and debt −0.01 per 100% of GDP above the start; the government's growth modifier from `governments.json` applies on top, and growth stays within −15% … +15%. The levers are **standing orders** with a range around the start (taxes ±10 points; each budget share from nothing up to its start + 5, 2, 8 or 4 points) and a step (half a point, or a quarter for research and infrastructure). **Not in yet:** inflation, trade, printing money and voluntary borrowing (M1.4, the five endurance levers), the effect of welfare and taxes on approval (M1.4) and of military spending on forces (M1.3). AI countries keep their starting budgets until the AI learns to adjust them (M1.5); on Easy and Hard the AI's income is ×0.9 and ×1.15 (G-21). Every number is in `balance.json` → `economy` and is tuned with the simulator in M1.5. *Every country has a working economy with a handful of levers you can understand, and every number can say why (pillar 2).* **Resource income arrived in M1.2:** the tax rate is now the taxes alone (G-39).

**G-36 · Choosing a country, and what the game screen shows (M1.1b).** The spec says the player picks a country but not how. Simplest version that keeps the intent: **New game** opens the map with a strip of the 16 playable countries along the top (major powers first, then by size of the economy). Tapping a country on the map or in the strip opens its panel (numbers, role, state income, treasury, debt) with a **Play as …** button; a grey country only says "Not playable yet". The game screen is the same map with your country outlined in teal, a status strip (country, date, treasury and last month's change) and an action bar: **Menu, Budget, Report, End turn**. **End turn** runs the month and opens the **monthly report** for the month that just ended: the treasury and its change, alerts (treasury running out, borrowing, high debt), income, spending, interest, balance, growth, GDP and debt, and the turn's news. Every money line opens a **Why?** list of the parts it is made of. The **Budget** shows next month's forecast (worked out by the real formulas) above the levers; each tap on − or + is one command. A panel that opens moves the map so what you were looking at stays in the part it leaves free. The game is autosaved when it starts and after every turn. Saves of the Phase 0b test game have no country: Continue leaves them out, and opening one from Saves says why it cannot be continued. *Everything is one tap from the map, and nothing needs a keyboard.*

**G-37 · Resources in the simulation (M1.2).** The spec lists the resources and their mechanics but no numbers. Simplest version that keeps the intent: each country has, for each of oil, food, steel and rare minerals (water stays a disabled module, G-12), a **production** and a **consumption** a month in game units (`resources.json` says what a unit is: 10 million barrels of oil, 100 kt of grain-equivalent or steel, 1 kt of rare minerals), a **stock**, and the share of its sea trade that passes each chokepoint. Each month a surplus is **sold abroad** and a deficit **bought abroad**; trade is open unless a strait is blockaded. A blockade stops the share of a country's trade that passes it: a surplus that cannot leave piles up at home (as far as the stores hold; waste beyond), a deficit that cannot be bought comes out of the stock, and what the stock cannot give is a **shortage**. *Coverage* is what is made, bought and drawn, over what is used. The deepest step of the resource's ladder that coverage has fallen under applies its effects through the shared stat vocabulary (today the economy reads economic growth; units, approval and unrest will read theirs when M1.3 and M1.4 give them something to act on, with no change here). Production and consumption are constant at their starting figures for now; the regions a country holds will change them when wars arrive. **Not in yet:** import bills paid by the state (importers feel prices through growth instead, G-38), consumption that grows with GDP, oil fields and ports as targets, scorched earth. *Resources are a real constraint with visible, data-driven consequences; nothing in the code names a resource or a country.*

**G-38 · The world market.** One world price per resource. Each month the market works out where the price is heading, base price × (world demand ÷ world supply)^elasticity × (1 + tension sensitivity × world tension) × the market's mood (Appendix B), and the price moves a share of the way there (its inertia). World supply and demand are the 16 countries' production and use, less what the blockades keep out of the market, plus an abstract **rest of the world** (`restOfWorld` in `resources.json`), so that the market starts in balance (the validator checks it). The mood is a number around 1 that fades by 15% a month and is pushed by a seeded random step of the resource's volatility, so prices wander (oil about ±15% over a decade) and a closed Hormuz pushes the oil price up by about 30% within three months (draft numbers: oil's elasticity is 3). A month is valued at the price the market had when it began, so the Budget's forecast is exactly what the turn then does. World prices also reach the economies: a price above its starting level raises the growth of a country that sells the resource and lowers that of one that buys it, by a quarter of the change in its yearly trade bill as a share of GDP. Prices are written in the unit people know (dollars a barrel, dollars a tonne). World tension starts at 25 and nothing moves it yet (wars will). *A world market that straits and wars can move, and that explains itself (pillar 2).*

**G-39 · Money from resources, and what "tax rate" means now (R20).** The state's income is **taxes** (GDP × tax rate, as before) **plus resource income**: its share (`stateShare`, per country and resource, defaulting from `resources.json`) of what the country sells abroad, at the market price. A country that buys more than it sells earns nothing from that resource and pays no import bill out of the treasury: the nation pays, and the state pays only for the reserves it buys itself (G-40). Every country's `taxRate` was cut by what its resource income is worth at the starting prices, so **the starting balances you approved are unchanged** (Kuwait: 11.5% taxes plus 33% oil; Iraq: 3% plus 30%; Türkiye: no change). Raising taxes in a Gulf state is now an ordinary lever, and oil money moves with the oil price. The difficulty setting's income multiplier for AI countries applies to both. *The number the player pulls on is what it says it is.*

**G-40 · Reserves are bought and sold by command.** Strategic reserves ("stockpiling before a war rewards planning") are two commands, `BUY_RESOURCE` and `SELL_RESOURCE`: a one-off trade at the market price with a 5% spread against the trader, paid from or into the treasury at once, like repaying debt. Limits: what the stores hold (6 to 24 months of what a country makes or uses, depending on the resource), the money in the treasury, and a way to market (a country whose every route is blockaded cannot trade). The Resources panel offers *Buy 1 month* and *Sell 1 month*, a month being what the country uses. A reserve never refills by itself: after a crisis the state must buy it back. Warnings appear for a reserve under half of what a prudent state keeps (`reserveTargetMonths`: six months of oil, for example) and for a shortage the coming month brings. *Simple, visible, and the AI will use the same commands (M1.5).*

**G-41 · Chokepoints, and what a region is worth.** The three straits are data (`chokepoints.json`): where they are, which regions control them, what share of the world's trade passes. A country's exposure is the share of its sea trade through each. A strait has a **blockade** from 0 (open) to 1 (closed) in the world state; nothing sets it yet (wars will, through control of its regions, in M1.3), so in M1.2 the Resources panel's **"What if it closed?"** plays the next 12 months on a copy of the game and says what would happen to prices, to your income and to your reserves; the tests close one directly. The straits are markers on the map; a tap opens the panel at that strait. Tapping a **region of another country** shows what holding it would be worth to you, from the real formulas on adjusted figures: its tax base (half of it counts for now, provisional until M1.3 defines occupation), the resources it makes and the people it must feed, and what that does to your income and to how long your reserves last. *The two what-if questions of the design (§5, UI requirement), answered from the same formulas as the game.*

**G-31 · The Five-Year Plan is a data-driven promise (§8).** The spec says "set a major goal; success gives a large bonus, failure shakes stability" without saying what a goal is. Simplest version that keeps the intent: a plan has a length in months, a goal that is a threshold on one stat (for example industrial output at least 1.3 times its start), and two effect lists applied when it ends, one for success and one for failure. The communist government ships with one plan (60 months); letting the player choose among several goals is a Phase 2 question. Format: DATA_SCHEMAS §7, `ability.plan`.

---

## Appendix B — Draft formulas (v0, tuned in Phase 1)

Every number comes from `data/balance.json`. Each formula is a pure function with unit tests and returns its *factors*, so the UI can answer "why?".

### Combat strength (§3.1)

```text
strength = units × techMod × supplyMod × moraleMod
  techMod   = 1 + techPerLevel × militaryTechLevel     (about +6% per level)
  supplyMod = clamp(supplyCoverage, supplyFloor, 1)    (logistics, ammo, and fuel for mechanized/air)
  moraleMod = 0.6 + 0.6 × morale / 100                 (0.6 … 1.2)

Situational, applied outside that formula:
  defender: × terrain × (1 + 0.08 × fortification)     (plains 1.0 … mountain 1.4, urban 1.5)
  stance:   Attack = +15% attack, −10% defense
            Defend = +25% defense
            Hold   = ×1 and low intensity

Per sector, per turn:
  ratio     = attackerStrength / defenderStrength      (± a bounded seeded "luck", shown in the report)
  losses    both sides lose units ∝ intensity; the weaker side loses more as ratio moves away from 1
  progress += max(0, ratio − 1) × advanceRate          (Attack stance only)
  the region flips when progress ≥ holdValue
```

### War endurance (§4.2)

```text
monthlyWarCost = upkeep + replacement(losses) + intensity × (ammo + fuel)
netBurn        = monthlyWarCost + peacetimeSpending − income
moneyMonths    = (reserves + usableCredit) / netBurn                    (infinite if netBurn ≤ 0)
resourceMonths = min over {oil, steel, food} of stock / monthlyDeficit  (blockades, embargoes, sanctions cut imports)
willMonths     = (warSupport − supportFloor) / supportDrainPerMonth     (democracies drain faster)
endurance      = min(moneyMonths, resourceMonths, willMonths × (1 + homeSoilBonus if fighting on own soil))

Warnings: ≤ 6 months = strain warning · ≤ 3 = crisis warning · 0 = the stage begins.
```

### The price of each extension lever (§4.3)

```text
Borrow       → +usableCredit now; debt service rises every month; growth falls later
Print money  → +reserves at once; inflation += k × printed / GDP; people's approval falls with inflation
Raise taxes  → +income; business and people approval fall; evasion grows over time
War economy  → warCost × ~0.8; civilian output and consumer goods fall; months to reverse
Allied aid   → +reserves/resources; dependency rises; the ally's demands increase
```

### Stability, power centers and cohesion (§8.2, §9)

```text
satisfaction[c], c in {army, business, people}, moves 0–100 toward a target each turn:
  people   ← welfare, growth/jobs, food; − inflation, − tax pressure, − war weariness (× government multiplier)
  business ← growth, trade access;       − tax pressure, − war-economy disruption, − sanctions
  army     ← pay on time, victories, equipment; − losses, − neglect
stability = Σ over c of weight(government, c) × satisfaction[c] − unrest penalty
failure   = if satisfaction[key center] < government.failure.below → rising chance of its failure
            (election loss / coup / revolution)
cohesion  drifts toward stability by at most maxDrift (about 3) per turn
stage     = Stable ≥ 70 · Troubled ≥ 50 · Crisis ≥ 30 · Failed ≥ 10 · Collapsed < 10
```

### World market (§5)

```text
target price = basePrice × (demand / supply)^elasticity × (1 + tensionSensitivity × worldTension) × shocks
price        = inertia × lastPrice + (1 − inertia) × target
```

*As built in M1.2 (G-38; `formulas/market.js`):* demand and supply are the world's (the 16 countries and the rest of the world, less what blockades keep out); `(demand / supply)^elasticity` is kept between `priceFloor` and `priceCeiling` (×0.4 … ×4); `inertia`, `elasticity`, `tensionSensitivity` and `volatility` are per resource in `resources.json`; `shocks` is the market's mood, `1 + 0.85 × (mood − 1) + volatility × noise` each month, where `noise` is a seeded random number with mean 0 and standard deviation 1. A month's flows are valued at the price the month began with.

```text
countryMonth:  surplus = max(0, production − consumption), deficit = max(0, consumption − production)
               exports = surplus × (1 − blocked), imports = deficit × (1 − blocked)
               blocked = 1 − Π (1 − blockade × share of this country's trade through each strait)
               a blocked surplus is stored up to the stores, wasted beyond; a blocked deficit is drawn from the stock
               coverage = (min(production, consumption) + imports + drawn) / consumption   → the shortage ladder
state income from resources = stateShare × exports × price
growth term from prices    = 0.25 × Σ (exports − imports) × (price − start price) × 12 / GDP
```

### Chaos events (§3.2)

```text
chance = clamp(baseChance + Σ weight × normalizedDriver, 0, cap)
Every roll keeps its list of drivers, so the report can say why it happened.
```

---

## Appendix C — Phase plan and acceptance

**Every phase is done when:** it is playable on a phone; it is deployed (preview URL); `npm test` is green; the status in `CLAUDE.md` is current; known issues are listed; and you have played it and approved.

### Phase 0
- **0a (now):** these documents approved.
- **0b:** installable offline PWA on GitHub Pages (plus branch previews); CI gate; save/load round-trip with export/import; Diagnostics screen; test harness and data validation running.
  *Check on your phone:* install → airplane mode → it opens → make a test save → reload → it is still there.

### Phase 1 — Regional MVP (Middle East): "is it fun?"

Five playable milestones, each deployed to a preview URL:
- **M1.1 Map and clock** — map (pan/zoom/tap), country picker, monthly turns, economy skeleton, report panel, autosave.
- **M1.2 Resources and market** — oil, food, steel, rare minerals; production, consumption, stockpiles, trade; world price; chokepoints; visible shortage effects; "capture estimate" on tap.
- **M1.3 Normal war** — declare war, ceasefire/peace, fronts, stances, war budget, auto-resolved battles, occupation, concise reports, off-map patrons.
- **M1.4 Endurance and collapse** — endurance meter with its limiting factor, the five extension levers, strain → crisis → collapse with warnings, unpaid-salary desertion.
- **M1.5 AI and goal** — personalities, tier-1/2 AI, peace-seeking at low endurance, Regional Power score and endings, a balancing pass with the simulator.

**Not in Phase 1:** capital battles, chaos events other than desertion, government abilities and power-center failures, diplomacy meters, technology, factions, scenarios, sound.

**Playtest questions I will ask after Phase 1**
1. Does a turn feel quick, and do you want to press End Turn again?
2. Can you tell *why* a war is going well or badly?
3. Did the endurance meter warn you early enough, and scare you at the right time?
4. Were the taps comfortable? Anything too small, too dense, too slow?
5. Which system felt shallow, and which felt too fiddly?

### Phases 2–7

Each gets a short plan for your approval before work starts.
- **P2:** capital battles (deep, auto-resolve, cooldown, exile), the eight chaos events, six governments with abilities and power centers, internal stability.
- **P3:** relations/trust/fear, all diplomatic tools, coalitions, ultimatums, International Council, World Tension, secret agreements.
- **P4:** four technology branches, five acquisition paths, counters, nuclear deterrence, diffusion, satellites and fog.
- **P5:** all ~195 countries and ~1,200 regions, tiered AI at scale, performance pass, state condition and factions, proxy wars.
- **P6:** scenarios, Randomized World, national missions, victory conditions, achievements, history log, delegation.
- **P7:** visual polish, sound, balance, tutorial, optional native packaging.
