import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlEmptyParagraphJourney(page: Page, info: TestInfo) {
  await page.setViewportSize({ width: 1280, height: 1200 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.getByRole('region', { name: 'Inert HTML preservation workshop' });
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON');
  await workshop.getByLabel('Inert input format').selectOption('HTML');
  await workshop.getByLabel('Inert source input', { exact: true }).fill('<warning><h2>Empty paragraph retention</h2><p data-fountain-empty="block"></p><p>After the blank paragraph.</p></warning>');
  await workshop.getByRole('button', { name: 'Import inert source', exact: true }).click();
  const before = JSON.parse(await json.inputValue());
  expect(before.content[0].content[1].content ?? []).toEqual([]);
  for (const format of ['HTML', 'Markdown', 'JSON']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    expect(JSON.parse(await json.inputValue())).toEqual(before);
    await expect(workshop.getByRole('status')).toContainText(`${format}: Complete native JSON retained.`);
  }
  const blank = editor.locator('[data-fountain-inert-content] > p').first();
  await blank.click();
  await page.keyboard.type('Filled the blank paragraph.');
  await expect(blank).toHaveText('Filled the blank paragraph.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second paragraph.');
  const split = JSON.parse(await json.inputValue());
  await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await expect(blank).toHaveText('Filled the blank paragraph.Second paragraph.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(split);
  await workshop.getByRole('button', { name: 'Export HTML and reopen', exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual(split);
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  // EditorView adds an explicit trailing caret paragraph after a block wrapper;
  // it is already present in `before` and `split`, and must stay visible here.
  await expect(reader.locator('p')).toHaveText(['Filled the blank paragraph.', 'Second paragraph.', 'After the blank paragraph.', '']);
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('empty-paragraph-editor.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('h2').scrollIntoViewIfNeeded();
  await expect(reader.locator('h2')).toBeInViewport();
  await workshop.locator('iframe').screenshot({ path: info.outputPath('empty-paragraph-reader.png') });
  expect(errors).toEqual([]);
}

export async function htmlInertBlockJourney(page: Page, info: TestInfo) {
  await page.setViewportSize({ width: 1280, height: 1200 });
  const errors: string[] = []; const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('invalid.test')) requests.push(request.url()); });
  await page.addInitScript(() => {
    (globalThis as any).blockUpgrades = 0; (globalThis as any).blockPwned = 0;
    customElements.define('lab-section', class extends HTMLElement {
      connectedCallback() { (globalThis as any).blockUpgrades++; }
    });
  });
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.getByRole('region', { name: 'Inert HTML preservation workshop' });
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON');
  await workshop.getByRole('button', { name: 'Structured inert block sample', exact: true }).click();
  await expect(editor.locator('[data-fountain-inert-block]')).toHaveCount(3);
  const before = JSON.parse(await json.inputValue());
  await expect(editor.getByRole('heading', { name: 'Trial results', exact: true })).toBeVisible();
  await expect(editor.locator('li')).toHaveText(['Check measurements', 'Confirm units']);
  await expect(editor.locator('td')).toHaveText(['Sample A', '12']);
  await expect(editor.locator('img')).toHaveAttribute('alt', 'Embedded purple sample');
  await expect(workshop.getByLabel('Retained inert source data')).toContainText('<LaB-Section');
  await editor.getByRole('heading', { name: 'Trial results', exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.type(' reviewed');
  await expect(editor.getByRole('heading', { name: 'Trial results reviewed', exact: true })).toBeVisible();
  const headingEdit = JSON.parse(await json.inputValue());
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(before);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(headingEdit);
  await editor.locator('td').first().click();
  await page.keyboard.press('End'); await page.keyboard.type(' verified');
  await page.keyboard.press('Tab'); await page.keyboard.press('End'); await page.keyboard.type(' units');
  await expect(editor.locator('td')).toHaveText(['Sample A verified', '12 units']);
  await workshop.getByRole('button', { name: 'Add paragraph to lab-section (1) — empty', exact: true }).click();
  await page.keyboard.type('Plan.'); await page.keyboard.press('Enter'); await page.keyboard.type('Review.');
  const empty = editor.locator(':scope > [data-fountain-inert-block]').nth(1);
  await expect(empty.locator('p')).toHaveText(['Plan.', 'Review.']);
  const split = JSON.parse(await json.inputValue());
  await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await expect(empty.locator('p')).toHaveText(['Plan.Review.']);
  const merged = JSON.parse(await json.inputValue());
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(split);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(merged);
  // Native JSON preserves even separate adjacent text leaves. HTML/Markdown
  // canonicalize those leaves; check that one precise difference, not merely
  // textContent or a weakened whole-document assertion.
  let current = merged;
  for (const format of ['JSON', 'Markdown', 'HTML', 'JSON']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await info.attach(`inert-block-${format}-reopen`, { body: JSON.stringify({ before: current, after: JSON.parse(await json.inputValue()), markdown: await workshop.getByLabel('Saved inert Markdown').inputValue() }, null, 2), contentType: 'application/json' });
    if (format === 'Markdown') {
      const canonical = JSON.parse(JSON.stringify(current));
      canonical.content[1].content[0].content = [{ type: 'text', text: 'Plan.Review.' }];
      expect(JSON.parse(await json.inputValue())).toEqual(canonical);
      await expect(workshop.getByRole('status')).toContainText('Markdown: Round-trip mismatch');
      current = canonical;
    } else {
      expect(JSON.parse(await json.inputValue())).toEqual(current);
      await expect(workshop.getByRole('status')).toContainText(`${format}: Complete native JSON retained.`);
    }
  }
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('h2')).toHaveText('Trial results reviewed');
  await expect(reader.locator('td')).toHaveText(['Sample A verified', '12 units']);
  await expect(reader.locator('body')).toContainText('Plan.Review.');
  await expect(reader.locator('img')).toHaveAttribute('alt', 'Embedded purple sample');
  await editor.locator('img').scrollIntoViewIfNeeded();
  await expect.poll(() => editor.locator('img').evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('img').scrollIntoViewIfNeeded();
  await expect.poll(() => reader.locator('img').evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(editor.locator('lab-section,warning,[onclick]')).toHaveCount(0);
  await expect(reader.locator('lab-section,warning,[onclick]')).toHaveCount(0);
  expect(await page.evaluate(() => [(globalThis as any).blockUpgrades, (globalThis as any).blockPwned])).toEqual([0, 0]);
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('inert-block-editor.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('h2').scrollIntoViewIfNeeded();
  await expect(reader.locator('h2')).toBeInViewport();
  await workshop.locator('iframe').screenshot({ path: info.outputPath('inert-block-reader-top.png') });
  await reader.locator('table').scrollIntoViewIfNeeded();
  await expect(reader.locator('td').first()).toBeInViewport();
  await workshop.locator('iframe').screenshot({ path: info.outputPath('inert-block-reader-table.png') });
  await reader.getByText('Plan.Review.', { exact: true }).scrollIntoViewIfNeeded();
  await expect(reader.getByText('Plan.Review.', { exact: true })).toBeInViewport();
  await workshop.locator('iframe').screenshot({ path: info.outputPath('inert-block-reader-bottom.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(editor.locator('p').first()).toContainText('multiline research summary');
  await editor.screenshot({ path: info.outputPath('inert-block-mobile-editor.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('h2').scrollIntoViewIfNeeded();
  await expect(reader.locator('h2')).toBeInViewport();
  await workshop.locator('iframe').screenshot({ path: info.outputPath('inert-block-mobile-reader-top.png') });
  await reader.locator('table').scrollIntoViewIfNeeded();
  await expect(reader.locator('td').first()).toBeInViewport();
  await workshop.locator('iframe').screenshot({ path: info.outputPath('inert-block-mobile-reader-table.png') });
  await reader.getByText('Plan.Review.', { exact: true }).scrollIntoViewIfNeeded();
  await expect(reader.getByText('Plan.Review.', { exact: true })).toBeInViewport();
  await workshop.locator('iframe').screenshot({ path: info.outputPath('inert-block-mobile-reader-bottom.png') });
  expect(errors).toEqual([]); expect(requests).toEqual([]);
}
