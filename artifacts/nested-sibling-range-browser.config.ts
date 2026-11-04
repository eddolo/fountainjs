import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';

export default defineConfig({
  ...base,
  testDir: '../tests/manual',
  testMatch: ['**/nested-sibling-range-real.spec.ts', '**/virtual-selection-real.spec.ts', '**/issue-editor-audit.spec.ts'],
  outputDir: './nested-sibling-range-browser-20261104',
});
