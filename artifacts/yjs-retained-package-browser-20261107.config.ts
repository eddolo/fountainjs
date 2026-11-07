import { defineConfig } from '@playwright/test';
import base from './retained-adapter-browser-20261106.config';

process.env.FOUNTAIN_RETAINED_PACKAGE_AUDIT = '1';
export default defineConfig({
  ...base,
  outputDir: './yjs-retained-package-browser-20261107',
  reporter: [['list'], ['json', { outputFile: 'yjs-retained-package-browser-20261107.json' }]],
  webServer: {
    ...base.webServer,
    command: 'node artifacts/yjs-retained-package-server-20261107.mjs',
    url: 'http://127.0.0.1:4195/index.html',
  },
});
