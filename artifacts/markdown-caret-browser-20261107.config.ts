import { defineConfig } from '@playwright/test';
import base from './markdown-frontmatter-browser-20261107.config';

export default defineConfig({
  ...base,
  testMatch: '**/markdown-caret-html-real.spec.ts',
  outputDir: './markdown-caret-browser-20261107',
  reporter: [['list'], ['json', { outputFile: 'markdown-caret-browser-20261107.json' }]],
  webServer: {
    ...base.webServer,
    command: base.webServer.command.replace('markdown-frontmatter-site', 'markdown-caret-site'),
  },
});
