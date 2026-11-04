import { defineConfig } from '@playwright/test';
import base from './issue-input-production-browser.config';

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'issue-startup-audit-20261104.spec.ts',
  outputDir: process.env.FJS_STARTUP_FONT_CONTROL === '1' ? './issue-startup-font-control-browser-20261104' : './issue-startup-audit-browser-20261104',
});
