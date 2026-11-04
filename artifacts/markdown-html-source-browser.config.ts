import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual', testMatch: '**/issue-html-source-real.spec.ts', outputDir: './markdown-html-source-browser-20261104' });
