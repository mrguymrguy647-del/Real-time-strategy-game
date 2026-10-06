// Stat modifiers (DATA_SCHEMAS §3.2, ARCHITECTURE §6.7): a value is (base + Σ add) × Π mul. In
// Phase 1 the only source is a country's government; traits, techniques and events add theirs here
// as they arrive, so the systems that read a stat never change.

/**
 * @param {import('./data.js').GameData} data
 * @param {{ government: string }} country a country's state
 * @param {string} statId for example "country.economy.growth"
 * @returns {{ add: number, mul: number }}
 */
export function modifiersFor(data, country, statId) {
  let add = 0;
  let mul = 1;
  for (const modifier of data.governments.byId[country.government]?.modifiers ?? []) {
    if (modifier.stat !== statId) continue;
    if (modifier.op === 'add') add += modifier.value;
    else mul *= modifier.value;
  }
  return { add, mul };
}
