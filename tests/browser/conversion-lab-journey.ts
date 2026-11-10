import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Schema, StarterKit, MarkdownImporter } from 'fountainjs-editor';
import { exportDOCX } from 'fountainjs-editor/docx';

export async function conversionScientificPreviewJourney(page: Page, info: TestInfo) {
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles('tests/fixtures/native-docx/cooling-report.docx');
  const workspace = page.getByRole('region', { name: 'Conversion workspace: cooling-report.docx' });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  await expect(editor.locator('img')).toHaveCount(3);
  await expect(editor.locator('[data-fountain-math]')).toHaveCount(2);
  const firstFigure = editor.locator('figure').filter({ hasText: 'Probe positions in the two vessels' });
  const firstImage = firstFigure.locator('img');
  const firstCaption = firstFigure.locator('figcaption');
  const resize = firstFigure.getByRole('slider', { name: 'Resize image from right' });
  const widthOf = (locator: typeof firstImage) => locator.evaluate(element => element.getBoundingClientRect().width);
  const imageWidth = await widthOf(firstImage);
  const captionWidth = await widthOf(firstCaption);
  await resize.focus();
  await resize.press('ArrowLeft');
  await expect.poll(() => widthOf(firstImage)).toBeCloseTo(Math.round(imageWidth) - 10, 0);
  expect(await widthOf(firstCaption)).toBeCloseTo(captionWidth, 0);
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => widthOf(firstImage)).toBeCloseTo(imageWidth, 0);
  const ending = editor.getByText('END OF REPORT', { exact: true });
  await ending.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Checked in the lab.');
  await expect(editor).toContainText('END OF REPORT Checked in the lab.');

  const controls = workspace.getByRole('region', { name: 'Draft pagination' });
  await controls.getByRole('button', { name: 'Build page preview' }).click();
  const preview = controls.getByRole('region', { name: 'Paged draft preview' });
  await expect(preview).toBeVisible();
  const sheets = preview.locator('.fountain-page-preview__sheet');
  const body = sheets.locator('.fountain-page-preview__body');
  const header = sheets.locator('.fountain-page-preview__header');
  const footer = sheets.locator('[data-fountain-page-template^="footer:"]');
  const notes = body.locator('.fountain-page-preview__footnotes');
  await expect(body.locator('img')).toHaveCount(2);
  await expect(body.locator('[data-fountain-math]')).toHaveCount(2);
  const math = body.locator('[data-fountain-math="block"]');
  for (const equation of await math.all()) {
    await expect(equation).toHaveCSS('padding-top', '0px');
    await expect(equation.locator('.katex-display')).toHaveCSS('margin-top', '0px');
    const spacingAfter = await equation.evaluate(element => parseFloat(getComputedStyle(element).marginBlockEnd));
    expect(Math.abs(spacingAfter - 28 / 3)).toBeLessThan(0.02);
  }
  const table = body.locator('table');
  await expect(table).toHaveCount(1);
  await expect(table).toHaveCSS('margin-top', '0px');
  await expect(table).toHaveCSS('margin-bottom', '0px');
  await expect(notes).toHaveCount(1);
  await expect(notes).toContainText('they are not measured experimental data.');
  await expect(sheets.last()).toContainText('END OF REPORT Checked in the lab.');
  await expect(sheets).toHaveCount(2);
  expect(await header.locator('img').count()).toBeGreaterThan(0);
  await expect(footer.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const firstSheet = (await sheets.first().boundingBox())!;
  const firstHeader = (await header.first().boundingBox())!;
  const firstFooter = (await footer.first().boundingBox())!;
  // This fixture declares both edge distances at 36 pt (48 CSS px).
  expect(firstHeader.y - firstSheet.y).toBeCloseTo(48, 0);
  expect(firstSheet.y + firstSheet.height - firstFooter.y - firstFooter.height).toBeCloseTo(48, 0);
  const caption = body.locator('figcaption').filter({ hasText: 'Probe positions in the two vessels' });
  const positions = await caption.evaluate(element => {
    const figure = element.closest('figure')!;
    const body = element.closest('.fountain-page-preview__body')!;
    return { caption: element.getBoundingClientRect().left, image: figure.querySelector('img')!.getBoundingClientRect().left, body: body.getBoundingClientRect().left };
  });
  expect(positions.caption).toBeCloseTo(positions.body, 0);
  expect(positions.image - positions.body).toBeGreaterThan(25);
  await expect.poll(() => sheets.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.setViewportSize({ width: 1280, height: 1460 });
  for (const [index, sheet] of (await sheets.all()).entries()) {
    await sheet.screenshot({ path: info.outputPath(`cooling-report-sheet-${index + 1}.png`) });
  }

  await page.emulateMedia({ media: 'print' });
  await expect(editor).toBeHidden();
  const pdf = info.project.name === 'chromium'
    ? await page.pdf({ path: info.outputPath('cooling-report-print.pdf'), preferCSSPageSize: true, printBackground: true })
    : undefined;
  await page.emulateMedia({ media: 'screen' });
  return { pdf, sheetCount: await sheets.count() };
}

export async function conversionPagePreviewJourney(page: Page, info: TestInfo) {
  const schema = new Schema(StarterKit.schema);
  const paragraph = (lines: string[], keepWithNext = false) => schema.node('paragraph', {
    layout: { unit: 'pt', lineHeight: 18, lineHeightUnit: 'pt', lineHeightRule: 'exact', keepWithNext },
  }, lines.flatMap((line, index) => index ? [schema.node('hard_break'), schema.text(line)] : [schema.text(line)]));
  const fixture = schema.node('doc', {
    pageSettings: { unit: 'pt', width: 261, height: 153, marginTop: 7.5, marginRight: 7.5, marginBottom: 7.5, marginLeft: 7.5 },
  }, [paragraph(['Lead first', 'Lead second', 'Lead third']), paragraph(['Section heading'], true),
    paragraph(['Caption first', 'Caption second'], true), paragraph(['Body first', 'Body second'])]);
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles([
    { name: 'pagination.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(exportDOCX(fixture).bytes) },
    { name: 'other.md', mimeType: 'text/markdown', buffer: Buffer.from('# Separate draft\n\nThis text belongs to another file.\n\n| Name |\n| --- |\n| Other file |') },
  ]);
  const files = page.getByRole('navigation', { name: 'Imported files' });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: pagination.docx' });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const controls = workspace.getByRole('region', { name: 'Draft pagination' });
  const build = controls.getByRole('button', { name: 'Build page preview' });
  const print = controls.getByRole('button', { name: 'Print / Save PDF' });
  const sheets = controls.locator('.fountain-page-preview__sheet');
  await expect(print).toBeDisabled();
  await build.click();
  await expect(controls).toContainText('2 pages. Using the document’s paper size and margins.');
  await expect(sheets).toHaveCount(2);
  await expect(sheets.first()).toContainText('Lead third');
  await expect(sheets.first()).not.toContainText('Section heading');
  await expect(sheets.nth(1)).toContainText(/Section heading.*Caption first.*Body second/su);

  await editor.locator('p').filter({ hasText: 'Body second' }).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Added in the lab.');
  await expect(editor).toContainText('Body second Added in the lab.');
  await expect(controls).toContainText('The draft changed. Build the page preview again.');
  await expect(print).toBeDisabled();
  await expect(sheets).toHaveCount(0);
  await build.click();
  await expect(sheets.nth(1)).toContainText('Body second Added in the lab.');
  await expect(print).toBeEnabled();
  await controls.screenshot({ path: info.outputPath('conversion-page-preview.png') });

  await page.evaluate(() => { window.print = () => { document.body.dataset.labPrintCalled = 'true'; }; });
  await print.click();
  await expect(page.locator('body')).toHaveAttribute('data-lab-print-called', 'true');
  await page.emulateMedia({ media: 'print' });
  await expect(editor).toBeHidden();
  await expect(sheets.first()).toBeVisible();
  const pdf = info.project.name === 'chromium'
    ? await page.pdf({ path: info.outputPath('conversion-page-preview.pdf'), preferCSSPageSize: true })
    : undefined;
  await page.emulateMedia({ media: 'screen' });

  await files.getByRole('button', { name: 'other.md' }).click();
  const other = page.getByRole('region', { name: 'Conversion workspace: other.md' }).getByRole('region', { name: 'Draft pagination' });
  await other.getByRole('button', { name: 'Build page preview' }).click();
  await expect(other).toContainText('1 page. Using Letter with 1-inch margins.');
  await expect(other.locator('.fountain-page-preview__sheet')).toContainText('This text belongs to another file.');
  await expect(other.locator('.fountain-page-preview__sheet table')).toHaveCSS('margin-top', '20px');
  await expect(page.locator('style[data-fountain-page-print-style]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 800 });
  const mobilePreview = other.getByRole('region', { name: 'Paged draft preview' });
  await mobilePreview.focus();
  await expect(mobilePreview).toBeFocused();
  expect(await mobilePreview.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await mobilePreview.screenshot({ path: info.outputPath('conversion-page-preview-mobile.png') });
  await files.getByRole('button', { name: 'pagination.docx' }).click();
  await expect(editor).toContainText('Added in the lab.');
  await expect(print).toBeDisabled();
  await expect(page.locator('style[data-fountain-page-print-style]')).toHaveCount(0);
  return pdf;
}

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
  await wordWorkspace.getByRole('button', { name: 'Build page preview' }).click();
  const pagedImage = wordWorkspace.locator('.fountain-page-preview__sheet img[alt="Embedded image proof"]');
  await expect(pagedImage).toBeVisible();
  await expect.poll(() => pagedImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(320);
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
