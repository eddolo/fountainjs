import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../playwright.config';

export default defineConfig({
  ...base, testDir: '../tests/manual', testMatch: '**/cross-container-range-real.spec.ts',
  workers: 1, retries: 0, timeout: 120_000, outputDir: './cross-container-native-final-browser-20261105', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4195', headless: true, video: 'on', trace: 'on', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: 'pnpm exec vite preview --config vite.input-audit.config.ts --host 127.0.0.1 --port 4195 --strictPort',
    url: 'http://127.0.0.1:4195/issue-editor.html', reuseExistingServer: false, timeout: 120_000,
  },
});
