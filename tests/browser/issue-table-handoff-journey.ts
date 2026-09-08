import { expect, type Page, type TestInfo } from '@playwright/test';

export async function issueTableHandoffJourney(page: Page, info: TestInfo): Promise<void> {
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  // Standard clipboard payload handler, not a model setter or OS clipboard proof.
  await editor.evaluate(element => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html'
      ? '<h1>Incident owners</h1><table><tr><td><strong>Ada</strong></td><td>Ready</td></tr><tr><th scope="row">Notes</th><td><p>First check</p><p>Second check</p></td></tr><tr><td colspan="2">Shared action</td></tr></table><p>Closing note</p>' : '' } });
    element.dispatchEvent(event);
  });
  const verify = async (surface: typeof editor) => {
    const rows = surface.locator('table tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator('td')).toHaveCount(2);
    await expect(rows.nth(0).locator('th')).toHaveCount(0);
    await expect(surface.getByText('Ada', { exact: true })).toHaveCSS('font-weight', '700');
    await expect(rows.nth(1).locator('th')).toHaveText('Notes');
    await expect(rows.nth(1).locator('td p')).toHaveCount(2);
    await expect(rows.nth(2).locator('td')).toHaveAttribute('colspan', '2');
  };
  const capture = async (name: string) => {
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    await page.screenshot({ path: info.outputPath(name), fullPage: true });
  };
  await verify(editor);
  await expect(page.getByLabel('Markdown export warnings')).toContainText('first row column headers');
  await page.getByLabel('Table export', { exact: true }).selectOption('html');
  await expect(page.getByLabel('Markdown export warnings')).not.toContainText('first row column headers');
  await capture('table-before-handoff.png');
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
  await expect(page.getByLabel('Markdown description', { exact: true })).toHaveValue(/<table>/u);
  await expect(page.getByLabel('Table export', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  await verify(editor);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const path = info.outputPath('incident-owners.md');
  await (await pending).saveAs(path);
  // Force a real replacement on reopen, then prove it is undoable.
  await editor.getByText('Closing note', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(path);
  await expect(editor.getByText('Closing note', { exact: true })).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).toContainText('Closing note edited');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor);
  await expect(editor.getByText('Closing note', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await verify(reader);
  await capture('table-reopened-reader.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader);
  await capture('table-reopened-mobile.png');
}
