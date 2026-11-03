import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlEnvelopeJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.locator('#inert-source');
  await workshop.getByLabel('Retain HTML source doctype on next import').check();
  await workshop.getByRole('button', { name: 'Document declaration sample', exact: true }).click();
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON', { exact: true });
  const original = JSON.parse(await json.inputValue());
  expect(original.attrs.htmlSourceEnvelope.mode).toBe('quirks');
  const paragraph = editor.locator('p').first();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.type(' Reviewed.');
  await expect(paragraph).toHaveText('Original envelope evidence. Reviewed.');
  const edited = JSON.parse(await json.inputValue());
  await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(original);
  await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(edited);
  await expect(workshop.getByRole('button', { name: 'Export Markdown and reopen', exact: true })).toBeDisabled();
  for (const format of ['JSON', 'HTML']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
    expect(JSON.parse(await json.inputValue())).toEqual(edited);
  }
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('body')).toContainText('Original envelope evidence. Reviewed.');
  expect(await reader.locator('body').evaluate(node => node.ownerDocument.compatMode)).toBe('CSS1Compat');
  await workshop.getByText('Reconstruct original HTML as source', { exact: true }).click();
  await workshop.getByRole('button', { name: 'Inspect reconstructed HTML source', exact: true }).click();
  const output = await workshop.getByLabel('Reconstructed HTML source', { exact: true }).inputValue();
  expect(output.startsWith(original.attrs.htmlSourceEnvelope.doctype)).toBe(true);
  expect(await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').compatMode, output)).toBe('BackCompat');
  expect(errors).toEqual([]);
  await editor.screenshot({ path: info.outputPath('envelope-editor.png'), timeout: 10000 });
  await workshop.locator('iframe[title="Inert source reader"]').screenshot({ path: info.outputPath('envelope-reader.png'), timeout: 10000 });
}
