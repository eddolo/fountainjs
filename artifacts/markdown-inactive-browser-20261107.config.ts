import { defineConfig } from '@playwright/test';
import base from './markdown-frontmatter-browser-20261107.config';

export default defineConfig({
  ...base,
  testMatch: '**/markdown-inactive-autolinks-real.spec.ts',
  outputDir: './markdown-inactive-browser-20261107',
  reporter: [['list'], ['json', { outputFile: 'markdown-inactive-browser-20261107.json' }]],
  webServer: {
    ...base.webServer,
    command: base.webServer.command.replace('markdown-frontmatter-site', 'markdown-inactive-site'),
  },
});
