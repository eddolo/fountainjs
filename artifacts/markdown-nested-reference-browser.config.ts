import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual', testMatch: '**/markdown-nested-reference-real.spec.ts',
  outputDir: './markdown-nested-references-browser-20261104' });
