import { defineConfig } from '@playwright/test';
import base from './yjs-authority-admission-browser-20261107.config';

export default defineConfig({
  ...base,
  testMatch: '**/yjs-browser-draft-real.spec.ts',
  outputDir: './yjs-browser-draft-browser-20261107',
  reporter: [['list'], ['json', { outputFile: 'yjs-browser-draft-browser-20261107.json' }]],
});
