import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual',
  testMatch: '**/list-marker-visibility-real.spec.ts', outputDir: './list-marker-visibility-browser-20261104' });
