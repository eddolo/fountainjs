import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

for (const custom of [false, true]) test(`a cold replacement inline image visibly loads without changing its document attributes: ${custom ? 'custom renderer' : 'default renderer'}`, async ({ page }, info) => {
  const png = await readFile(new URL('../fixtures/cross-container-figure.png', import.meta.url));
  let release!: () => void, requests = 0;
  const responseReady = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/cold-inline-image-a.png', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.route('**/cold-inline-image-b.png', async route => {
    requests++; await responseReady; await route.fulfill({ status: 200, contentType: 'image/png', body: png });
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = fileURLToPath(new URL('./inline-image-loading.html', import.meta.url)).replaceAll('\\', '/');
  await page.goto(`/@fs/${fixture}${custom ? '?custom' : ''}`);
  await expect(page).toHaveTitle('Inline image loading regression');
  const image = page.getByRole('img', { name: 'Cold test figure' });
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(png.readUInt32BE(16));
  await page.getByRole('button', { name: 'Replace image' }).click();
  const snapshot = () => page.evaluate(() => (window as unknown as { inlineImageLoadingAudit: { snapshot(): unknown } }).inlineImageLoadingAudit.snapshot());
  const before = await snapshot();
  try {
    await expect(image).toBeVisible();
    await expect(image).toBeInViewport();
    expect((await image.boundingBox())!.height).toBeGreaterThan(0);
    await expect.poll(() => requests).toBe(1);
  } finally { release(); }
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(png.readUInt32BE(16));
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).style.minHeight)).toBe('');
  expect(await snapshot()).toEqual(before); await expect(image).toHaveAttribute('loading', 'lazy');
  if (custom) await expect(page.locator('[data-custom-inline-image="true"]')).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('cold-inline-image-loaded.png'), fullPage: true });
});
