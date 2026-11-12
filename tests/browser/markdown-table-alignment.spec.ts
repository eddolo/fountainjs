import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test('physical table alignment survives Markdown reopening in an inherited RTL surface', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = fileURLToPath(new URL('./markdown-table-alignment.html', import.meta.url)).replaceAll('\\', '/');
  await page.goto(`/@fs/${fixture}`); await expect(page).toHaveTitle('Markdown table alignment regression');
  const paragraphs = page.locator('[data-fountain-node="table"] p');
  const assertLayout = async () => {
    await expect(paragraphs).toHaveCount(8);
    expect(await paragraphs.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).textAlign))).toEqual(['left', 'center', 'right', 'start', 'left', 'center', 'right', 'start']);
    for (const index of [0, 3, 4, 7]) {
      const measurement = await paragraphs.nth(index).evaluate(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const alignment = getComputedStyle(node).textAlign === 'start' ? 'right' : 'left';
        return { text: range.getBoundingClientRect()[alignment], block: node.getBoundingClientRect()[alignment], direction: getComputedStyle(node).direction };
      });
      expect(measurement.direction).toBe('rtl');
      expect(Math.abs(measurement.text - measurement.block)).toBeLessThanOrEqual(2);
    }
  };
  await assertLayout(); await page.screenshot({ path: info.outputPath('rtl-table-import.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reopen Markdown', exact: true }).click(); await assertLayout();
  const snapshot = await page.evaluate(() => (window as unknown as { markdownTableAlignmentAudit: { snapshot(): { source: string; losses: unknown[] } } }).markdownTableAlignmentAudit.snapshot());
  expect(snapshot.losses).toEqual([]); expect(snapshot.source).toContain('| :--- | :---: | ---: | --- |'); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('rtl-table-reopened.png'), fullPage: true });
});
