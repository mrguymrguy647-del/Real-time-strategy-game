// Helpers for tests that read source files: list them, strip comments and strings, find imports.

import fs from 'node:fs';
import path from 'node:path';

/** All files with one of the given extensions under a directory. @param {string} dir @param {string[]} [extensions] @returns {string[]} */
export function walk(dir, extensions = ['.js']) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, extensions);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

/** Source with comments removed, so documentation that mentions "Math.random()" is not a violation. @param {string} code */
export function withoutComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Also blank out string contents, for scanning code rather than text. @param {string} code */
export function codeOnly(code) {
  return withoutComments(code)
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/(['"])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
}

/** Every module specifier a source file imports (static, side-effect, dynamic and re-exports). @param {string} code @returns {string[]} */
export function importsOf(code) {
  const clean = withoutComments(code);
  /** @type {string[]} */
  const specs = [];
  for (const m of clean.matchAll(/\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1/g)) specs.push(m[2]);
  for (const m of clean.matchAll(/\bimport\s*(['"])([^'"]+)\1/g)) specs.push(m[2]);
  for (const m of clean.matchAll(/\bimport\(\s*(['"])([^'"]+)\1\s*\)/g)) specs.push(m[2]);
  return specs;
}
