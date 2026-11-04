import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function runSiteFontJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('site-font-journey');
  await mkdir(root, { recursive: true });
  let release!: () => void;
  const pending = new Promise<void>(done => { release = done; });
  let requests = 0, fulfilled = false;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', async route => {
    requests++;
    await pending;
    await route.fulfill({ contentType: 'text/css', body: ':root { --fountain-font-probe: loaded; }' });
    fulfilled = true;
  });
  try {
    // Commit returns before styles finish. The pending font response is released
    // only after real typing succeeds, so this cannot pass by waiting for fonts.
    await page.goto('/issue-editor.html', { waitUntil: 'commit' });
    await expect.poll(() => requests).toBe(1);
    const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
    await expect(editor).toBeVisible();
    const paragraph = editor.locator('p').first();
    const before = await paragraph.innerText();
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Available before fonts.');
    await expect(paragraph).toHaveText(before + ' Available before fonts.');
    expect(fulfilled).toBe(false);
    const stylesheet = page.locator('link[data-fountain-site-fonts]');
    await expect(stylesheet).toHaveCount(1);
    await expect(stylesheet).toHaveAttribute('media', 'print');
    // Video/trace records the pending state. A screenshot waits for
    // document.fonts.ready in Firefox, which cannot resolve until this held
    // stylesheet is released; it must not sit between the proof and release.
    release();
    await expect(stylesheet).toHaveAttribute('media', 'all');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fountain-font-probe').trim())).toBe('loaded');
    await expect(paragraph).toHaveText(before + ' Available before fonts.');
    await page.screenshot({ path: resolve(root, 'stylesheet-applied.png') });
    expect(errors).toEqual([]);
    await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, requests,
      nativeTypingBeforeFontResponse: true, stylesheetAppliedAfterRelease: true, contentRetained: true,
      scope: 'Delayed synthetic font stylesheet; actual external typography is checked separately.', errors }, null, 2));
  } finally { release(); }
}
