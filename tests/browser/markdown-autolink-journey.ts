import { expect, type Page, type TestInfo } from '@playwright/test';
import { withDOCXExportDefaults } from '../fixtures/docx-page-defaults';

export async function markdownAutolinkJourney(page: Page, info: TestInfo): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  const source = page.getByLabel('Markdown input', { exact: true });
  const original = '# Contact directory\n\nSupport: support@example.com\n\nWebsite: https://example.com\n\n[Help centre](https://example.com/help)';
  await source.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(original);
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const rendered = output.locator('pre');
  await expect(rendered).toContainText('href="mailto:support@example.com"');
  const option = page.getByRole('checkbox', { name: 'Turn bare URLs and email addresses into links' });
  await expect(option).toBeChecked();
  await option.focus();
  await page.keyboard.press('Space');
  await expect(option).not.toBeChecked();
  await expect(rendered).toContainText('<p>Support: support@example.com</p>');
  await expect(rendered).toContainText('<p>Website: https://example.com</p>');
  await expect(rendered).toContainText('<a href="https://example.com/help" target="_blank" rel="noopener noreferrer nofollow">Help centre</a>');
  await expect(source).toHaveValue(original);
  await output.getByRole('button', { name: 'json', exact: true }).click();
  const beforeExport = JSON.parse(await rendered.innerText());
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: info.outputPath('literal-addresses.png'), fullPage: true });

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download as Word DOCX', exact: true }).click();
  const download = await downloading;
  const file = info.outputPath('contact-directory.docx');
  await download.saveAs(file);
  await page.getByRole('button', { name: 'Word DOCX', exact: true }).click();
  await page.getByLabel('Import Word DOCX', { exact: true }).setInputFiles(file);
  // A file chooser finishing is not an import finishing. Wait for the real
  // validated document rather than parsing an empty pane or suppressing errors.
  await expect(page.locator('.headless-status[data-import-state="ready"]'))
    .toContainText(`Valid document · ${beforeExport.content.length} top-level blocks`);
  await output.getByRole('button', { name: 'json', exact: true }).click();
  await expect(output.getByRole('button', { name: 'json', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(rendered).toContainText('"type": "doc"');
  // Word's published font/paragraph/page defaults now become explicit. Compare
  // every field against independent expectations, never strip the new styles.
  await expect.poll(async () => JSON.parse(await rendered.innerText())).toEqual(withDOCXExportDefaults(beforeExport));
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(rendered).not.toContainText('href="mailto:support@example.com"');
  await expect(rendered).not.toContainText('href="https://example.com"');
  await expect(rendered).toContainText('href="https://example.com/help"');
  await page.locator('.headless-surface').screenshot({ path: info.outputPath('docx-import-ready-1280.png') });
  await output.screenshot({ path: info.outputPath('docx-import-html-1280.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.headless-surface').screenshot({ path: info.outputPath('docx-import-ready-390.png') });
  await output.screenshot({ path: info.outputPath('docx-import-html-390.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('.headless-input-tabs').getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(source).toHaveValue(original);
  await expect(option).not.toBeChecked();
  await option.check();
  await expect(rendered).toContainText('href="mailto:support@example.com"');
  await expect(rendered).toContainText('href="https://example.com"');
  await expect(source).toHaveValue(original);
  await page.setViewportSize({ width: 390, height: 844 });
  await option.uncheck();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: info.outputPath('literal-addresses-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
}
