import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';

export default defineConfig({
  ...base, testDir: '../tests/manual', testMatch: '**/docx-style-numbering-audit.spec.ts',
  outputDir: './docx-style-numbering-browser-final-20261103',
});
