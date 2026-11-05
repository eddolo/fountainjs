import { defineConfig } from '@playwright/test';
import base from './cross-container-browser-20261105.config';

export default defineConfig({ ...base,
  testMatch: ['**/cross-container-range-real.spec.ts', '**/nested-sibling-range-real.spec.ts', '**/virtual-selection-real.spec.ts'],
  outputDir: './structural-range-regression-browser-20261105' });
