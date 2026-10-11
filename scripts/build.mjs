/**
 * Unified Build Script for PrivateApply (Offlyn Apply) Extension
 * Builds both Chrome and Firefox extensions from a single shared source of truth.
 *
 * Usage:
 *   node scripts/build.mjs                    # Build both Chrome and Firefox extensions
 *   node scripts/build.mjs --browser=chrome    # Build Chrome extension only
 *   node scripts/build.mjs --browser=firefox   # Build Firefox extension only
 *   node scripts/build.mjs --watch            # Watch mode for changes
 */

import esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, existsSync, rmSync, statSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const args = process.argv.slice(2);
const watch = args.includes('--watch') || args.includes('-w');

// Parse target browser: chrome, firefox, or both
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

// Shared static public directory and browser-specific manifests
const sharedPublicDir = join(rootDir, 'public');
const browserConfigsDir = join(rootDir, 'browser');

// Entry points mapping (TS source -> bundled JS in output)
const pathMap = {
  'src/background.ts': 'background.js',
  'src/content.ts': 'content.js',
  'src/content-whatsapp.ts': 'content-whatsapp.js',
  'src/popup/popup.ts': 'popup/popup.js',
  'src/settings/settings.ts': 'settings/settings.js',
  'src/profiles/profiles.ts': 'profiles/profiles.js',
  'src/onboarding/onboarding.ts': 'onboarding/onboarding.js',
  'src/chat/chat.ts': 'chat/chat.js',
  'src/jobs/jobs.ts': 'jobs/jobs.js',
  'src/resume-tailor/resume-tailor.ts': 'resume-tailor/resume-tailor.js',
  'src/dashboard/dashboard.ts': 'dashboard/dashboard.js',
  'src/tutorial/tutorial.ts': 'tutorial/tutorial.js',
};

const dataExplorerEntry = {
  'src/data/data.tsx': 'data/data.js',
};

function copyRecursive(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function prepareOutputDir(browser, outDir) {
  // Ensure output directory exists
  mkdirSync(outDir, { recursive: true });

  // 1. Copy shared public assets (HTML, CSS, icons, pdf.worker, etc.)
  copyRecursive(sharedPublicDir, outDir);

  // 2. Copy browser-specific manifest.json (overwrites any placeholder)
  const manifestSrc = join(browserConfigsDir, browser, 'manifest.json');
  if (existsSync(manifestSrc)) {
    copyFileSync(manifestSrc, join(outDir, 'manifest.json'));
  } else {
    console.warn(`[Warning] No manifest found at ${manifestSrc}`);
  }

  // 3. Copy any browser-specific extras (e.g. Firefox native-host)
  const nativeHostSrc = join(browserConfigsDir, browser, 'native-host');
  if (existsSync(nativeHostSrc)) {
    copyRecursive(nativeHostSrc, join(outDir, 'native-host'));
  }
}

function getBuildOptions(browser, outDir) {
  return {
    bundle: true,
    platform: 'browser',
    target: ['chrome100', 'firefox100'],
    sourcemap: watch ? 'inline' : false,
    minify: !watch,
    define: {
      'process.env.NODE_ENV': watch ? '"development"' : '"production"',
      'process.env.BROWSER': JSON.stringify(browser),
      'process.env.ADZUNA_APP_ID': JSON.stringify(process.env.ADZUNA_APP_ID ?? 'ad50e38e'),
      'process.env.ADZUNA_APP_KEY': JSON.stringify(process.env.ADZUNA_APP_KEY ?? ''),
      'process.env.GROQ_API_KEY': JSON.stringify(process.env.GROQ_API_KEY ?? ''),
      'process.env.OPENAI_API_KEY': JSON.stringify(process.env.OPENAI_API_KEY ?? ''),
      'process.env.ANTHROPIC_API_KEY': JSON.stringify(process.env.ANTHROPIC_API_KEY ?? ''),
    },
  };
}

async function buildBrowser(browser) {
  const startTime = Date.now();
  const outDir = join(rootDir, '.output', browser);
  const legacyDir = join(rootDir, 'apps', `extension-${browser}`, 'dist');

  console.log(`[Build] Building ${browser.toUpperCase()} extension -> ${outDir}...`);
  prepareOutputDir(browser, outDir);

  const baseOptions = getBuildOptions(browser, outDir);

  // Compile standard entry points
  for (const [entry, relOutfile] of Object.entries(pathMap)) {
    const entryPath = join(rootDir, entry);
    const outfile = join(outDir, relOutfile);
    mkdirSync(dirname(outfile), { recursive: true });
    await esbuild.build({
      ...baseOptions,
      entryPoints: [entryPath],
      outfile,
    });
  }

  // Compile React Data Explorer with JSX automatic runtime
  for (const [entry, relOutfile] of Object.entries(dataExplorerEntry)) {
    const entryPath = join(rootDir, entry);
    const outfile = join(outDir, relOutfile);
    mkdirSync(dirname(outfile), { recursive: true });
    await esbuild.build({
      ...baseOptions,
      jsx: 'automatic',
      entryPoints: [entryPath],
      outfile,
    });
  }

  // Mirror to legacy apps/extension-<browser>/dist for compatibility
  try {
    copyRecursive(outDir, legacyDir);
  } catch (err) {
    // Non-critical mirror
  }

  const duration = Date.now() - startTime;
  console.log(`[Build] ✓ ${browser.toUpperCase()} extension built successfully in ${duration}ms`);
}

async function watchBrowser(browser) {
  const outDir = join(rootDir, '.output', browser);
  console.log(`[Watch] Setting up watch mode for ${browser.toUpperCase()} -> ${outDir}...`);
  prepareOutputDir(browser, outDir);

  const baseOptions = getBuildOptions(browser, outDir);
  const contexts = [];

  for (const [entry, relOutfile] of Object.entries(pathMap)) {
    const entryPath = join(rootDir, entry);
    const outfile = join(outDir, relOutfile);
    mkdirSync(dirname(outfile), { recursive: true });
    const ctx = await esbuild.context({
      ...baseOptions,
      entryPoints: [entryPath],
      outfile,
    });
    contexts.push(ctx);
  }

  for (const [entry, relOutfile] of Object.entries(dataExplorerEntry)) {
    const entryPath = join(rootDir, entry);
    const outfile = join(outDir, relOutfile);
    mkdirSync(dirname(outfile), { recursive: true });
    const ctx = await esbuild.context({
      ...baseOptions,
      jsx: 'automatic',
      entryPoints: [entryPath],
      outfile,
    });
    contexts.push(ctx);
  }

  await Promise.all(contexts.map(c => c.watch()));
  console.log(`[Watch] ✓ Watching for changes in ${browser.toUpperCase()}...`);
}

async function run() {
  try {
    for (const browser of targets) {
      if (watch) {
        await watchBrowser(browser);
      } else {
        await buildBrowser(browser);
      }
    }
    if (!watch) {
      console.log(`\n🎉 All target extensions built successfully in .output/`);
      console.log(`   - Chrome:  ${join(rootDir, '.output', 'chrome')}`);
      console.log(`   - Firefox: ${join(rootDir, '.output', 'firefox')}\n`);
    }
  } catch (err) {
    console.error('[Error] Build failed:', err);
    process.exit(1);
  }
}

run();
