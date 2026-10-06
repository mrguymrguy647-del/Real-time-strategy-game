// Stat modifiers (DATA_SCHEMAS §3.2, ARCHITECTURE §6.7): a value is (base + Σ add) × Π mul. In
// Phase 1 the sources are a country's government and the shortages it is in (resources.json);
// traits, techniques and events add theirs here as they arrive, so the systems that read a stat
// never change.

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

/**
 * What the shortages a country is in do to a stat (resources.json: each resource has a ladder of
 * steps, and only the deepest step reached applies). It is kept apart from modifiersFor so a report
 * can name the two sources separately.
 * @param {import('./data.js').GameData} data
 * @param {{ resources?: Record<string, { step: number }> }} country a country's state
 * @param {string} statId
 * @returns {{ add: number, mul: number }}
 */
export function shortageModifiers(data, country, statId) {
  let add = 0;
  let mul = 1;
  for (const shortage of shortagesOf(data, country)) {
    for (const effect of shortage.effects) {
      if (effect.stat !== statId) continue;
      if (effect.op === 'add') add += effect.value;
      else mul *= effect.value;
    }
  }
  return { add, mul };
}

/**
 * The shortage each resource has put the country in, from the mildest to the deepest, as the data
 * describes them (label and effects). Empty when it is short of nothing.
 * @param {import('./data.js').GameData} data
 * @param {{ resources?: Record<string, { step: number }> }} country a country's state
 * @returns {Array<{ resource: string, step: number, label: string, effects: any[] }>}
 */
export function shortagesOf(data, country) {
  /** @type {Array<{ resource: string, step: number, label: string, effects: any[] }>} */
  const found = [];
  for (const [resource, entry] of Object.entries(country.resources ?? {})) {
    if (!(entry.step > 0)) continue;
    const rung = data.resources.byId[resource]?.shortage[entry.step - 1];
    if (rung) found.push({ resource, step: entry.step, label: rung.label, effects: rung.effects });
  }
  return found;
}
