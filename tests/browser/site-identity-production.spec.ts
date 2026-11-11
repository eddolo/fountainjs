import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { SiteBuildInfo } from '../../tools/site-build-info';

test('identifies every built public page before JavaScript runs and keeps the label out of print', async ({ browser, request, baseURL }, info) => {
  if (!baseURL) throw new Error('The production site URL is required.');
  const response = await request.get(new URL('build-info.json', baseURL).href);
  expect(response.ok()).toBe(true);
  const metadata: SiteBuildInfo = await response.json();
  expect(metadata.packageVersion).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
  expect(metadata.sourceCommit).toBe(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
  expect(metadata.modified).toBe(Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim()));
  expect(metadata.channel).toBe('development-preview');
  const pages = readdirSync('examples/react-app/dist', { recursive: true }).filter(path => typeof path === 'string' && path.endsWith('.html')) as string[];
  expect(pages.length).toBeGreaterThanOrEqual(20);
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    for (const file of pages) {
      await page.goto(new URL(file.replaceAll('\\', '/'), baseURL).href);
      const banner = page.getByRole('complementary', { name: 'Website build information' });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('Development preview');
      await expect(banner).toContainText(metadata.packageVersion);
      await expect(banner).toContainText(metadata.sourceCommit!.slice(0, 12));
      await expect(banner).toContainText('Examples use this source build.');
      if (metadata.publishedVersion) await expect(banner).toContainText(`npm ${metadata.publishedVersion}`);
      else await expect(banner).toContainText('Check published npm version');
      // JavaScript is disabled for this context. Prerendered marketing content
      // is welcome; availability of the build label must not require React.
      const bounds = await banner.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    }
    await page.screenshot({ path: info.outputPath('site-build-label-no-js-narrow.png') });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('complementary', { name: 'Website build information' })).toBeHidden();
  } finally { await context.close(); }
  await info.attach('site-build-info', { body: JSON.stringify({ metadata, pages }, null, 2), contentType: 'application/json' });
});

test('keeps preview and framework descriptions aligned with the running examples', async ({ page }, info) => {
  await page.goto('demos.html');
  await expect(page.locator('.demos-intro')).toContainText('Vue, Svelte and Angular use their first-party bindings');
  await expect(page.locator('.boundary-list')).toContainText('Framework bindings');
  await page.goto('developers.html');
  await expect(page.getByLabel('Project facts')).toContainText('6 browser interfaces');
  await page.goto('./');
  await expect(page.locator('.capabilities__heading')).toContainText('IN THIS PREVIEW');
  await expect(page.locator('.capabilities__heading')).not.toContainText('ship in the public npm package');
  await expect(page.getByRole('textbox', { name: 'Rich text editor', exact: true })).toContainText('FountainJS engine');
  await page.screenshot({ path: info.outputPath('site-preview-label-and-hero.png') });
});
