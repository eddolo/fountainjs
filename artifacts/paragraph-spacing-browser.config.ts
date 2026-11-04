import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual',
  testMatch: '**/paragraph-spacing-real.spec.ts', outputDir: './paragraph-spacing-browser-20261104' });
