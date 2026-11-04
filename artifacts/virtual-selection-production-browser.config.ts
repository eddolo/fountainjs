import { defineConfig, devices } from '@playwright/test';
import base from './issue-input-production-browser.config';

export default defineConfig({
  ...base,
  testMatch: '**/virtual-selection-real.spec.ts',
  outputDir: './virtual-selection-production-browser-20261104',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
