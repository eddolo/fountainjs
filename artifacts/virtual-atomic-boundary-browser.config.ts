import { defineConfig } from '@playwright/test';
import base from './virtual-selection-production-browser.config';

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'virtual-atomic-boundary-audit-20261104.spec.ts',
  outputDir: './virtual-atomic-boundary-browser-20261104',
});
