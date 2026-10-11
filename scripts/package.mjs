/**
 * Packaging Script for PrivateApply Extension
 * Packages the built extensions in .output/ into zip archives for distribution.
 */

import { existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const args = process.argv.slice(2);
let targetBrowser = null;
const browserArg = args.find(a => a.startsWith('--browser=') || a.startsWith('-b='));
if (browserArg) {
  targetBrowser = browserArg.split('=')[1].toLowerCase();
} else if (args.includes('--chrome')) {
  targetBrowser = 'chrome';
} else if (args.includes('--firefox')) {
  targetBrowser = 'firefox';
}

const targets = targetBrowser ? [targetBrowser] : ['chrome', 'firefox'];

for (const browser of targets) {
  const dir = join(rootDir, '.output', browser);
  if (!existsSync(dir)) {
    console.log(`[Package] .output/${browser} not found, building first...`);
    execSync(`node scripts/build.mjs --browser=${browser}`, { stdio: 'inherit', cwd: rootDir });
  }

  const zipName = `private-apply-${browser}.zip`;
  const zipPath = join(rootDir, '.output', zipName);
  console.log(`[Package] Packaging ${browser} extension -> ${zipPath}...`);

  try {
    execSync(`cd "${dir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
    console.log(`[Package] ✓ Packaged ${zipName}`);
  } catch (err) {
    console.error(`[Package] Failed to zip ${browser}:`, err.message);
  }
}
