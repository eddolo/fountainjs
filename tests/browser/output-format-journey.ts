import { expect, type Page, type TestInfo } from '@playwright/test';

export async function outputFormatJourney(page: Page, info: TestInfo): Promise<void> {
  for (let iteration = 0; iteration < 8; iteration++) {
    const narrow = iteration % 2 === 1;
    await page.setViewportSize({ width: narrow ? 390 : 1440, height: narrow ? 844 : 960 });
    await page.goto('/demos/node-markdown.html');
    await page.getByLabel('Markdown input', { exact: true }).fill('# Output note\n\nLiteral body ' + iteration);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
      'Native control focus must not inherit animated page scrolling').toBe('auto');
    const output = page.locator('.demo-output');
    const html = output.getByRole('button', { name: 'html', exact: true });
    const json = output.getByRole('button', { name: 'json', exact: true });
    const rendered = output.locator('pre');
    await expect(json).toHaveAttribute('aria-pressed', 'true');
    await expect(rendered).toContainText(`"text": "Literal body ${iteration}"`);
    const originalTree = JSON.parse(await rendered.innerText());
    await html.click();
    await expect(html).toHaveAttribute('aria-pressed', 'true');
    await expect(rendered).toContainText('<h1>Output note</h1>');
    const originalHTML = await rendered.innerText();
    await json.focus();
    await page.keyboard.press('Enter');
    await expect(json).toHaveAttribute('aria-pressed', 'true');
    await expect(rendered).toContainText('"type": "doc"');
    expect(JSON.parse(await rendered.innerText())).toEqual(originalTree);
    await html.focus();
    await page.keyboard.press('Space');
    await expect(html).toHaveAttribute('aria-pressed', 'true');
    await expect(rendered).toHaveText(originalHTML);
    if (iteration >= 6) await output.screenshot({ path: info.outputPath(`output-mode-${narrow ? '390' : '1440'}.png`) });
  }
}
