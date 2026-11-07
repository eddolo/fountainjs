import { defineConfig } from '@playwright/test';
import base from './cross-format-browser-20261107.config';

export default defineConfig({
  ...base,
  testMatch: '**/yjs-legacy-root-conflict-real.spec.ts',
  outputDir: './yjs-legacy-root-conflict-browser-20261107',
  reporter: [['list'], ['json', { outputFile: 'yjs-legacy-root-conflict-browser-20261107.json' }]],
});
