import { expect, test } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

test.use({ video: 'on', trace: 'on' });
test.setTimeout(60_000);

test('edits equations and downloads an offline typeset HTML reader with exact source recovery', async ({ page, browser }, info) => {
  const root = info.outputPath('html-math-export');
  await mkdir(root, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  const original = '# Research note\n\nThe inline value is $x^{2}$.\n\n$$\n\\frac{a+b}{c}\n$$\n\n$$\n\\notAFountainCommand{x}\n$$\n';
  await page.getByLabel('Choose documents').setInputFiles({ name: 'research.md', mimeType: 'text/markdown', buffer: Buffer.from(original) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: research.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const equation = editor.locator('[data-fountain-math="block"]').first();
  await equation.locator('.fountain-math__output').click();
  const source = equation.getByLabel('Edit math source', { exact: true });
  await source.fill(String.raw`\frac{a+b}{d}`);
  await source.press('Control+Enter');
  await expect(equation).toHaveAttribute('data-latex', String.raw`\frac{a+b}{d}`);
  await editor.screenshot({ path: info.outputPath('html-math-export/editor.png'), caret: 'initial' });
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
  const render = workspace.getByRole('checkbox', { name: 'Render equations in the downloaded HTML', exact: false });
  await expect(render).toBeChecked();
  const save = async (name: string) => {
    const pending = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const path = info.outputPath(`html-math-export/${name}`);
    await (await pending).saveAs(path);
    return path;
  };
  const renderedFile = await save('rendered.html');
  await expect(workspace.getByLabel('Round-trip result')).toContainText('html-math-source-fallback');
  await expect(workspace.getByLabel('Round-trip result')).toContainText('html-math-native-rendering');
  const readerContext = await browser.newContext({ viewport: { width: 1200, height: 900 }, recordVideo: { dir: info.outputPath('offline-reader-video') } });
  // Windows WebKit's offline flag also rejects independent local files.
  // Block every HTTP(S) request while opening the actual downloaded file.
  await readerContext.route(/^https?:\/\//, route => route.abort());
  const reader = await readerContext.newPage();
  const network: string[] = [];
  reader.on('pageerror', error => errors.push(error.message));
  reader.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  try {
    await reader.goto(pathToFileURL(renderedFile).href);
    await expect(reader.locator('math')).toHaveCount(2);
    await expect(reader.locator('script, iframe, link')).toHaveCount(0);
    const fraction = reader.locator('mfrac');
    await expect(fraction).toBeVisible();
    const children = fraction.locator(':scope > *');
    const numerator = await children.nth(0).boundingBox(), denominator = await children.nth(1).boundingBox();
    if (!numerator || !denominator) throw new Error('The native fraction must have visible numerator and denominator.');
    expect(numerator.height).toBeGreaterThan(0);
    expect(denominator.y).toBeGreaterThan(numerator.y);
    const block = reader.locator('[data-fountain-math="block"]').first();
    await expect(block).toHaveAttribute('data-latex', String.raw`\frac{a+b}{d}`);
    await expect(block.locator('annotation')).toHaveText(String.raw`\frac{a+b}{d}`);
    await expect(block.locator('code')).toHaveCount(0);
    await expect(reader.locator('[data-fountain-math="block"]').nth(1).locator('code')).toHaveText(String.raw`\notAFountainCommand{x}`);
    await reader.screenshot({ path: info.outputPath('html-math-export/offline-reader.png'), fullPage: true });
    await writeFile(info.outputPath('html-math-export/native-layout.json'), JSON.stringify({ numerator, denominator, network }, null, 2));
    expect(network).toEqual([]);
    await render.uncheck();
    await expect(workspace.getByLabel('Round-trip result')).toContainText('Outdated check');
    const sourceFile = await save('source-only.html');
    await reader.goto(pathToFileURL(sourceFile).href);
    await expect(reader.locator('math')).toHaveCount(0);
    await expect(reader.locator('[data-fountain-math="block"]').first().locator('code')).toHaveText(String.raw`\frac{a+b}{d}`);
    await reader.screenshot({ path: info.outputPath('html-math-export/source-only-reader.png'), fullPage: true });
  } finally { await readerContext.close(); }
  // Reopen the actual rendered download through the normal file chooser.
  await page.getByLabel('Choose documents').setInputFiles(renderedFile);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: rendered.html', exact: true });
  const reopenedEditor = reopened.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(reopenedEditor.locator('[data-fountain-math="block"]').first()).toHaveAttribute('data-latex', String.raw`\frac{a+b}{d}`);
  await expect(reopenedEditor.locator('[data-fountain-math="block"]').nth(1)).toHaveAttribute('data-latex', String.raw`\notAFountainCommand{x}`);
  expect(await readFile(renderedFile, 'utf8')).not.toContain('<script');
  expect(errors).toEqual([]);
});
