import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './tests/manual',
  testMatch: [
    '**/starter-projects.spec.ts',
    '**/template-workspace.spec.ts',
    '**/template-host-accounts.spec.ts',
  ],
  workers: 1,
  retries: 0,
  outputDir: './artifacts/installed-starters/browser',
  reporter: 'list',
  use: { headless: true, screenshot: 'on', video: 'on', trace: 'on' },
  projects: [
    {
      name: 'production-downloads',
      testDir: './tests/browser',
      testMatch: '**/starter-downloads.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4204/fountainjs/' },
    },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command:
        'pnpm exec vite build --base /fountainjs/ && pnpm exec vite preview --host 127.0.0.1 --port 4204 --strictPort --base /fountainjs/',
      url: 'http://127.0.0.1:4204/fountainjs/developers.html',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    ...Object.entries({ 'plain-dom': 4201, react: 4202, templates: 4203, vue: 4205 }).map(([kind, port]) => ({
      command: `node scripts/installed-starters.mjs serve ${kind}`,
      url: `http://127.0.0.1:${port}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    })),
  ],
});
