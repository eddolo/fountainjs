import { expect, test, type Page } from '@playwright/test';

async function openStarter(page: Page, port: number) {
  const started = performance.now();
  await page.goto(`http://127.0.0.1:${port}/`);
  const editor = page.getByRole('textbox', { name: 'Starter editor', exact: true });
  await expect(editor).toBeEditable();
  return { editor, loadMs: Math.round(performance.now() - started) };
}

test('uses a custom block in the installed plain DOM starter', async ({ page }, info) => {
  const { editor, loadMs } = await openStarter(page, 4201);
  await editor.getByText('Edit this paragraph, then add a callout.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' My note');
  await expect(editor).toContainText('My note');
  const started = performance.now();
  await page.getByRole('button', { name: 'Insert callout', exact: true }).click();
  const callout = editor.locator('aside[data-callout]');
  await expect(callout).toHaveText('Write your callout here.');
  const insertMs = Math.round(performance.now() - started);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(callout).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await callout.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Evidence.');
  await expect(callout).toHaveText('Write your callout here. Evidence.');
  await page.getByText('Document JSON', { exact: true }).click();
  const json = page.locator('details pre');
  await expect(json).toContainText('Write your callout here. Evidence.');
  expect(JSON.parse(await json.innerText()).content[1]).toMatchObject({ type: 'callout' });
  await info.attach('local-run-times', { body: JSON.stringify({ loadMs, insertMs }), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('plain-dom-starter.png'), fullPage: true });
});

test('edits and formats a document in the installed React starter', async ({ page }, info) => {
  const { editor, loadMs } = await openStarter(page, 4202);
  await editor.getByText('Edit this paragraph and try the toolbar.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Review');
  for (let index = 0; index < 6; index += 1) await page.keyboard.press('Shift+ArrowLeft');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Review');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('strong')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Review');
  await page.getByText('Document JSON', { exact: true }).click();
  const json = page.locator('details pre');
  await expect(json).toContainText('"type": "strong"');
  expect(JSON.parse(await json.innerText()).content[0].content).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: 'Review', marks: [expect.objectContaining({ type: 'strong' })] }),
  ]));
  await info.attach('local-run-times', { body: JSON.stringify({ loadMs }), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('react-starter.png'), fullPage: true });
});
