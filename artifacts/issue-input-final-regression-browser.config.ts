import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual', testMatch: [
  '**/issue-input-real.spec.ts', '**/issue-editor-audit.spec.ts', '**/issue-html-source-real.spec.ts', '**/issue-table-handoff-audit.spec.ts',
], outputDir: './issue-input-final-regression-browser-20261104' });
