import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../playwright.yjs-default.config';
export default defineConfig({
  ...base, testDir: '../tests/manual', outputDir: './yjs-native-index-input-20261117',
  webServer: { ...base.webServer, cwd: fileURLToPath(new URL('..', import.meta.url)) },
});
