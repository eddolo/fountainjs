import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual', testMatch: '**/markdown-reference-boundaries-real.spec.ts', outputDir: './markdown-reference-boundaries-browser-20261104' });
