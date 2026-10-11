import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { mountSharedDirectionVirtualFixture } from '../browser/fixtures/shared-direction-virtual';

declare global {
  var sharedVirtualAudit: ReturnType<typeof mountSharedDirectionVirtualFixture>;
  var mountSharedVirtualAudit: () => Promise<ReturnType<typeof mountSharedDirectionVirtualFixture>>;
}

test('refreshes live direction from an unmounted anchor in 100,000 blocks with native editing and history', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/browser-tests.html');
  await page.evaluate(async () => {
    // Vite test fixture setup, public engine APIs only. This is not evidence
    // that a production 100k-file import UI or every large-document flow works.
    globalThis.sharedVirtualAudit = await globalThis.mountSharedVirtualAudit();
  });
  const host = page.locator('#shared-direction-virtual-fixture');
  const editor = host.getByRole('textbox', { name: 'Shared virtual document', exact: true });
  const observations: Record<string, unknown> = {};
  const inspect = () => page.evaluate(() => globalThis.sharedVirtualAudit.inspect());
  try {
    await host.getByRole('button', { name: 'Show middle fragment', exact: true }).click();
    const member = editor.locator('[data-fountain-path="50000"]');
    await expect(member).toBeVisible();
    await expect(member).toBeInViewport();
    const initial = await inspect(); observations.initial = initial;
    expect(initial.blockCount).toBe(100_000);
    expect(initial.mountedCount).toBeLessThan(100);
    expect(initial.anchorMounted).toBe(false);
    await expect(member).toHaveCSS('direction', 'rtl');
    const reused = await member.elementHandle();

    await host.getByLabel('Offscreen anchor text', { exact: true }).fill('English שלום anchor');
    await host.getByRole('button', { name: 'Apply offscreen anchor', exact: true }).click();
    await expect(member).toHaveCSS('direction', 'ltr');
    await expect(member).toBeInViewport();
    expect(await member.evaluate((element, original) => element === original, reused)).toBe(true);
    observations.afterOffscreenEdit = await inspect();
    await host.screenshot({ path: info.outputPath('virtual-offscreen-anchor-ltr.png') });
    await host.getByRole('button', { name: 'Undo virtual edit', exact: true }).click();
    await expect(member).toHaveCSS('direction', 'rtl');
    await host.getByRole('button', { name: 'Redo virtual edit', exact: true }).click();
    await expect(member).toHaveCSS('direction', 'ltr');
    await host.getByRole('button', { name: 'Undo virtual edit', exact: true }).click();

    await member.click();
    await page.keyboard.press('Home');
    await page.keyboard.insertText('English ');
    await expect(member).toHaveText('English 123 😀 50000');
    await expect(member).toHaveCSS('direction', 'ltr');
    observations.afterNativeEdit = await inspect();
    await host.getByRole('button', { name: 'Undo virtual edit', exact: true }).click();
    await expect(member).toHaveText('123 😀 50000');
    await expect(member).toHaveCSS('direction', 'rtl');
    await host.screenshot({ path: info.outputPath('virtual-restored-rtl.png') });
    const restored = await inspect(); observations.restored = restored;
    expect(restored.anchorText).toBe('שלום anchor');
    expect(restored.anchorMounted).toBe(false);
    expect(restored.mountedCount).toBeLessThan(100);
    expect(restored.anchorGroup).toBe(restored.memberGroup);
    expect(restored.timings).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    observations.errors = errors;
    await writeFile(info.outputPath('virtual-direction-observations.json'), JSON.stringify(observations, null, 2));
    await page.evaluate(() => globalThis.sharedVirtualAudit.destroy());
    await expect(host).toHaveCount(0);
  }
});
