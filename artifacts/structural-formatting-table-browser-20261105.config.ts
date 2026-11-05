import { defineConfig } from '@playwright/test';
import base from './cross-container-browser-20261105.config';

export default defineConfig({ ...base, testMatch: '**/table-column-side-real.spec.ts',
  outputDir: './structural-formatting-table-before-browser-20261105' });
