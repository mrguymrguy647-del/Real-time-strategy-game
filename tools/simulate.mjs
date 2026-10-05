// Headless simulator: runs the real game with no UI (T-04). It is how balance and stability are
// checked without a phone. `npm test` runs it with --soak.
//
//   npm run simulate -- --seeds 1,2,3 --turns 120
//   npm run simulate -- --bench          (prints the CPU benchmark to compare with a phone)
//   node tools/simulate.mjs --soak       (3 seeds x 60 turns, invariants on, determinism check)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../src/core/data.js';
import { createGame } from '../src/game.js';
import { cpuBenchmark } from '../src/util/bench.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string[]} argv */
function parseArgs(argv) {
  const options = { seeds: [1], turns: 120, soak: false, bench: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--soak') Object.assign(options, { soak: true, seeds: [1, 2, 3], turns: 60 });
    else if (arg === '--bench') options.bench = true;
    else if (arg === '--seeds') options.seeds = argv[++i].split(',').map(Number);
    else if (arg === '--turns') options.turns = Number(argv[++i]);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const data = await loadData(async (p) => JSON.parse(await fs.readFile(path.join(root, p), 'utf8')));

/** @param {number} seed @param {number} turns */
function run(seed, turns) {
  const game = createGame({ data, seed, checkInvariants: true });
  let max = 0;
  const start = performance.now();
  for (let i = 0; i < turns; i++) {
    const t0 = performance.now();
    const result = game.endTurn();
    max = Math.max(max, performance.now() - t0);
    if (!result.ok) throw new Error(`seed ${seed}, turn ${i + 1} failed in "${result.error.system}": ${result.error.message}`);
  }
  const total = performance.now() - start;
  return { game, total, max, json: JSON.stringify(game.state) };
}

let failed = false;
for (const seed of options.seeds) {
  try {
    const { game, total, max, json } = run(seed, options.turns);
    const { year, month } = game.state.clock;
    const date = `${year}-${String(month).padStart(2, '0')}`;
    console.log(
      `seed ${seed}: ${options.turns} turns ok · ${(total / options.turns).toFixed(3)} ms/turn (max ${max.toFixed(2)}) · state ${(json.length / 1024).toFixed(1)} KB · ends ${date}`,
    );
  } catch (err) {
    failed = true;
    console.error(`seed ${seed}: FAILED - ${err instanceof Error ? err.message : err}`);
  }
}

if (options.soak && !failed) {
  const a = run(options.seeds[0], options.turns).json;
  const b = run(options.seeds[0], options.turns).json;
  if (a === b) {
    console.log(`determinism: ok (seed ${options.seeds[0]} twice gives an identical state)`);
  } else {
    failed = true;
    console.error('determinism: FAILED - the same seed produced two different games');
  }
}

if (options.bench) {
  console.log(`cpu benchmark: ${cpuBenchmark({ rounds: 5 }).toFixed(1)} ms (median of 5; compare with the phone's Diagnostics number)`);
}

process.exit(failed ? 1 : 0);
