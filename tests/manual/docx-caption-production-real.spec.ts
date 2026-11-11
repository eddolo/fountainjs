import { expect, test } from '@playwright/test';

test('retains the embedded Word image and its rich caption on the production subpath', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('demos/node-markdown.html');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download embedded-image sample' }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x50, 0x4b]));
  await page.getByRole('button', { name: 'Word DOCX', exact: true }).click();
  await page.getByLabel('Import Word DOCX').setInputFiles({
    name: 'production-image.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: bytes,
  });
  await expect(page.getByText('Valid document · 3 top-level blocks · bounded DOCX import')).toBeVisible();
  const image = page.getByRole('img', { name: 'FountainJS violet sample' });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  const preview = page.locator('.headless-image-previews');
  await expect(preview.locator('figcaption')).toHaveText('A verified raster image packaged inside the Word document.');
  await expect(page.locator('.demo-output pre')).toContainText('A verified raster image packaged inside the Word document.');
  await preview.screenshot({ path: info.outputPath('production-rich-image-caption.png') });
  expect(errors).toEqual([]);
});
