import { expect, type Page, type TestInfo } from '@playwright/test';

export async function mathPagesJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/math-references.html');
  const author = page.getByRole('textbox', { name: 'Equation author editor', exact: true });
  await expect(author.locator('mjx-container > svg')).toHaveCount(4);
  await page.getByText('Stored document JSON', { exact: true }).click();
  const json = JSON.parse(await page.locator('details').first().locator('pre').innerText());
  // Open a real document through the public file control: prose separates
  // forward references from their equations across a physical page boundary.
  json.content.splice(2, 0, ...Array.from({ length: 20 }, (_, i) => ({
    type: 'paragraph', content: [{ type: 'text', text: `Research note ${i + 1}: this paragraph belongs between the forward references and their equations.` }],
  })));
  await page.getByLabel('Open Fountain document JSON').setInputFiles({ name: 'cross-page-equations.fountain.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
  await expect(page.locator('[data-file-message]')).toContainText('Opened cross-page-equations');
  await page.getByRole('button', { name: 'Build page preview', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Paged equation snapshot', exact: true });
  const sheets = preview.locator('.fountain-page-preview__sheet');
  await expect.poll(() => sheets.count()).toBeGreaterThan(1);
  await expect(preview.locator('.fountain-page-preview__sheet mjx-container > svg')).toHaveCount(4);
  const links = sheets.first().locator('[data-fountain-math="inline"] a');
  await expect(links).toHaveCount(2);
  const contract = await preview.evaluate(root => {
    const visual = [...root.querySelectorAll('.fountain-page-preview__sheet')];
    return [...visual[0].querySelectorAll('a')].map(link => {
      const id = decodeURIComponent(link.getAttribute('href')!.slice(1));
      const target = document.getElementById(id);
      return { id, inside: target !== null && root.contains(target), page: target?.closest('[data-fountain-page]')?.getAttribute('data-fountain-page') };
    });
  });
  expect(contract).toHaveLength(2);
  expect(contract.every(link => link.inside && Number(link.page) > 1)).toBe(true);
  expect(await sheets.first().locator('.fountain-page-preview__body').evaluate(element => {
    const style = getComputedStyle(element);
    return { border: style.borderTopWidth, shadow: style.boxShadow };
  })).toEqual({ border: '0px', shadow: 'none' });
  for (let i = 0; i < await sheets.count(); i++) {
    await sheets.nth(i).screenshot({ path: info.outputPath(`page-${i + 1}.png`) });
  }
  const href = await links.first().getAttribute('href');
  await links.first().click();
  await expect.poll(() => new URL(page.url()).hash).toBe(href);
  const destination = page.locator(`[id="${contract[0].id}"]`);
  await expect(destination).toBeInViewport();
  const allIds = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
  expect(new Set(allIds).size).toBe(allIds.length);
  // An author edit makes the frozen projection explicitly stale; rebuilding
  // gets new isolated IDs and working references without changing the source.
  await page.getByRole('button', { name: 'Add equation', exact: true }).click();
  await expect(page.locator('[data-page-message]')).toContainText('older snapshot');
  await page.getByRole('button', { name: 'Build page preview', exact: true }).click();
  await expect(page.locator('[data-page-message]')).toContainText('Links stay inside');
  expect(await links.first().getAttribute('href')).not.toBe(href);
  await links.first().click();
  await expect.poll(() => new URL(page.url()).hash).toBe(await links.first().getAttribute('href'));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
}
