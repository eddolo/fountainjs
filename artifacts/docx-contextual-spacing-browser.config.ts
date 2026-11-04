import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual',
  testMatch: '**/docx-contextual-spacing-audit.spec.ts', outputDir: './docx-contextual-spacing-browser-20261103' });
