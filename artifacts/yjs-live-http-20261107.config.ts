import { defineConfig } from '@playwright/test';
import base from './yjs-authority-admission-browser-20261107.config';

export default defineConfig({
  ...base,
  testMatch: '**/yjs-live-http-real.spec.ts',
  outputDir: './yjs-live-http-browser-20261107',
  reporter: [['list'], ['json', { outputFile: 'yjs-live-http-browser-20261107.json' }]],
});
