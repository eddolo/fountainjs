import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlSourceEmptyJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.locator('#inert-source');
  await workshop.getByLabel('Retain HTML source doctype on next import').check();
  await workshop.getByRole('button', { name: 'Empty source document sample', exact: true }).click();
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON', { exact: true });
  const initial = JSON.parse(await json.inputValue());
  expect(initial.content).toHaveLength(1); expect(initial.content[0].type).toBe('html_source_empty_body');
  await workshop.getByText('Reconstruct original HTML as source', { exact: true }).click();
  const inspect = workshop.getByRole('button', { name: 'Inspect reconstructed HTML source', exact: true });
  const source = workshop.getByLabel('Reconstructed HTML source', { exact: true });
  await inspect.click(); await expect(source).not.toHaveValue(/<p[ >]/);
  const blocks = editor.locator(':scope > p');
  await expect(blocks).toHaveCount(1); await blocks.first().click();
  await page.keyboard.type('Evidence'); await expect(blocks.first()).toHaveText('Evidence');
  await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(initial);
  await inspect.click(); await expect(source).not.toHaveValue(/<p[ >]/);
  await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  await blocks.first().click(); await page.keyboard.press('End');
  await page.keyboard.press('Enter'); await page.keyboard.type('Second line');
  await expect(blocks).toHaveCount(2); await expect(blocks.last()).toHaveText('Second line');
  const beforeMerge = JSON.parse(await json.inputValue());
  await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await expect(blocks).toHaveCount(1); await expect(blocks.first()).toHaveText('EvidenceSecond line');
  await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(beforeMerge);
  for (const format of ['JSON', 'HTML']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
    expect(JSON.parse(await json.inputValue())).toEqual(beforeMerge);
  }
  const positions = await blocks.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
  expect(positions[1]).toBeGreaterThan(positions[0] + 10);
  await inspect.click(); await expect(source).toHaveValue(/<p>Evidence<\/p>\s*<p>Second line<\/p>/);
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('p')).toHaveCount(2);
  expect(errors).toEqual([]);
  await editor.screenshot({ path: info.outputPath('source-empty-edited.png'), timeout: 10000 });
  await workshop.locator('iframe[title="Inert source reader"]').screenshot({ path: info.outputPath('source-empty-reader.png'), timeout: 10000 });
}
