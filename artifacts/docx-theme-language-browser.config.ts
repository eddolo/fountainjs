import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../playwright.native-docx-audit.config';

export default defineConfig({
  ...base, testDir: '../tests/native-docx', workers: 1, retries: 0,
  outputDir: './docx-theme-language-browser-20261103',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: { ...base.webServer, cwd: fileURLToPath(new URL('../', import.meta.url)) },
});
