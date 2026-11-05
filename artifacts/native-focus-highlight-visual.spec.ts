import { test, expect } from '@playwright/test';
test('makes table sizing, complete deletion, insertion gaps, and highlight colours explicit in the public demo', async ({ page }, info) => {
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const tables = editor.locator('table');
  await expect(tables).toHaveCount(1);

  await page.getByLabel('Table rows').fill('3');
  await page.getByLabel('Table columns').fill('4');
  await page.getByRole('button', { name: '+ Table', exact: true }).click();
  await expect(tables).toHaveCount(2);
  const inserted = tables.first();
  await expect(inserted.locator('tr')).toHaveCount(3);
  expect(await inserted.locator('tr').first().locator('th, td').count()).toBe(4);

  await page.getByRole('button', { name: 'Table options', exact: true }).click();
  await page.getByRole('button', { name: 'Add row below', exact: true }).click();
  await expect(inserted.locator('tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Delete column', exact: true }).click();
  expect(await inserted.locator('tr').first().locator('th, td').count()).toBe(3);
  await page.getByRole('button', { name: 'Delete entire table', exact: true }).click();
  await expect(tables).toHaveCount(1);

  const gap = page.getByRole('button', { name: 'Place cursor after title' });
  await gap.click();
  await expect(gap).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Insertion point ready')).toContainText('not a page break');
  await page.getByRole('button', { name: '+ Task', exact: true }).click();
  await expect(editor.locator(':scope > [data-fountain-node="task_list"]')).toHaveAttribute('data-fountain-path', '1');

  const titleText = editor.locator(':scope > h1 [data-fountain-text-path]').first();
  await titleText.evaluate((element) => {
    const text = element.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected title text.');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 6);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await editor.screenshot({ path: info.outputPath('title-selected.png') });
  await page.getByLabel('Highlight colour').fill('#ff00aa');
  await page.getByRole('button', { name: 'Apply highlight', exact: true }).click();
  await expect(editor.locator('h1 mark')).toHaveCSS('background-color', 'rgb(255, 0, 170)');
  await editor.screenshot({ path: info.outputPath('title-highlighted.png') });
  await page.getByRole('button', { name: 'Remove highlight', exact: true }).click();
  await expect(editor.locator('h1 mark')).toHaveCount(0);
  await editor.screenshot({ path: info.outputPath('title-cleared.png') });
});
