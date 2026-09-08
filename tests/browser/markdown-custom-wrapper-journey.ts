import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownCustomWrapperJourney(page: Page, info: TestInfo): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/browser-tests.html');
  const source = '<section data-label="Release">\n\n# Release handover\n\n<section data-label="Checks">\n\nInspect logs  \nCheck timestamps\n\n</section>\n\n</section>';
  const imported = await page.evaluate(source => (globalThis as any).fountainBrowserTest.importRegisteredHTMLFlow(source), source);
  expect(imported.fallbacks).toEqual([]);
  const editor = page.getByRole('textbox', { name: 'Browser contract editor', exact: true });
  const checks = editor.locator('section[data-label="Checks"] > p');
  const verify = async (edited = false) => {
    await expect(editor.locator('section[data-label="Release"] section[data-label="Checks"]')).toHaveCount(1);
    await expect(checks).toHaveText(edited ? 'Inspect logsCheck timestamps verified' : 'Inspect logsCheck timestamps');
    await expect(checks.locator('br')).toHaveCount(1);
    await expect.poll(() => checks.evaluate(element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const tops: number[] = [];
      const lefts: number[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (const word of ['Inspect', 'Check']) {
          const index = (node.textContent ?? '').indexOf(word);
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index); range.setEnd(node, index + word.length);
          tops.push(range.getBoundingClientRect().top); lefts.push(range.getBoundingClientRect().left);
        }
      }
      const height = Number.parseFloat(getComputedStyle(element).lineHeight);
      return tops.length === 2 && Math.abs(tops[1] - tops[0] - height) < 2 && Math.abs(lefts[1] - lefts[0]) < 2;
    })).toBe(true);
  };
  await verify();
  const box = await checks.boundingBox();
  expect(box).not.toBeNull();
  await checks.click({ position: { x: 20, y: box!.height - 5 } });
  await page.keyboard.press('End');
  await page.keyboard.type(' verified');
  await verify(true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(true);
  await editor.screenshot({ path: info.outputPath('registered-wrapper-editor.png') });
  const html = await page.evaluate(() => (globalThis as any).fountainBrowserTest.exportHTML());
  expect(html).toContain('<section data-label="Release"');
  expect(html).toContain('<section data-label="Checks"');
  expect(await page.evaluate(html => (globalThis as any).fountainBrowserTest.reopenHTML(html), html)).toBe(true);
  await verify(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(true);
  await editor.screenshot({ path: info.outputPath('registered-wrapper-mobile.png') });
  expect(errors).toEqual([]);
}
