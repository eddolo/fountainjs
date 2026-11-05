import { defineConfig } from '@playwright/test';
import base from './cross-container-browser-20261105.config';

export default defineConfig({ ...base, testDir: '.', testMatch: '**/virtual-atomic-boundary-audit-20261104.spec.ts',
  outputDir: './structural-range-smoke-browser-20261105' });
