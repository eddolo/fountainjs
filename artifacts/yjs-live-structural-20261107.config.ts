import { defineConfig } from '@playwright/test';
import base from './yjs-live-http-20261107.config';

export default defineConfig({
  ...base,
  grep: /@structural/,
  grepInvert: undefined,
  outputDir: './yjs-live-structural-browser-20261107',
  reporter: [['list'], ['json', { outputFile: 'yjs-live-structural-browser-20261107.json' }]],
});
