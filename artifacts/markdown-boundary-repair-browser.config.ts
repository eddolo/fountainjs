import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual', testMatch: '**/markdown-boundary-repair-real.spec.ts', outputDir: './markdown-boundary-repair-browser-20261104' });
