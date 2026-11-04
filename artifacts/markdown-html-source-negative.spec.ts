import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('visually inspects the retained pre-repair download in the current viewer', async ({ page }, info) => {
  await page.goto('/issue-editor.html');
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(resolve(
    'artifacts/markdown-html-source-before-browser-20261104/issue-html-source-real-an--279f4-hrough-real-draft-downloads-chromium/issue-html-source-journey/edited.md'));
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await expect(editor.locator('pre')).toHaveText('first\n\n[ref]: /target "Original title"');
  await expect(editor.getByRole('heading')).toHaveText('Keep [link][ref]');
  await expect(editor.getByRole('link')).toHaveCount(0);
  await editor.screenshot({ path: info.outputPath('actual-old-download-current-viewer.png') });
});
