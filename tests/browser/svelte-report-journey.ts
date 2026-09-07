import { expect, type Page, type TestInfo } from '@playwright/test';

export async function svelteReportJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/svelte-report.html');
  const workspace = page.locator('[data-svelte-report]');
  const editor = page.getByRole('textbox', { name: 'Svelte report editor' });
  const lifecycle = page.getByLabel('Editor lifecycle', { exact: true });
  await expect(editor).toBeVisible();
  await expect(lifecycle).toHaveText('Created: 1 · Destroyed: 0');
  const cell = editor.locator('table tr').nth(1).locator('td').nth(1);
  await cell.click(); await page.keyboard.press('End'); await page.keyboard.press('Shift+Home');
  await page.keyboard.type('99.99%');
  await expect(cell).toHaveText('99.99%');
  const inspector = workspace.locator('.demo-output pre');
  await expect(inspector).toContainText('99.99%');
  await workspace.locator('summary').filter({ hasText: 'Table options' }).click();
  await workspace.getByRole('button', { name: 'Add row below', exact: true }).click();
  await expect(editor.locator('table tr')).toHaveCount(4);
  await workspace.getByRole('button', { name: 'Add column right', exact: true }).click();
  await expect(editor.locator('table th, table td')).toHaveCount(16);
  // Adding the row selects its first cell; the new column therefore shifts
  // Availability right. Verify the document, not the old numeric column.
  const availability = editor.locator('table tr').nth(1).locator('td').nth(2);
  await expect(availability).toHaveText('99.99%');
  const documentBeforeRemount = await inspector.textContent();
  await workspace.getByRole('button', { name: 'Hide editor', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(lifecycle).toHaveText('Created: 1 · Destroyed: 0');
  await workspace.getByRole('button', { name: 'Show editor', exact: true }).click();
  await expect(editor.locator('table th, table td')).toHaveCount(16);
  await expect(availability).toHaveText('99.99%');
  await expect(inspector).toHaveText(documentBeforeRemount!);
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('table th, table td')).toHaveCount(12);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor.locator('table th, table td')).toHaveCount(16);
  await editor.locator('p').last().click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const note = 'Reviewed release metrics.';
  await page.keyboard.type(note);
  for (let index = 0; index < note.length; index++) await page.keyboard.press('Shift+ArrowLeft');
  await workspace.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(editor.locator('strong')).toContainText([note]);
  await workspace.getByRole('button', { name: 'Quote', exact: true }).click();
  await expect(editor.locator('blockquote')).toContainText(note);
  await expect(workspace.getByRole('button', { name: 'Quote', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await workspace.getByRole('button', { name: 'Quote', exact: true }).click();
  await expect(editor.locator('blockquote')).toHaveCount(0);
  await workspace.getByRole('button', { name: 'markdown', exact: true }).click();
  await expect(inspector).toContainText('99.99%');
  await expect(inspector).toContainText(`**${note}**`);
  expect((await workspace.locator('.demo-output').boundingBox())!.height).toBeLessThanOrEqual(760);
  await editor.scrollIntoViewIfNeeded();
  const path = info.outputPath('svelte-edited-report.png');
  await page.screenshot({ path }); await info.attach('Svelte editing and remount', { path, contentType: 'image/png' });
  for (let session = 2; session <= 4; session++) {
    await page.getByRole('button', { name: 'Reset report (discards edits)', exact: true }).click();
    await expect(lifecycle).toHaveText(`Created: ${session} · Destroyed: ${session - 1}`);
    await expect(editor.locator('table tr')).toHaveCount(3);
    await expect(cell).toHaveText('99.98%');
    await expect(editor).not.toContainText(note);
  }
  expect(errors).toEqual([]);
}
