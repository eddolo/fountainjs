import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlEmphasisDepthJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1360, height: 1100 });
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.getByRole('region', { name: 'Inert HTML preservation workshop' });
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON', { exact: true });
  await workshop.getByLabel('Inert input format').selectOption('HTML');
  await workshop.getByLabel('Inert source input', { exact: true }).fill(
    '<h2>Emphasis review</h2><p><em>Outer <em>nested</em> tail.</em></p>'
    + '<p><strong>Bold <strong>nested bold</strong> tail.</strong></p>'
    + '<em><p><foo><span style="font-style:italic">Owned </span><em>carrier</em> tail.</foo></p></em>'
    + '<em><blockquote><p>Quoted <em>nested quote</em> tail.</p></blockquote></em>'
    + '<table><tr><td><strong>Cell <strong>nested cell</strong></strong></td></tr></table><p>Plain sibling.</p>',
  );
  await workshop.getByRole('button', { name: 'Import inert source', exact: true }).click();
  const verifyEditor = async (edited: boolean, carrierEdited = false) => {
    const nested = editor.locator('p').first().locator('em em');
    await expect(nested).toHaveText(edited ? 'reviewed' : 'nested');
    await expect(nested).toHaveCSS('font-style', 'italic');
    await expect(editor.locator('p').nth(1).locator('strong strong')).toHaveText('nested bold');
    await expect(editor.locator('blockquote em em')).toHaveText('nested quote');
    await expect(editor.locator('td strong strong')).toHaveText('nested cell');
    await expect(editor.locator('[data-fountain-inert-content] em')).toHaveText(carrierEdited ? 'checked' : 'carrier');
    // The browser's relative `bolder` rule gives nested strong a second level.
    await expect(editor.locator('td strong strong')).toHaveCSS('font-weight', '900');
    await expect(editor.getByText('Plain sibling.', { exact: true })).toBeVisible();
  };
  await verifyEditor(false);
  const before = JSON.parse(await json.inputValue());
  const nested = editor.locator('p').first().locator('em em');
  await nested.dblclick();
  const selection = await page.evaluate(() => window.getSelection()?.toString());
  expect(['nested', 'nested ']).toContain(selection);
  if (selection === 'nested ') await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.type('reviewed');
  await verifyEditor(true);
  const firstEdited = JSON.parse(await json.inputValue());
  await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(before);
  await verifyEditor(false);
  await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(firstEdited);
  await editor.locator('[data-fountain-inert-content] em').dblclick();
  const carrierSelection = await page.evaluate(() => window.getSelection()?.toString());
  expect(['carrier', 'carrier ']).toContain(carrierSelection);
  if (carrierSelection === 'carrier ') await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.type('checked');
  await verifyEditor(true, true);
  const edited = JSON.parse(await json.inputValue());
  await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(firstEdited);
  await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(edited);
  for (const format of ['JSON', 'HTML']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
    expect(JSON.parse(await json.inputValue())).toEqual(edited);
    await verifyEditor(true, true);
  }
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('p').first().locator('em em')).toHaveText('reviewed');
  await expect(reader.locator('blockquote em em')).toHaveText('nested quote');
  await expect(reader.locator('td strong strong')).toHaveText('nested cell');
  await expect(reader.locator('[data-fountain-inert-content] em')).toHaveText('checked');
  await editor.screenshot({ path: info.outputPath('emphasis-editor.png') });
  await workshop.locator('iframe[title="Inert source reader"]').screenshot({ path: info.outputPath('emphasis-reader.png') });
  const ending = reader.getByText('Plain sibling.', { exact: true });
  await ending.scrollIntoViewIfNeeded();
  await expect(ending).toBeInViewport();
  await workshop.locator('iframe[title="Inert source reader"]').screenshot({ path: info.outputPath('emphasis-reader-end.png') });
  expect(errors).toEqual([]);
}
