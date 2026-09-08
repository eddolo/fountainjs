import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Schema, StarterKit, MarkdownImporter } from 'fountainjs-editor';
import { exportDOCX } from 'fountainjs-editor/docx';

export async function conversionLabJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  let externalRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://lab-private.invalid/**', route => { externalRequests++; return route.abort(); });
  await page.goto('/demos.html');
  await page.getByRole('link', { name: 'Open the conversion lab' }).click();
  await expect(page.getByRole('heading', { name: 'Try your own documents.' })).toBeVisible();
  const schema = new Schema(StarterKit.schema);
  const imageSource = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 160;
    const context = canvas.getContext('2d')!; context.fillStyle = '#255a66'; context.fillRect(0, 0, 320, 160);
    context.fillStyle = '#fff'; context.font = '22px sans-serif'; context.fillText('Embedded image proof', 30, 86);
    return canvas.toDataURL('image/png');
  });
  const wordDoc = MarkdownImporter.parse('# Word original\n\nA retained paragraph.', schema);
  const word = exportDOCX(schema.node('doc', {}, [...wordDoc.content, schema.node('paragraph', {}, [schema.node('inline_image', { src: imageSource, alt: 'Embedded image proof' })])]));
  const source = '# Private source\n\nOriginal **paragraph**.\n';
  await page.getByLabel('Choose documents').setInputFiles([
    { name: 'private.md', mimeType: 'text/markdown', buffer: Buffer.from(source) },
    { name: 'article.html', mimeType: 'text/html', buffer: Buffer.from('<article><p>Imported HTML</p><img src="https://lab-private.invalid/tracker.png" alt="Remote image" /></article><script>window.labInjected=true</script>') },
    { name: 'word.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(word.bytes) },
    { name: 'unsupported.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not supported') },
    { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') },
  ]);
  await expect(page.getByRole('status').filter({ hasText: '3 imported; 2 could not' })).toBeVisible();
  const files = page.getByRole('navigation', { name: 'Imported files' });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: private.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type(' Added in the lab.');
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('json');
  await workspace.getByRole('button', { name: 'Check round trip' }).click();
  await expect(workspace.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality');
  await expect(workspace.getByRole('textbox', { name: 'Reopened export preview' })).toContainText('Added in the lab.');
  await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type(' Another edit.');
  await expect(workspace.getByLabel('Round-trip result')).toContainText('Outdated check');
  await files.getByRole('button', { name: 'article.html', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conversion workspace: article.html', exact: true })).toContainText('unmapped-block-wrapper');
  expect(await page.evaluate(() => (window as any).labInjected)).toBeUndefined();
  expect(externalRequests).toBe(0);
  await files.getByRole('button', { name: 'word.docx', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Imported document editor' })).toContainText('Word original');
  const wordWorkspace = page.getByRole('region', { name: 'Conversion workspace: word.docx', exact: true });
  const recoveredImage = wordWorkspace.locator('.lab-assets img');
  await expect(recoveredImage).toBeVisible();
  await expect.poll(() => recoveredImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320);
  const imageDownload = page.waitForEvent('download');
  await wordWorkspace.getByRole('button', { name: 'Download image 1' }).click();
  expect(await readFile((await (await imageDownload).path())!)).toEqual(Buffer.from(imageSource.split(',')[1], 'base64'));
  await wordWorkspace.locator('.lab-assets').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('recovered-image.png') });
  await files.getByRole('button', { name: 'unsupported.pdf — not imported', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Not supported');
  await files.getByRole('button', { name: 'broken.json — not imported', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await files.getByRole('button', { name: 'private.md', exact: true }).click();
  await expect(editor).toContainText('Another edit.');
  await workspace.getByLabel('What went wrong?').fill('Private reproduction note.');
  const reportDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download diagnostic report' }).click();
  const report = JSON.parse(await readFile((await (await reportDownload).path())!, 'utf8'));
  expect(report.editedDocument).toBeUndefined(); expect(report.fileName).toBeUndefined(); expect(report.note).toBeUndefined();
  expect(report.roundTrip.stale).toBe(true);
  const originalDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download untouched original' }).click();
  expect(await readFile((await (await originalDownload).path())!, 'utf8')).toBe(source);
  const convertedDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const converted = await readFile((await (await convertedDownload).path())!);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'reopened.json', mimeType: 'application/json', buffer: converted });
  await expect(page.getByRole('textbox', { name: 'Imported document editor' })).toContainText('Another edit.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove selected file', exact: true }).click();
  await expect(files.getByRole('button', { name: 'reopened.json', exact: true })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Try your own documents.' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('conversion-lab.png'), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const sourceBox = await workspace.getByRole('heading', { name: '1. Original source' }).boundingBox();
  const editorBox = await workspace.getByRole('heading', { name: '2. Imported document — editable' }).boundingBox();
  expect(sourceBox!.y).toBeLessThan(editorBox!.y);
  expect(Math.abs(sourceBox!.x - editorBox!.x)).toBeLessThan(2);
  await workspace.getByRole('heading', { name: '1. Original source' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('source-above-editor.png') });
  expect(errors).toEqual([]);
}
