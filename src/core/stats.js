// The registry of stats data may read or modify (DATA_SCHEMAS §3.1). A stat is a named number
// written scope.group.name. Adding a stat is a code change (here, plus a label in
// data/i18n/en.json as "stat.<id>"); using one in data is just writing its id. The validator
// rejects any effect, condition or driver that names a stat missing from this list.

/**
 * @typedef {{ id: string, kind: 'meter' | 'rate' | 'multiplier' | 'count', min: number, max: number, default: number, active?: boolean }} StatDef
 *   `active`: some system reads this stat today. A stat that is only named in data (a shortage's effect on
 *   approval, say) is registered but not active until the system that gives it meaning exists; the screens
 *   say so, so no effect is promised that nothing delivers.
 */

/** @type {StatDef[]} */
export const STATS = [
  // Economy and industry
  { id: 'country.economy.growth', kind: 'rate', min: -0.5, max: 0.5, default: 0.02, active: true },
  { id: 'country.economy.blackMarket', kind: 'meter', min: 0, max: 100, default: 0 },
  { id: 'country.industry.output', kind: 'multiplier', min: 0, max: 5, default: 1 },
  { id: 'country.research.speed', kind: 'multiplier', min: 0, max: 5, default: 1 },
  { id: 'country.research.brainDrain', kind: 'meter', min: 0, max: 100, default: 0 },
  { id: 'country.trade.marketAccess', kind: 'multiplier', min: 0, max: 2, default: 1 },
  { id: 'country.trade.blockadeExposure', kind: 'multiplier', min: 0, max: 2, default: 1 },
  { id: 'country.trade.transitCost', kind: 'multiplier', min: 0.5, max: 3, default: 1 },
  { id: 'country.warEconomy.switchTime', kind: 'multiplier', min: 0, max: 5, default: 1 },
  // Politics and stability
  { id: 'country.approval.army', kind: 'meter', min: 0, max: 100, default: 50 },
  { id: 'country.approval.business', kind: 'meter', min: 0, max: 100, default: 50 },
  { id: 'country.approval.people', kind: 'meter', min: 0, max: 100, default: 50 },
  { id: 'country.stability', kind: 'meter', min: 0, max: 100, default: 60 },
  { id: 'country.cohesion', kind: 'meter', min: 0, max: 100, default: 70 },
  { id: 'country.unrest', kind: 'meter', min: 0, max: 100, default: 0 },
  { id: 'country.corruption', kind: 'meter', min: 0, max: 100, default: 30 },
  { id: 'country.warSupport', kind: 'meter', min: 0, max: 100, default: 50 },
  { id: 'country.policy.delay', kind: 'multiplier', min: 0, max: 5, default: 1 },
  { id: 'country.diplomacy.trustBase', kind: 'meter', min: 0, max: 100, default: 50 },
  // Military
  { id: 'country.military.morale', kind: 'meter', min: 0, max: 100, default: 60 },
  { id: 'country.military.techLevel', kind: 'meter', min: 0, max: 10, default: 3 },
  { id: 'country.military.forceMultiplier', kind: 'multiplier', min: 0, max: 5, default: 1 },
  { id: 'country.military.upkeep', kind: 'multiplier', min: 0, max: 5, default: 1 },
  { id: 'country.military.salaryArrearsMonths', kind: 'count', min: 0, max: 24, default: 0 },
  { id: 'country.mechanized.mobility', kind: 'multiplier', min: 0, max: 1, default: 1 },
  { id: 'country.air.sorties', kind: 'multiplier', min: 0, max: 1, default: 1 },
  // Regions, fronts, world
  { id: 'region.unrest', kind: 'meter', min: 0, max: 100, default: 0 },
  { id: 'region.resistance', kind: 'meter', min: 0, max: 100, default: 0 },
  { id: 'front.units', kind: 'count', min: 0, max: 1_000_000, default: 0 },
  { id: 'world.tension', kind: 'meter', min: 0, max: 100, default: 30 },
];

/** @type {Map<string, StatDef>} */
const byId = new Map(STATS.map((stat) => [stat.id, stat]));

/** @param {string} id */
export function isStat(id) {
  return byId.has(id);
}

/** @param {string} id */
export function getStatDef(id) {
  return byId.get(id);
}

/** Does any system read this stat today? @param {string | undefined} id */
export function isStatActive(id) {
  return id !== undefined && byId.get(id)?.active === true;
}
