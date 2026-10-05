# Game Design Document

**Modern-era offline grand strategy for phones** · working title *Grand Strategy (TBD)*

> **Status:** Phase 0 draft, awaiting your approval.
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
- JavaScript ES modules. **Phaser** draws the map and the battle; HTML/CSS draws menus and panels. (Phaser version: open question Q1.)
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
