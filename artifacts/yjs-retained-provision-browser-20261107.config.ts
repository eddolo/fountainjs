import { defineConfig } from '@playwright/test';
import base from './yjs-authority-admission-browser-20261107.config';

export default defineConfig({
  ...base,
  testMatch: '**/yjs-retained-provision-real.spec.ts',
  outputDir: './yjs-retained-provision-browser-20261107',
  reporter: [['list'], ['json', { outputFile: 'yjs-retained-provision-browser-20261107.json' }]],
  webServer: {
    ...base.webServer,
    command: 'node artifacts/prepare-yjs-retained-provision-20261107.mjs && node artifacts/build-yjs-retained-provision-20261107.mjs && node artifacts/yjs-retained-provision-server-20261107.mjs',
    url: 'http://127.0.0.1:4195/artifacts/yjs-retained-provision-fixture-20261107.html',
  },
});
