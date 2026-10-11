import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownRejectedLinkJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.locator('#inert-source');
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  await expect(editor).toBeVisible();
  await workshop.getByRole('button', { name: 'Rejected cross-block link sample', exact: true }).click();
  const input = workshop.getByLabel('Inert source input', { exact: true });
  const source = await input.inputValue();
  expect(source).toContain('href="\\*"');
  const diagnostics = workshop.getByLabel('Inert import diagnostics');
  await expect(diagnostics).toContainText('rejected-url: Unsafe link URLs were omitted');
  await expect(diagnostics).not.toContainText('\\*');
  await expect(editor.locator('a')).toHaveCount(0);
  await expect(editor.locator('blockquote')).toHaveText('Second part.');
  await expect(editor.locator('ul')).toHaveText('Last part.');
  await expect(editor.locator('strong')).toHaveText('part');
  const json = workshop.getByLabel('Inert native document JSON', { exact: true });
  const original = JSON.parse(await json.inputValue());
  await workshop.getByRole('button', { name: 'Export Markdown and reopen', exact: true }).click();
  await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
  await expect(workshop.getByLabel('Saved inert Markdown', { exact: true })).toHaveValue(source);

  await editor.locator('[data-fountain-node="paragraph"]').first().click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('Edited ');
  await expect(editor.locator('[data-fountain-node="paragraph"]').first()).toHaveText('Edited First part.');
  const edited = JSON.parse(await json.inputValue());
  // One actual typing transaction; exact undo/redo model, not text-only checks.
  await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(original);
  await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(edited);
  await workshop.getByRole('button', { name: 'Export Markdown and reopen', exact: true }).click();
  await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(edited);
  const saved = await workshop.getByLabel('Saved inert Markdown', { exact: true }).inputValue();
  expect(saved).not.toContain('\\*');
  expect(saved).not.toContain('<a');
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('a')).toHaveCount(0);
  await expect(reader.locator('blockquote')).toHaveText('Second part.');
  await expect(reader.locator('ul')).toHaveText('Last part.');
  await expect(reader.locator('body')).toContainText('Edited First part.');
  await editor.screenshot({ path: info.outputPath('rejected-link-edited.png') });
  await diagnostics.screenshot({ path: info.outputPath('rejected-link-report.png') });
  // Capture the actual reader surface. Scrolling an iframe's body box into
  // the parent viewport can oscillate in Chromium; don't alter the timeout.
  expect(await reader.locator('li').evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
  await workshop.locator('iframe[title="Inert source reader"]').screenshot({ path: info.outputPath('rejected-link-reader.png') });
  expect(errors).toEqual([]);
}
