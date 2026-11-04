import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual', testMatch: '**/markdown-nested-source-real.spec.ts', outputDir: './markdown-nested-source-browser-20261104' });
