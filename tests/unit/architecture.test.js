// Layering is a test (T-14). util -> formulas -> core -> systems -> ai -> ui: a layer may import
// only from layers to its left, the simulation layers never touch the DOM or global randomness,
// and Phaser stays inside the map and battle views.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../helpers/data.js';
import { codeOnly, importsOf, walk } from '../helpers/source.js';

const SRC = path.join(ROOT, 'src');
const LAYERS = ['util', 'formulas', 'core', 'systems', 'ai', 'ui'];
const rank = Object.fromEntries(LAYERS.map((name, i) => [name, i]));

/** @param {string} file @returns {string} a layer name, or "root" for src/*.js */
function layerOf(file) {
  const parts = path.relative(SRC, file).split(path.sep);
  return parts.length === 1 ? 'root' : parts[0];
}

const files = walk(SRC).map((file) => ({
  file,
  rel: path.relative(SRC, file).split(path.sep).join('/'),
  layer: layerOf(file),
  code: fs.readFileSync(file, 'utf8'),
}));

describe('architecture', () => {
  it('finds the source files', () => {
    assert.ok(files.length > 10);
  });

  it('only imports from layers to the left (ui may also use src/game.js)', () => {
    const violations = [];
    for (const { file, rel, layer, code } of files) {
      for (const spec of importsOf(code)) {
        if (!spec.startsWith('.')) continue;
        const target = path.resolve(path.dirname(file), spec);
        const targetLayer = layerOf(target);
        if (layer === 'root') {
          if (rel === 'game.js' && targetLayer === 'ui') violations.push(`${rel} imports ${spec}`);
        } else if (targetLayer === 'root') {
          if (!(layer === 'ui' && path.basename(target) === 'game.js')) violations.push(`${rel} imports ${spec}`);
        } else if (rank[targetLayer] > rank[layer]) {
          violations.push(`${rel} (${layer}) imports from ${targetLayer}: ${spec}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it('imports no package except Phaser, and Phaser only in src/ui/phaser.js', () => {
    const violations = [];
    for (const { rel, code } of files) {
      for (const spec of importsOf(code)) {
        if (spec.startsWith('.') || spec.startsWith('/')) continue;
        if (!(spec === 'phaser' && rel === 'ui/phaser.js')) violations.push(`${rel} imports "${spec}"`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it('uses the Phaser adapter only inside src/ui/map and src/ui/battle', () => {
    const violations = [];
    for (const { file, rel, code } of files) {
      for (const spec of importsOf(code)) {
        if (!spec.startsWith('.')) continue;
        const target = path.relative(SRC, path.resolve(path.dirname(file), spec)).split(path.sep).join('/');
        if (target === 'ui/phaser.js' && !/^ui\/(map|battle)\//.test(rel)) violations.push(`${rel} imports the Phaser adapter`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it('keeps the simulation free of the DOM, storage, and global randomness or time (T-04, T-07)', () => {
    const dateAllowed = ['core/save.js', 'core/storage/idb.js'];
    const violations = [];
    for (const { rel, layer, code } of files) {
      const simulation = ['util', 'formulas', 'core', 'systems', 'ai'].includes(layer) || rel === 'game.js';
      if (!simulation) continue;
      const clean = codeOnly(code);
      const banned = [/\bwindow\b/, /\bdocument\b/, /\bnavigator\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /Math\.random\s*\(/];
      if (!dateAllowed.includes(rel)) banned.push(/Date\.now\s*\(/, /new Date\s*\(/);
      for (const pattern of banned) if (pattern.test(clean)) violations.push(`${rel} uses ${pattern}`);
    }
    assert.deepEqual(violations, []);
  });

  it('never imports from tools or tests', () => {
    const violations = [];
    for (const { rel, code } of files) {
      for (const spec of importsOf(code)) if (/(^|\/)(tools|tests)\//.test(spec)) violations.push(`${rel} imports ${spec}`);
    }
    assert.deepEqual(violations, []);
  });
});
