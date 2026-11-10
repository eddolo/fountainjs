import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, type Page, type Request, type TestInfo } from '@playwright/test';

export async function runMarkdownSourceReviewJourney(page: Page, info: TestInfo) {
  const source = [
    '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">', '', '# Research draft', '',
    '<script>window.sourceRan = true</script>', '',
    '<javascript:alert(1)> https://example.test <https://example.org>', '',
    '![Remote image](https://example.invalid/review-probe.png)', '',
    'Draft body.', '', '<div title="unfinished',
  ].join('\r\n');
  await page.goto('/conversion-lab.html');
  const files = page.getByLabel('Choose documents');
  const upload = (name: string) => files.setInputFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const mode = page.getByRole('checkbox', { name: /^Use CommonMark source review for Markdown/ });
  await mode.check();
  await upload('review.md');
  const review = page.getByRole('region', { name: 'Conversion workspace: review.md' });
  const editor = review.getByRole('textbox', { name: 'Imported document editor' });
  await expect(review).toContainText('This file uses CommonMark source review');
  await expect(editor.locator('[data-fountain-inert-raw-text]')).toContainText('window.sourceRan = true');
  await expect(editor.locator('[data-fountain-source-eof]')).toContainText('<div title="unfinished');
  await expect(editor.locator('[data-fountain-inert-anchor]')).toHaveCount(1);
  await expect(editor.getByRole('link')).toHaveCount(1);

  await mode.uncheck();
  await upload('literal.md');
  const literal = page.getByRole('region', { name: 'Conversion workspace: literal.md' });
  await expect(literal).toContainText('literal HTML inside Markdown');
  await expect(literal.getByRole('textbox', { name: 'Imported document editor' })).toContainText('<script>');
  await page.getByRole('navigation', { name: 'Imported files' }).getByRole('button', { name: 'review.md', exact: true }).click();
  await expect(review).toContainText('This file uses CommonMark source review');
  await editor.getByText('Draft body.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Reviewed in Fountain.');
  await expect(editor).toContainText('Draft body. Reviewed in Fountain.');
  await editor.screenshot({ path: info.outputPath('source-review-editor.png') });

  async function download(format: 'markdown' | 'html' | 'json', extension: 'md' | 'html' | 'json') {
    await review.getByRole('combobox', { name: 'Export format' }).selectOption(format);
    const pending = page.waitForEvent('download');
    await review.getByRole('button', { name: 'Download export', exact: true }).click();
    const path = info.outputPath('source-review.' + extension);
    await (await pending).saveAs(path);
    await expect(review.getByRole('textbox', { name: 'Reopened export preview' })).toContainText('Draft body. Reviewed in Fountain.');
    return path;
  }
  expect(await readFile(await download('markdown', 'md'), 'utf8')).toBe(
    source.replace('Draft body.', 'Draft body. Reviewed in Fountain.'),
  );
  const jsonPath = await download('json', 'json');
  const savedModel = JSON.parse(await readFile(jsonPath, 'utf8'));
  const readerPath = await download('html', 'html');
  await expect(review.getByRole('checkbox', { name: 'Omit Markdown’s editor-only caret paragraphs in HTML' })).toBeChecked();
  const reader = await page.context().newPage();
  const remoteRequests: Request[] = [];
  reader.on('request', request => { if (request.url().startsWith('https:')) remoteRequests.push(request); });
  try {
    await reader.goto(pathToFileURL(readerPath).href);
    await expect(reader.locator('script')).toHaveCount(0);
    await expect(reader.locator('[data-fountain-inert-raw-text]')).toContainText('window.sourceRan = true');
    await expect(reader.locator('[data-fountain-source-eof]')).toContainText('<div title="unfinished');
    await expect(reader.locator('body')).toHaveAttribute('data-fountain-html-source-envelope', /Transitional/);
    await expect(reader.locator('body')).toContainText('Draft body. Reviewed in Fountain.');
    await expect(reader.locator('a')).toHaveCount(1);
    await expect(reader.locator('a')).toHaveAttribute('href', 'https://example.org');
    await expect(reader.locator('img')).toHaveAttribute('src', 'https://example.invalid/review-probe.png');
    expect(await reader.evaluate(() => Reflect.has(window, 'sourceRan'))).toBe(false);
    // Chromium emits request events for resources it blocks before network I/O.
    for (const request of remoteRequests) expect(request.failure()?.errorText).toMatch(/csp/i);
    await reader.screenshot({ path: info.outputPath('source-review-reader.png'), fullPage: true });
  } finally { await reader.close(); }

  await mode.check();
  await files.setInputFiles([jsonPath, readerPath]);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: source-review.json' });
  await expect(reopened).toContainText('This file uses CommonMark source review');
  await expect(reopened.getByRole('textbox', { name: 'Imported document editor' })).toContainText('Draft body. Reviewed in Fountain.');
  const pending = page.waitForEvent('download');
  await reopened.getByRole('button', { name: 'Download export', exact: true }).click();
  const reopenedPath = info.outputPath('reopened-review.json');
  await (await pending).saveAs(reopenedPath);
  expect(JSON.parse(await readFile(reopenedPath, 'utf8'))).toEqual(savedModel);

  await page.getByRole('navigation', { name: 'Imported files' }).getByRole('button', { name: 'source-review.html', exact: true }).click();
  const html = page.getByRole('region', { name: 'Conversion workspace: source-review.html' });
  const htmlEditor = html.getByRole('textbox', { name: 'Imported document editor' });
  await expect(htmlEditor.locator('[data-fountain-inert-raw-text]')).toContainText('window.sourceRan = true');
  await expect(htmlEditor.locator('[data-fountain-inert-anchor]')).toHaveCount(1);
  await expect(htmlEditor.locator('[data-fountain-source-eof]')).toContainText('<div title="unfinished');
  expect(await page.evaluate(() => Reflect.has(window, 'sourceRan'))).toBe(false);
  await htmlEditor.screenshot({ path: info.outputPath('source-review-reopened-html.png') });
}
