import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '.', testMatch: '**/markdown-html-source-negative.spec.ts',
  outputDir: './markdown-html-source-negative-20261104' });
