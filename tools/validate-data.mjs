// Validate everything in /data. Exits with code 1 when anything is wrong, so CI stops a broken
// file from ever being deployed. Run it any time with: npm run validate

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDatasetFromDisk, validateDataset } from './lib/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { errors, warnings } = validateDataset(readDatasetFromDisk(root));

for (const message of warnings) console.warn(`warning: ${message}`);
for (const message of errors) console.error(`error: ${message}`);

if (errors.length > 0) {
  console.error(`\nData validation failed: ${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`Data is valid (${warnings.length} warning(s)).`);
