import { defineConfig } from '@playwright/test';
import base from './yjs-live-http-20261107.config';

const output = process.env.FOUNTAIN_LIVE_MIGRATED === '1'
  ? 'yjs-live-migrated-structural-browser-20261107'
  : 'yjs-live-structural-browser-20261107';

export default defineConfig({
  ...base,
  grep: /@structural/,
  grepInvert: undefined,
  outputDir: './' + output,
  reporter: [['list'], ['json', { outputFile: output + '.json' }]],
});
