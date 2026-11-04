import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual',
  testMatch: '**/docx-spacing-identity-real.spec.ts', outputDir: './docx-spacing-identity-browser-20261104' });
