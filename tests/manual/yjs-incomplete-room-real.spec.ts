import { expect, test } from '@playwright/test';
import { auditCompiledRuntime } from './compiled-runtime-audit';

auditCompiledRuntime('/dist/index.js', '/dist/yjs-retained.js');

for (const protocol of ['legacy', 'retained']) {
  test(`preserves the local draft when incomplete ${protocol} room data arrives out of order`, async ({ page }, info) => {
    await page.goto(`/tests/fixtures/yjs-incomplete-room.html?protocol=${protocol}`);
    const draft = page.getByRole('textbox', { name: 'Local draft editor' });
    const status = page.getByRole('status');
    await expect(status).toContainText('unresolved update dependencies');
    await expect(page.getByText('Transport connections: 0')).toBeVisible();
    await draft.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' Keep this draft.');
    await page.getByRole('button', { name: 'Receive the missing room data' }).click();
    await page.getByRole('button', { name: 'Retry the draft session' }).click();
    await expect(status).toContainText('Preserve the local draft');
    await expect(draft).toHaveText('My local notes. Keep this draft.');
    await expect(page.getByText('Transport connections: 0')).toBeVisible();
    await page.getByRole('button', { name: 'Open the recovered room separately' }).click();
    await expect(status).toContainText('Shared room opened');
    await expect(page.getByRole('textbox', { name: 'Recovered shared editor' })).toHaveText('Shared incident notes. Reviewed.');
    await expect(draft).toHaveText('My local notes. Keep this draft.');
    await expect(page.getByText('Transport connections: 1')).toBeVisible();
    await page.screenshot({ path: info.outputPath('recovered-room-and-draft.png'), fullPage: true, scale: 'css' });
  });
}

for (const map of ['default', 'custom']) {
  test(`checks saved ${map} settings before connecting a retained room`, async ({ page }, info) => {
    // This workflow uses the retained package and does not load the legacy entry.
    await page.goto(`/tests/fixtures/yjs-incomplete-settings.html?map=${map}`);
    const status = page.getByRole('status');
    await page.getByRole('button', { name: 'Open with one field' }).click();
    await expect(status).toContainText('do not cover the saved room map');
    await expect(page.getByText('Transport connections: 0')).toBeVisible();
    const draft = page.getByRole('textbox', { name: 'Settings draft editor' });
    await draft.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' Keep this draft.');
    await page.getByRole('button', { name: 'Open with both fields' }).click();
    await expect(status).toContainText('Room opened with both saved fields');
    await expect(page.getByRole('textbox', { name: 'Verified settings editor' })).toContainText('Shared incident notes.');
    await expect(page.getByText('Columns: 2. Compact view: On.')).toBeVisible();
    await expect(page.getByText('Transport connections: 1')).toBeVisible();
    await expect(draft).toHaveText('My local notes. Keep this draft.');
    await page.screenshot({ path: info.outputPath('verified-saved-settings.png'), fullPage: true, scale: 'css' });
  });
}
