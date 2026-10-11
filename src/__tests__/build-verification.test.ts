import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(__dirname, '../..');

describe('Unified Extension Build Verification', () => {
  const chromeOut = resolve(rootDir, '.output/chrome');
  const firefoxOut = resolve(rootDir, '.output/firefox');

  it('verifies Chrome manifest is valid Manifest V3', () => {
    const manifestPath = resolve(chromeOut, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('Private Apply');
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.action.default_popup).toBe('popup/popup.html');
    expect(Array.isArray(manifest.web_accessible_resources)).toBe(true);
    expect(manifest.web_accessible_resources[0]).toHaveProperty('matches');
  });

  it('verifies Firefox manifest is valid Manifest V2 with Gecko IDs', () => {
    const manifestPath = resolve(firefoxOut, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.manifest_version).toBe(2);
    expect(manifest.name).toBe('Private Apply');
    expect(manifest.background.scripts).toContain('background.js');
    expect(manifest.browser_action.default_popup).toBe('popup/popup.html');
    expect(manifest.browser_specific_settings?.gecko?.id).toBe('{e0857c2d-15a6-4d0c-935e-57761715dc3d}');
  });

  it('verifies all entrypoint bundles and HTML pages exist in both builds', () => {
    const requiredFiles = [
      'background.js',
      'content.js',
      'content-whatsapp.js',
      'pdf.worker.min.js',
      'popup/popup.html',
      'popup/popup.js',
      'popup/popup.css',
      'settings/settings.html',
      'settings/settings.js',
      'settings/settings.css',
      'profiles/profiles.html',
      'profiles/profiles.js',
      'profiles/profiles.css',
      'onboarding/onboarding.html',
      'onboarding/onboarding.js',
      'chat/chat.html',
      'chat/chat.js',
      'jobs/jobs.html',
      'jobs/jobs.js',
      'resume-tailor/resume-tailor.html',
      'resume-tailor/resume-tailor.js',
      'dashboard/dashboard.html',
      'dashboard/dashboard.js',
      'tutorial/tutorial.html',
      'tutorial/tutorial.js',
      'home/home.html',
      'home/home.js',
      'data/data.html',
      'data/data.js',
      'shared/theme.css',
      'shared/dark-mode.js',
      'icons/toolbar-16.png',
      'icons/toolbar-48.png',
      'icons/toolbar-128.png',
    ];

    for (const rel of requiredFiles) {
      expect(existsSync(resolve(chromeOut, rel)), `Chrome missing: ${rel}`).toBe(true);
      expect(existsSync(resolve(firefoxOut, rel)), `Firefox missing: ${rel}`).toBe(true);
    }
  });

  it('verifies Firefox native host is packaged in Firefox build', () => {
    const nativeHostIndex = resolve(firefoxOut, 'native-host/index.js');
    expect(existsSync(nativeHostIndex)).toBe(true);
  });
});
