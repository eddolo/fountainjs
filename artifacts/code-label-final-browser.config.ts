import { defineConfig, devices } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual', testMatch: 'markdown-code-labels-audit.spec.ts',
  outputDir: './code-label-final-browser-20261104', projects: [
    ...base.projects!,
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
  ] });
