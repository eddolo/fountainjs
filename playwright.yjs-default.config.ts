import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

process.env.FOUNTAIN_DEFAULT_YJS_AUDIT = '1';
export default defineConfig({
  ...base, testDir: './tests/manual', testMatch: '**/retained-adapter-real.spec.ts',
  workers: 1, retries: 0, timeout: 120_000,
  outputDir: './artifacts/yjs-default-browser', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4196', headless: true, video: 'on', trace: 'on',
    screenshot: 'only-on-failure', viewport: { width: 1440, height: 1000 } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node scripts/prepare-yjs-default-browser.mjs && pnpm exec vite --config tests/fixtures/yjs-default-vite.config.ts',
    url: 'http://127.0.0.1:4196/artifacts/yjs-default-fixture.html',
    reuseExistingServer: false, timeout: 120_000,
  },
});
