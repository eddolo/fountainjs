import { defineConfig } from '@playwright/test';
import base from './artifacts/retained-adapter-browser-20261106.config';

export default defineConfig({
  ...base,
  testDir: './tests/manual',
  testMatch: ['yjs-incomplete-room-real.spec.ts', 'yjs-detached-draft-real.spec.ts'],
  outputDir: './artifacts/yjs-incomplete-room-browser',
  reporter: 'list',
});
