// Vendor Phaser from its npm tarball into vendor/phaser/ (T-03). CDNs are blocked in the cloud
// sandbox and the game must work offline, so the browser always loads the committed copy.
//
//   npm run vendor:phaser                 re-vendor the version recorded in vendor/phaser/VERSION.json
//   npm run vendor:phaser -- 4.2.1        vendor a specific version

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'vendor/phaser');
const versionFile = path.join(outDir, 'VERSION.json');
const DEFAULT_VERSION = '4.2.1';

function recordedVersion() {
  try {
    return JSON.parse(fs.readFileSync(versionFile, 'utf8')).version;
  } catch {
    return undefined;
  }
}

const version = process.argv[2] ?? recordedVersion() ?? DEFAULT_VERSION;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'phaser-vendor-'));

try {
  console.log(`Downloading phaser@${version} from the npm registry...`);
  execFileSync('npm', ['pack', `phaser@${version}`, '--silent'], { cwd: work, stdio: ['ignore', 'ignore', 'inherit'] });
  const tarball = fs.readdirSync(work).find((name) => name.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack produced no tarball');
  execFileSync('tar', ['-xzf', tarball, 'package/dist/phaser.esm.min.js', 'package/LICENSE.md', 'package/package.json'], { cwd: work });

  fs.mkdirSync(outDir, { recursive: true });
  const bundle = fs.readFileSync(path.join(work, 'package/dist/phaser.esm.min.js'));
  fs.writeFileSync(path.join(outDir, 'phaser.esm.min.js'), bundle);
  fs.copyFileSync(path.join(work, 'package/LICENSE.md'), path.join(outDir, 'LICENSE.md'));

  const pkg = JSON.parse(fs.readFileSync(path.join(work, 'package/package.json'), 'utf8'));
  const info = {
    name: 'phaser',
    version: pkg.version,
    license: pkg.license,
    file: 'phaser.esm.min.js',
    bytes: bundle.length,
    sha256: crypto.createHash('sha256').update(bundle).digest('hex'),
    source: `https://registry.npmjs.org/phaser/-/phaser-${pkg.version}.tgz`,
  };
  fs.writeFileSync(versionFile, `${JSON.stringify(info, null, 2)}\n`);
  console.log(`Vendored phaser ${info.version} (${(info.bytes / 1024 / 1024).toFixed(2)} MB, ${info.license}) into vendor/phaser/`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
