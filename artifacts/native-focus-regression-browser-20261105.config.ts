import { defineConfig } from '@playwright/test';
import base from './native-focus-browser-20261105.config';

export default defineConfig({ ...base,
  grep: /inserts table columns on the physical left|opens and cancels public configuration panels|keeps the public native colour field|compares list-first code text-click|edits RTL blocks/,
  outputDir: './native-focus-regression-browser-20261105' });
