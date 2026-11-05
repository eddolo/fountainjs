import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '.', testMatch: 'code-label-pointer-audit-20261104.spec.ts',
  outputDir: './code-label-pointer-before-browser-20261104' });
