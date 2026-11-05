import { defineConfig } from '@playwright/test';
import base from './cross-container-browser-20261105.config';

export default defineConfig({ ...base, testMatch: '**/document-boundary-range-real.spec.ts',
  outputDir: './structural-range-native-after-pointer-browser-20261105' });
