import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './tests/manual', testMatch: '**/starter-projects.spec.ts',
  workers: 1, retries: 0,
  outputDir: './artifacts/installed-starters/browser', reporter: 'list',
  use: { headless: true, screenshot: 'on', video: 'on', trace: 'on' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: ['plain-dom', 'react'].map(kind => ({
    command: `node scripts/installed-starters.mjs serve ${kind}`,
    url: `http://127.0.0.1:${kind === 'plain-dom' ? 4201 : 4202}/`,
    reuseExistingServer: false, timeout: 30_000,
  })),
});
