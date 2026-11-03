import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlInertAnchorJourney(page: Page, info: TestInfo) {
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('invalid.test')) requests.push(request.url()); });
  await page.addInitScript(() => { (globalThis as any).anchorPwned = 0; });
  await page.goto('/demos/node-markdown.html#inert-source');
  await page.getByLabel('Preserve unsupported anchors (starts a new sample)').check();
  const workshop = page.locator('#inert-source');
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON', { exact: true });
  await expect(editor.locator('[data-fountain-inert-anchor]')).toHaveCount(2);
  await expect(editor.locator('a')).toHaveCount(1);
  const original = JSON.parse(await json.inputValue());
  const body = editor.locator('[data-fountain-inert-anchor]').first().locator('[data-fountain-inert-content]');
  await body.scrollIntoViewIfNeeded();
  const point = await body.evaluate(node => {
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, 2); range.setEnd(text, 3);
    const rect = range.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.keyboard.type('revised ');
  await expect(body).toContainText('revised ');
  const edited = JSON.parse(await json.inputValue());
  await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(original);
  await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(edited);
  for (const format of ['JSON', 'Markdown', 'HTML']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
    expect(JSON.parse(await json.inputValue())).toEqual(edited);
  }
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('[data-fountain-inert-anchor]')).toHaveCount(2);
  await expect(reader.locator('[onclick],a[href="\\*"],script')).toHaveCount(0);
  await workshop.getByText('Reconstruct original HTML as source', { exact: true }).click();
  await workshop.getByRole('button', { name: 'Inspect reconstructed HTML source', exact: true }).click();
  const source = workshop.getByLabel('Reconstructed HTML source', { exact: true });
  await expect(source).toHaveValue(/href="\\\*"/);
  await expect(source).toHaveValue(/onclick="globalThis.anchorPwned=1"/);
  await expect(source).toHaveValue(/revised /);
  expect(await page.evaluate(() => (globalThis as any).anchorPwned)).toBe(0);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
  await editor.screenshot({ path: info.outputPath('inert-anchor-editor.png') });
  await workshop.locator('iframe[title="Inert source reader"]').screenshot({ path: info.outputPath('inert-anchor-reader.png'), timeout: 10_000 });
}
