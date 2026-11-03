import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';

export default defineConfig({
  ...base,
  outputDir: './docx-theme-size-browser-20261103',
});
