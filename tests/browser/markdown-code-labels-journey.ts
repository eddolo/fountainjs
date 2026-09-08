import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownCodeLabelsJourney(page: Page, info: TestInfo): Promise<void> {
  const labels = ['x"y', 'constructor', '__proto__', 'custom-' + 'x'.repeat(70), '<img/src=x/onerror=alert(1)>'];
  const code = labels.map((label, index) => `\`\`\`${label}\nexample ${index + 1}\n\`\`\``).join('\n\n');
  const source = '# Code label handoff\n\nTechnical labels are data, not executable markup.\n\n' + code;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  const capture = async (name: string) => {
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); });
    await page.screenshot({ path: info.outputPath(name), fullPage: true });
  };
  await page.goto('/issue-editor.html');
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
  await page.getByLabel('Markdown description', { exact: true }).fill(source);
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  const verify = async (surface: typeof editor, edited: boolean) => {
    await expect(surface.locator('pre')).toHaveCount(labels.length);
    for (const [index, label] of labels.entries()) {
      await expect(surface.locator('pre').nth(index)).toHaveAttribute('data-language', label);
      await expect.poll(() => surface.locator('pre').nth(index).textContent()).toBe(`example ${index + 1}${index === 0 && edited ? ' edited' : ''}`);
    }
    await expect(surface.locator('img,script,iframe')).toHaveCount(0);
    expect(errors).toEqual([]);
  };
  await verify(editor, false);
  for (const [index, label] of labels.entries()) await expect(editor.locator('pre').nth(index)).toHaveAttribute('title', label);
  await editor.locator('pre').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor, false);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true);
  await capture('code-labels-editor.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(editor, true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => editor.locator('pre').nth(3).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await editor.locator('pre').nth(3).evaluate(element => getComputedStyle(element, '::before').whiteSpace)).toBe('normal');
  await capture('code-labels-mobile-editor.png');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
  await expect(page.getByLabel('Markdown description', { exact: true })).toHaveValue(/```x&#34;y\nexample 1 edited/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const path = info.outputPath('code-labels.md');
  await (await download).saveAs(path);
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(path);
  await verify(editor, true);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  await verify(reader, true);
  await capture('code-labels-reader.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader, true);
  await capture('code-labels-mobile-reader.png');
}
