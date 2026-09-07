import { expect, type Page, type TestInfo } from '@playwright/test';

export async function textAlignmentJourney(page: Page, info: TestInfo): Promise<void> {
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Meeting report');
  await page.keyboard.press('Enter');
  await page.keyboard.type('First decision');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second decision');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Next steps');
  const blocks = editor.locator(':scope > p, :scope > h1, :scope > h2');
  await expect(blocks).toHaveText(['Meeting report', 'First decision', 'Second decision', 'Next steps']);
  // Select backwards from the last paragraph, using the real native keyboard.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Shift+Home');
  const selected = await page.evaluate(() => getSelection()?.toString());
  await info.attach('backward-boundary-selection', { contentType: 'application/json', body: JSON.stringify(await page.evaluate(() => {
    const native = getSelection();
    return {
      anchor: native?.anchorNode?.nodeName, anchorOffset: native?.anchorOffset,
      anchorHTML: native?.anchorNode?.parentElement?.outerHTML,
      focus: native?.focusNode?.nodeName, focusOffset: native?.focusOffset,
      focusHTML: native?.focusNode?.parentElement?.outerHTML,
    };
  })) });
  expect(selected).toContain('First decision');
  await page.getByRole('button', { name: 'Centre', exact: true }).click();
  await expect(blocks.nth(1)).toHaveCSS('text-align', 'center');
  await expect(blocks.nth(2)).not.toHaveCSS('text-align', 'center');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(blocks.nth(1)).not.toHaveCSS('text-align', 'center');
  await page.keyboard.type('Replacement ');
  await expect(blocks).toHaveText(['Meeting report', 'Replacement Second decision', 'Next steps']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(blocks).toHaveText(['Meeting report', 'First decision', 'Second decision', 'Next steps']);

  // Include two full paragraphs backwards, leaving title and final paragraph alone.
  await editor.getByText('Second decision', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Shift+Home');
  const selection = await page.evaluate(() => ({
    text: getSelection()?.toString(),
    anchor: getSelection()?.anchorNode?.textContent,
    focus: getSelection()?.focusNode?.textContent,
  }));
  expect(selection.text).toContain('First decision');
  expect(selection.text).toContain('Second decision');
  expect(selection.anchor).toBe('Second decision');
  expect(selection.focus).toBe('First decision');
  await page.getByRole('button', { name: 'Centre', exact: true }).click();
  await expect(blocks.nth(1)).toHaveCSS('text-align', 'center');
  await expect(blocks.nth(2)).toHaveCSS('text-align', 'center');
  await expect(blocks.first()).not.toHaveCSS('text-align', 'center');
  await expect(blocks.last()).not.toHaveCSS('text-align', 'center');
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('two-selected-paragraphs-centered.png') });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(blocks.nth(1)).not.toHaveCSS('text-align', 'center');
  await expect(blocks.nth(2)).not.toHaveCSS('text-align', 'center');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(blocks.nth(1)).toHaveCSS('text-align', 'center');
  await expect(blocks.nth(2)).toHaveCSS('text-align', 'center');
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  expect(html).toContain('text-align:center');
  // Open the exported representation as another HTML consumer, not editor state.
  const reader = await page.context().newPage();
  await reader.setContent(html);
  await expect(reader.getByText('First decision', { exact: true })).toHaveCSS('text-align', 'center');
  await expect(reader.getByText('Second decision', { exact: true })).toHaveCSS('text-align', 'center');
  await reader.screenshot({ path: info.outputPath('exported-aligned-report.png') });
  await reader.close();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Centre', exact: true }).click();
  for (const block of await blocks.all()) await expect(block).toHaveCSS('text-align', 'center');
  await page.screenshot({ path: info.outputPath('whole-report-centered.png') });
}
