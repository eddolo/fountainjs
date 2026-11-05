import { defineConfig } from '@playwright/test';
import base from './cross-container-browser-20261105.config';

export default defineConfig({ ...base, testMatch: '**/document-range-formatting-real.spec.ts',
  outputDir: './structural-formatting-browser-20261105' });
