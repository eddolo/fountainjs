import { expect, test } from '@playwright/test';
import { auditCompiledRuntime } from './compiled-runtime-audit';

auditCompiledRuntime('/dist/index.js', '/dist/yjs.js', '/dist/yjs-retained.js');

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
