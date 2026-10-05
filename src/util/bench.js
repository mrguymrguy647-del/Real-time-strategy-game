// A fixed CPU workload that runs the same way in Node and in a phone browser. The
// Diagnostics screen reports the phone's time; running this in Node gives the reference,
// so the ratio calibrates the "Node milliseconds x ~4 = a mid-range phone" rule of thumb.

/** One pass of mixed integer math, a numeric sort and a JSON round trip. Returns a checksum. */
function workload() {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < 4_000_000; i++) h = Math.imul(h ^ i, 16777619);

  const numbers = new Float64Array(60_000);
  let seed = 12345;
  for (let i = 0; i < numbers.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    numbers[i] = seed;
  }
  numbers.sort();

  const objects = [];
  for (let i = 0; i < 300; i++) {
    objects.push({ id: `r${i}`, a: i * 1.5, b: [i, i + 1, i + 2], c: { x: i, y: -i, name: `region ${i}` } });
  }
  const copy = JSON.parse(JSON.stringify(objects));

  return (h ^ numbers[0] ^ numbers[numbers.length - 1] ^ copy.length) | 0;
}

/**
 * Median wall-clock milliseconds of the fixed workload.
 * @param {{ rounds?: number }} [options]
 */
export function cpuBenchmark({ rounds = 3 } = {}) {
  /** @type {number[]} */
  const times = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    workload();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}
