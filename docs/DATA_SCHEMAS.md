# Data Schemas (proposal)

> Phase 0 proposal, awaiting your approval. All game content is JSON under `/data`; code never hard-codes a country, resource, government, event or balance number.
> Additive changes are cheap, **renames are not** (ids are permanent, G-26), so please look closely at ids and field names.
> Every example uses **illustrative values** — they show the shape, not final data.
> Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [../GAME_DESIGN.md](../GAME_DESIGN.md) · [RISKS_AND_QUESTIONS.md](RISKS_AND_QUESTIONS.md)

## 1. Conventions

- **Files** are UTF-8 JSON. List files look like `{ "schema": "countries", "version": 1, "items": [ … ] }`. The one singleton file (`balance.json`) uses `"values": { … }` instead of `items`.
- **Strict.** Unknown fields are errors in CI (this catches typos such as `gdpBN` for `gdpBn`). A string field named `_note` is always allowed for human comments.
- **Ids are permanent** (G-26). Countries use the Natural Earth `ADM0_A3` code (ISO alpha-3 where one exists, e.g. `IRQ`). Regions are `<COUNTRY>-<slug>` (e.g. `IRQ-basra`). Everything else is `snake_case` (`oil`, `democracy`). Never rename; deprecate with `"aliasOf": "<new id>"`.
- **Units** (G-25): money in **USD millions** (flows are per month); GDP in **USD billions per year** (`gdpBn`); population in **thousands**; resources in the unit named in `resources.json`; shares and rates are **fractions** (0–1; debt ratios can exceed 1); meters (approval, morale, stability, cohesion, trust, tension) are **0–100**; dates are `"YYYY-MM"`.
- **Static versus dynamic.** Data files hold *definitions and starting values*. The running game keeps *changing* values in `state`, which is what gets saved. Saves store ids and dynamic values only, never copies of data.
- **Text (G-30).** English only. All UI text — labels, buttons, messages, tooltips, errors, news and event text — lives in **one file, `data/i18n/en.json`**, and data files refer to it by key (for example `"reportKey": "events.desertion.report"`). The short display `name` and one-line `blurb` of a content item stay inline in that item's file, so adding a country, resource or government is still one entry in one file.
- **Provenance.** Real-world numbers carry `source` and `asOf`. They are rounded, game-balanced approximations, not authoritative statistics (G-22).
- **Generated fields** are marked *(generated)*. Tools write them; hand edits are overwritten.
- **Validation** in CI: JSON Schema (`data/schema/*.schema.json`, checked with Ajv) plus the referential rules in §9. A broken data file fails CI, so a broken game is never deployed.

## 2. File map

```text
data/
  i18n/en.json       all UI text (G-30)                         P0b ✔ exists
  balance.json       global constants and difficulty            P0b ✔ minimal, P1 grows it
  resources.json     oil, food, steel, rare minerals, water     P0b ✔ (water disabled until later)
  governments.json   the six government types                   P0b ✔ data, P2 logic
  traits.json        national traits and starting challenges    P1 few, P6 full
  personalities.json AI leader archetypes                       P1
  chokepoints.json   Hormuz, Suez, Bab-el-Mandeb              P1
  countries.json     one entry per country                      P1: 16, P5: ~195
  regions.json       one entry per region                       P1: ~100, P5: ~1,200
  scenarios.json     start date, roster, goal                   P0b ✔ one scaffold scenario, M1.1b ✔ me_2026
  events.json        chaos events and world events              P2+
  technologies.json  the tech tree                              P4
  diplomacy.json     initial treaties and pair meters           P3
  map/<theater>.topo.json   (generated) geometry, never hand-edited
  map/world.topo.json       (generated) the rest of the world in grey, picture and name only
  schema/*.schema.json      JSON Schemas
```

## 3. Shared building blocks

### 3.1 Stats

A **stat** is a named number the game can read and modify, written `scope.group.name`. Scopes: `country`, `region`, `front`, `world`. The list of valid stats lives in code (`src/core/stats.js`: name, min, max, default, label). Data that names an unknown stat fails validation. *Adding a stat is a code change; using one is data.*

Examples: `country.approval.people`, `country.military.morale`, `country.economy.growth`, `country.mechanized.mobility`, `country.air.sorties`, `region.unrest`, `region.resistance`, `front.units`, `world.tension`.

### 3.2 Effects

```jsonc
[
  { "stat": "country.approval.people", "op": "add", "value": -3 },
  { "stat": "country.mechanized.mobility", "op": "mul", "value": 0.5 },
  { "stat": "country.economy.growth", "op": "mul", "value": 1.1, "months": 12 },
  { "do": "setFlag", "flag": "oil_embargo_active" }
]
```

- `op` is `add` or `mul`. A stat's value is `(base + Σ add) × Π mul`.
- `months` (optional) makes the effect temporary. Without it, the effect lasts while its *source* applies (a government, technology, trait, shortage step, or event).
- `scope` (optional): `self` (default), `enemy`, `allies`, `region:<id>`, `world`.
- `do` is for the few custom actions implemented in code (`setFlag`, `addNews`, `startEvent`, `changeGovernment`, …). Everything else is a stat effect.

### 3.3 Conditions

```jsonc
[
  { "all": [ { "stat": "country.cohesion", "lt": 30 }, { "flag": "at_war" } ] },
  { "any": [ { "gov": "junta" }, { "trait": "landlocked" } ] },
  { "not": { "hasTech": "drones" } },
  { "chance": 0.15 }
]
```

Comparison keys: `lt`, `lte`, `gt`, `gte`, `eq`. `chance` uses the seeded RNG. Conditions are pure: they only read state.

## 4. countries.json

One entry per country. Phase 1 has 16.

**Status (M1.1b):** the file carries identity, `capital`, `government`, `aiTier`, `population`, `sources`, and the **economy skeleton**: `start.economy` (`gdpBn`, `growth`, `taxRate`, `debtPctGdp`, `treasuryMn` are required; `inflation` is accepted but not used yet) and `start.budget` (the four shares, required). The `traits`, `start.military`, `start.resources`, `start.internal`, `start.tech`, `chokepoints` and `leader` blocks arrive with later milestones, and each is validated as a whole when it appears. Until M1.2, `taxRate` stands for **all** state income, including what the state earns from resources, which is why the Gulf states show high ones (G-35). The validator checks that a starting budget roughly balances (between −8% and +10% of GDP, with interest at the base rate), so a slipped decimal point cannot start a country bankrupt.

**Fields**
- `id` — Natural Earth `ADM0_A3`. `name`, `adjective` (used in news: "Kuwaiti forces…").
- `theater` — which map pack the country belongs to.
- `capital` — `{ name, region }`. Always present, even for governments without a capital function (a country can change government).
- `government` — id in `governments.json` (simplified, neutral, editable: G-14).
- `aiTier` — `1`, `2` or `3` (G-19); may be promoted at runtime.
- `traits` — ids in `traits.json`.
- `population` — thousands.
- `color` — optional `#rrggbb`; otherwise assigned by the map-coloring pass.
- `start.economy` — `gdpBn`, `growth` (annual real growth: the country's own trend, which already includes its starting policies), `taxRate` (state income as a share of GDP), `debtPctGdp` (of GDP), `treasuryMn` (cash and liquid reserves the state can use), `inflation` (annual; not used until M1.4).
- `start.budget` — spending by category as a **share of GDP**: `military`, `research`, `welfare`, `infrastructure`.
- `start.military` — `forces` (abstract strength points by class: `land`, `armor`, `air`; G-02), `techLevel` (0–10), `morale`, `training`, `comms` (0–100 each).
- `start.resources` — four maps, each keyed by resource id: `production` and `consumption` (units per month), `stockpile` (units), and `stateShare` (share of that resource's income that goes to the state; missing entries default from `resources.json`).
- `start.internal` — `approval` for `army`, `business`, `people`; `cohesion`; `warSupport`.
- `start.tech` — levels 0–10 for `military`, `economy`, `cyber`, `energy` (used from Phase 4).
- `chokepoints` — share (0–1) of this country's seaborne trade that passes each chokepoint. A blockade hurts in proportion.
- `leader` — `{ "personality": "random" }` or a `personalities.json` id (G-18).
- `sources` — provenance strings per block.
- Reserved for Phase 2: `capital.districts` (airport, port, TV station, industrial zone, palace) with a default template in `balance.json`.

**Example (illustrative)**

```jsonc
{
  "id": "KWT",
  "name": "Kuwait",
  "adjective": "Kuwaiti",
  "theater": "middle_east",
  "capital": { "name": "Kuwait City", "region": "KWT-kuwait_city" },
  "government": "monarchy",
  "aiTier": 3,
  "traits": ["oil_rich", "small_state"],
  "population": 4900,
  "start": {
    "economy": { "gdpBn": 160, "growth": 0.025, "taxRate": 0.05, "debtPctGdp": 0.10, "inflation": 0.03, "treasuryMn": 60000 },
    "budget": { "military": 0.05, "research": 0.005, "welfare": 0.15, "infrastructure": 0.04 },
    "military": { "forces": { "land": 3, "armor": 2, "air": 1 }, "techLevel": 4, "morale": 60, "training": 55, "comms": 60 },
    "resources": {
      "production":  { "oil": 7.9, "food": 0.1, "steel": 0, "rare": 0 },
      "consumption": { "oil": 1.4, "food": 2.0, "steel": 0.8, "rare": 0 },
      "stockpile":   { "oil": 20, "food": 6.0, "steel": 1.5, "rare": 0 },
      "stateShare":  { "oil": 0.9 }
    },
    "internal": { "approval": { "army": 65, "business": 60, "people": 62 }, "cohesion": 78, "warSupport": 50 },
    "tech": { "military": 3, "economy": 4, "cyber": 2, "energy": 1 }
  },
  "chokepoints": { "hormuz": 0.95 },
  "leader": { "personality": "random" },
  "sources": { "economy": "World Bank 2024, rounded", "resources": "EIA and OPEC 2024, converted to game units" },
  "_note": "Illustrative values that show the shape, not final data."
}
```

## 5. regions.json

One entry per region. Regions are groups of Natural Earth admin-1 units chosen by the map tool's grouping file; a handful of regions per small country, tens for large ones.

**Status (M1.1a):** 96 regions with `id`, `name`, `country`, `theater`, `neighbors` and `lonlat` *(generated by `npm run build:map`; a test fails if they are out of date)*, `terrain`, `size`, `infrastructure` and `cities`. The economy fields (`popShare`, `gdpShare`, `output`, `sites`) arrive with M1.1b/M1.2; the validator then requires them for every region of a country at once and checks that the shares sum to 1.

**Fields**
- `id` — `<COUNTRY>-<slug>`. `name`. `country`. `theater`.
- `neighbors` *(generated)* — land-adjacent region ids (must be symmetric). `seaLinks` — optional short sea or causeway adjacency (island regions such as Bahrain).
- `terrain` — `plains`, `desert`, `forest`, `marsh`, `mountain` or `urban`. Drives the defender bonus.
- `size` *(generated, editable)* — 1–5; scales the **hold value** (how much progress an attacker needs, G-03).
- `infrastructure` — 1–5; supply and movement.
- `coastal` *(generated)* — touches the sea.
- `popShare`, `gdpShare` — this region's share of its country's population and GDP. **Each must sum to 1 per country.** Capitals typically carry a large `gdpShare`, which is why losing one is a shock (design §3.6).
- `output` — this region's share of the country's production, per resource. **Sums to 1 per country for each resource it produces.**
- `cities` — `{ name, tier }` where `tier` is `capital`, `major` or `minor`. Tiers `capital` and `major` count for the "last major city" rule (G-09).
- `sites` — named strategic targets: `{ id, type, name, resource?, share? }`. `type` is `oil_field`, `refinery`, `mine`, `port`, `airport`, `dam`, `factory` or `power_plant`. `share` is the part of *this region's* output of `resource` carried by the site. Sabotage and capture act on sites (scorched earth; repair time per type lives in `balance.json`).
- `lonlat` *(generated)* — centroid.
- `contested` — `true` for disputed areas (G-22); `note` — neutral description.

**Example (illustrative)**

```jsonc
{
  "id": "IRQ-basra",
  "name": "Basra",
  "country": "IRQ",
  "theater": "middle_east",
  "neighbors": ["IRQ-dhi_qar", "IRQ-maysan", "KWT-ahmadi", "IRN-khuzestan"],
  "terrain": "marsh",
  "size": 3,
  "infrastructure": 3,
  "coastal": true,
  "popShare": 0.09,
  "gdpShare": 0.22,
  "output": { "oil": 0.55, "food": 0.06, "steel": 0, "rare": 0 },
  "cities": [ { "name": "Basra", "tier": "major" } ],
  "sites": [
    { "id": "rumaila", "type": "oil_field", "name": "Rumaila", "resource": "oil", "share": 0.5 },
    { "id": "umm_qasr", "type": "port", "name": "Umm Qasr" }
  ],
  "lonlat": [47.8, 30.5],
  "contested": false
}
```

## 6. resources.json

Defines each resource's role, unit, market behavior and shortage effects. Phase 1 has `oil`, `food`, `steel`, `rare`; `water` exists but is disabled (G-12).

**Fields**
- `id`, `name`, `icon`, `unit` (a label such as "10 million barrels"), `enabled`, `module` (`core` or `water`), `tradeable`.
- `basePrice` — USD millions per unit. `price` — `elasticity`, `tensionSensitivity`, `inertia`, `volatility` (Appendix B of the design).
- `defaultStateShare` — default share of this resource's income that accrues to the state.
- `reserveTargetMonths` — what a prudent country tries to stockpile.
- `shortage` — a ladder of steps. Each step has `coverageBelow` (available supply ÷ demand, 0–1), a `label` and `effects` (§3.2). **Only the deepest step reached applies.** This is how "shortage slows, then stops, mechanized units and grounds aircraft" is data.

**Example (illustrative)**

```jsonc
[
  {
    "id": "oil",
    "name": "Oil",
    "icon": "🛢️",
    "unit": "10 million barrels",
    "enabled": true,
    "module": "core",
    "tradeable": true,
    "basePrice": 800,
    "price": { "elasticity": 0.5, "tensionSensitivity": 0.004, "inertia": 0.7, "volatility": 0.03 },
    "defaultStateShare": 0.3,
    "reserveTargetMonths": 6,
    "shortage": [
      { "coverageBelow": 0.8, "label": "Fuel rationing",
        "effects": [ { "stat": "country.mechanized.mobility", "op": "mul", "value": 0.8 } ] },
      { "coverageBelow": 0.5, "label": "Mechanized units stall",
        "effects": [ { "stat": "country.mechanized.mobility", "op": "mul", "value": 0.4 },
                     { "stat": "country.air.sorties", "op": "mul", "value": 0.4 } ] },
      { "coverageBelow": 0.2, "label": "Aircraft grounded",
        "effects": [ { "stat": "country.mechanized.mobility", "op": "mul", "value": 0.1 },
                     { "stat": "country.air.sorties", "op": "mul", "value": 0 } ] }
    ]
  },
  { "id": "water", "name": "Water", "icon": "💧", "unit": "abstract", "enabled": false, "module": "water", "tradeable": false, "basePrice": 0 }
]
```

## 7. governments.json

Six types in v1: `democracy`, `authoritarian`, `monarchy`, `junta`, `communist`, `anarchist`. A new type is a data-only addition (G-14).

**Fields**
- `id`, `name`, `icon`, `blurb`.
- `powerCenters` — how much the regime depends on each center: `army`, `business`, `people` (**sum = 1**, design §8.2).
- `failure` — `{ center, below, outcome }`: when that center's satisfaction falls below `below`, the matching failure becomes likely. `outcome` is `election_loss`, `coup` or `revolution`.
- `rules` — capability flags the code reads (T-10):
  - `hasCapital`, `canSignFormalAlliances`, `needsWarSupport` (booleans)
  - `warWeariness` (multiplier), `conscription` (`volunteer`, `slow`, `normal`, `fast`)
  - `maxForceMultiplier` (`null` or a cap on organized forces)
  - `electionEveryMonths` (`null` if none), `successionRisk`, `hiddenDiscontent` (booleans)
  - `occupationBurden` (multiplier on what an occupier pays to hold your regions)
- `modifiers` — standing strengths and prices, as effects (§3.2).
- `ability` — `{ id, name, cooldownMonths, durationMonths, effects, plan? }`, or `null`. `plan` is optional and exists for abilities that are a promise rather than a boost (the communist Five-Year Plan): `{ months, goal: { stat, atLeast }, onSuccess, onFailure }`, where `goal` is checked when the plan ends and the matching effect list is applied.
- `transition` — `chaosMonths` (length of the chaotic period after a change) and `affinity` (how much this type leans toward each other type, −1 to 1).

**Examples (illustrative)** — the two extremes: a democracy and the anarchist federation (no capital function, no formal alliances).

```jsonc
[
  {
    "id": "democracy",
    "name": "Democracy",
    "icon": "🗳️",
    "blurb": "Strong economy and trust; war needs public support.",
    "powerCenters": { "army": 0.15, "business": 0.30, "people": 0.55 },
    "failure": { "center": "people", "below": 30, "outcome": "election_loss" },
    "rules": {
      "hasCapital": true, "canSignFormalAlliances": true, "needsWarSupport": true,
      "warWeariness": 1.5, "conscription": "slow", "maxForceMultiplier": null,
      "electionEveryMonths": 48, "successionRisk": false, "hiddenDiscontent": false,
      "occupationBurden": 1.0
    },
    "modifiers": [
      { "stat": "country.economy.growth", "op": "mul", "value": 1.1 },
      { "stat": "country.research.speed", "op": "mul", "value": 1.1 },
      { "stat": "country.diplomacy.trustBase", "op": "add", "value": 10 }
    ],
    "ability": {
      "id": "mobilize_public_opinion", "name": "Mobilize Public Opinion",
      "cooldownMonths": 24, "durationMonths": 6,
      "effects": [ { "stat": "country.warSupport", "op": "add", "value": 20 } ]
    },
    "transition": {
      "chaosMonths": 6,
      "affinity": { "democracy": 1.0, "authoritarian": -0.3, "monarchy": 0.2, "junta": -0.4, "communist": -0.5, "anarchist": -0.2 }
    }
  },
  {
    "id": "anarchist",
    "name": "Anarchist federation",
    "icon": "🏘️",
    "blurb": "No capital to capture. Every region resists on its own.",
    "powerCenters": { "army": 0.10, "business": 0.10, "people": 0.80 },
    "failure": { "center": "people", "below": 20, "outcome": "revolution" },
    "rules": {
      "hasCapital": false, "canSignFormalAlliances": false, "needsWarSupport": false,
      "warWeariness": 0.8, "conscription": "volunteer", "maxForceMultiplier": 0.5,
      "electionEveryMonths": null, "successionRisk": false, "hiddenDiscontent": false,
      "occupationBurden": 3.0
    },
    "modifiers": [
      { "stat": "country.research.speed", "op": "mul", "value": 0.6 },
      { "stat": "country.industry.output", "op": "mul", "value": 0.7 },
      { "stat": "region.resistance", "op": "add", "value": 25 }
    ],
    "ability": null,
    "transition": {
      "chaosMonths": 8,
      "affinity": { "democracy": -0.2, "authoritarian": -0.8, "monarchy": -0.8, "junta": -0.9, "communist": -0.3, "anarchist": 1.0 }
    },
    "_note": "The spec lists no ability for this type; proposal: Mutual Aid (regions share supplies), see G-15."
  }
]
```

## 8. Other files (short)

**`i18n/en.json`** — every UI string (G-30). Keys are flat and dotted; `{name}` marks a placeholder; plurals use `.one` / `.other` keys read by `tn()`.

```jsonc
{
  "schema": "i18n",
  "version": 1,
  "lang": "en",
  "strings": {
    "title.newGame": "New game",
    "saves.count.one": "{n} save",
    "saves.count.other": "{n} saves"
  }
}
```

**`balance.json`** — every tunable number, grouped by system. Formulas receive their section as a params object (T-08).

```jsonc
{
  "schema": "balance",
  "version": 1,
  "values": {
    "time": { "weeksPerMonth": 4, "capitalRegroupMonths": 4 },
    "combat": {
      "techPerLevel": 0.06, "supplyFloor": 0.3, "moraleMin": 0.6, "moraleMax": 1.2,
      "variance": 0.1, "autoResolvePenalty": 0.1, "fortificationPerLevel": 0.08,
      "terrain": { "plains": 1.0, "desert": 1.05, "forest": 1.15, "marsh": 1.2, "mountain": 1.4, "urban": 1.5 },
      "stance": {
        "attack": { "attack": 1.15, "defense": 0.9 },
        "defend": { "attack": 1.0, "defense": 1.25 },
        "hold": { "attack": 1.0, "defense": 1.0 }
      }
    },
    "endurance": { "warnMonths": [6, 3], "homeSoilBonus": 0.25, "supportFloor": 20 },
    "stability": { "cohesionMaxDrift": 3, "stages": { "stable": 70, "troubled": 50, "crisis": 30, "failed": 10 } },
    "market": { "inertia": 0.7 },
    "difficulty": { "easy": { "aiIncome": 0.9, "intel": 1.2 }, "normal": {}, "hard": { "aiIncome": 1.15, "intel": 0.8 } }
  }
}
```

**`traits.json`** — national traits and starting challenges (conditions + effects, §3).

```jsonc
{
  "id": "landlocked",
  "name": "Landlocked",
  "kind": "national",
  "blurb": "No coast: sea blockades cannot reach you, but trade depends on your neighbors.",
  "conditions": null,
  "effects": [
    { "stat": "country.trade.blockadeExposure", "op": "mul", "value": 0 },
    { "stat": "country.trade.transitCost", "op": "mul", "value": 1.25 }
  ]
}
```

**`personalities.json`** — AI leader archetypes (G-18); `weights` feed the AI's utility scores.

```jsonc
{
  "id": "opportunist",
  "name": "Opportunist",
  "weights": { "warAppetite": 0.5, "riskTolerance": 0.6, "grudge": 0.4, "expansion": 0.6, "trade": 0.5, "loyalty": 0.3, "tech": 0.4 }
}
```

**`chokepoints.json`** — straits whose control can choke trade.

```jsonc
{
  "id": "hormuz",
  "name": "Strait of Hormuz",
  "position": [56.5, 26.6],
  "controlRegions": ["IRN-hormozgan", "OMN-musandam"],
  "worldTradeShare": { "oil": 0.2 }
}
```

**`balance.json` → `economy`** (G-35; every number the economy skeleton uses): `taxRange` (how far a tax rate may move from the start, 0.10), `taxMin`, `taxMax`, `taxStep`; `budgetStep` and `budgetRange` per category (the step of a lever and how far above its start it may go; a share may always go to nothing); `interest` (`base`, `riskStart`, `riskSlope`, `max`: the yearly rate is the base plus `riskSlope` for every 100% of GDP of debt above `riskStart`, at most `max`); `growth` (`taxDrag`, `infrastructure`, `research`, `debtDrag`: points of yearly growth per point of GDP, or per 100% of GDP of debt, away from the start; `min`, `max`: the bounds of growth); `warnings` (`debtRatio` for the debt alert and news, `runwayMonths` for the treasury alert).

**`scenarios.json`** — start conditions (design §11). Phase 1 has one (`me_2026`, plus `scaffold_test`, an empty world that unit tests use and the game never offers); `playable: null` means every country in the listed theaters. Off-map patrons are the abstract great powers of G-29.

```jsonc
{
  "id": "me_2026",
  "name": "Middle East 2026",
  "blurb": "Sixteen countries, one oil market, three chokepoints.",
  "startDate": "2026-01",
  "worldMode": "real",
  "theaters": ["middle_east"],
  "playable": null,
  "offMap": { "patrons": [ { "id": "patron_a", "name": "Great Power A" }, { "id": "patron_b", "name": "Great Power B" }, { "id": "patron_c", "name": "Great Power C" } ] },
  "goal": { "type": "regional_power", "years": 10 },
  "overrides": {}
}
```

**`events.json`** (Phase 2) — chaos events carry their **drivers**, so the report can show causes (pillar 2). `chance = baseChance + Σ weight × driver`, capped.

```jsonc
{
  "id": "desertion",
  "kind": "chaos",
  "name": "Desertion",
  "scope": "front",
  "baseChance": 0.02,
  "cap": 0.6,
  "drivers": [
    { "label": "Low morale", "stat": "country.military.morale", "invert": true, "weight": 0.004 },
    { "label": "Unpaid salaries", "stat": "country.military.salaryArrearsMonths", "weight": 0.12 }
  ],
  "effects": [ { "stat": "front.units", "op": "mul", "value": 0.97 } ],
  "reportKey": "events.desertion.report"
}
```

with the sentence itself in `i18n/en.json`: `"events.desertion.report": "{count} soldiers deserted on the {front} front."`

**`technologies.json`** (Phase 4, draft) — every powerful technology names its counters.

```jsonc
{
  "id": "drones_basic",
  "branch": "military",
  "tier": 1,
  "name": "Combat Drones",
  "months": 18,
  "cost": 1200,
  "requires": [],
  "needsResources": { "rare": 0.5 },
  "effects": [ { "stat": "country.military.techLevel", "op": "add", "value": 0.5 } ],
  "counteredBy": ["electronic_warfare"],
  "diffusion": { "halfLifeMonths": 60 }
}
```

**`diplomacy.json`** (Phase 3) — initial alliances, rivalries and pair-meter overrides; everything else is computed from geography, government affinity and trade.

**`map/<theater>.topo.json`** *(generated)* — TopoJSON with three objects: `regions` (one geometry per region id, properties `region` and `country`), `countries` (one geometry per country, built from the same arcs) and `context` (grey, non-interactive neighbors, clipped to the map box). Coordinates are quantized Mercator kilometres. A `gs` block carries `box` (`[x0, y0, x1, y1]` in km) and `labels` (`{ regions: { id: [x, y] }, countries: { id: [x, y] } }`, a point inside each shape where its name is drawn). Never edited by hand; regenerate with `npm run build:map` (`tools/build-map.mjs`, grouping in `tools/map/<theater>.groups.json`).

**`map/world.topo.json`** *(generated)* — the grey rest of the world (G-34): one object `countries` with a geometry per Natural Earth country that is not playable, properties `{ id, name }` (`id` is the `ADM0_A3` code, `name` Natural Earth's short name). The same Mercator kilometres as the theater file, clipped to latitudes −58° to 80°. `gs` carries `box`, `latitudes`, `naturalEarth` (the same commit as the theater file) and `labels.countries`. These countries are **not** in `countries.json` and never enter the simulation; the map screen is the only reader. Built by `tools/build-world.mjs`.

## 9. Validation rules (CI)

1. Every `id` is unique within its file; `aliasOf` targets exist.
2. `country.government`, `traits[]`, `leader.personality`, chokepoint keys, resource keys and technology references all resolve.
3. Every region's `country` exists; every country has at least one region; `capital.region` belongs to that country and is a region with a `capital`-tier city.
4. `neighbors` are symmetric, never self-referencing, and name existing regions (a neighbor in an *inactive* theater is only a warning). Each country's regions are connected through `neighbors` and `seaLinks`.
5. Per country: `Σ popShare = 1`, `Σ gdpShare = 1` (±0.001); for each resource with `production > 0`, `Σ output = 1`; with `production = 0`, all `output` are 0.
6. Ranges: meters 0–100; shares and rates 0–1 (debt ratios may exceed 1); `aiTier` is 1–3; `techLevel` 0–10.
7. Government `powerCenters` sum to 1; `failure.center` is `army`, `business` or `people`.
8. Every stat in an effect, condition or driver exists in the stat registry; every `do` action exists in the action registry.
9. Scenario rosters are subsets of `countries.json`; chokepoint `controlRegions` exist.
10. Geometry covers exactly the region ids of its theater (no missing and no extra polygons).

## 10. Adding content from your phone

1. Edit the JSON in the GitHub mobile web editor (or ask me).
2. Commit to a branch. CI validates the data (§9) and builds a **preview URL**.
3. If validation fails, CI tells you the file and the field; nothing broken is ever published to `main`.
4. Open the preview on your phone and try the change.
