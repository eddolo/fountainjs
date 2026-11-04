import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/browser', testMatch: '**/editor.spec.ts', grep: /checks actual DOCX retention beside an independent viewer/, outputDir: './docx-retention-expectation-browser-20261104' });
