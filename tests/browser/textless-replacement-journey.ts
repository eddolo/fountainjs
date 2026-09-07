import { expect, type Page, type TestInfo } from '@playwright/test';

export async function textlessReplacementJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/browser-tests.html');
  const surface = page.getByRole('textbox', { name: 'Browser contract editor', exact: true });
  await surface.locator('p').first().click();
  // Exercise a host's public document-replacement API, then use native keys.
  const recovery = await page.evaluate(() => {
    const { editor, view } = (globalThis as any).fountainBrowserTest;
    const atom = editor.state.schema.node('horizontal_rule');
    const transaction = editor.state.createTransaction().replace(0, editor.state.doc.childCount, [atom, atom]);
    const mapped = transaction.selection.kind;
    editor.dispatch(transaction);
    view.focus();
    return { mapped, types: editor.state.doc.content.map((node: any) => node.type.name) };
  });
  expect(recovery.mapped).toBe('gap');
  expect(recovery.types.slice(0, 2)).toEqual(['horizontal_rule', 'horizontal_rule']);
  await expect(surface.locator('hr')).toHaveCount(2);
  await page.keyboard.type('After the rules');
  await expect(surface).toContainText('After the rules');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second line');
  await expect(surface.locator('p').filter({ hasText: 'Second line' })).toBeVisible();
  await surface.screenshot({ path: info.outputPath('textless-replacement-typed.png') });
  await page.keyboard.press('Control+z');
  await expect(surface).not.toContainText('Second line');
  await page.keyboard.press('Control+Shift+z');
  await expect(surface).toContainText('Second line');
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect(surface.locator('p').filter({ hasText: 'After the rulesSecond line' })).toBeVisible();
  await surface.screenshot({ path: info.outputPath('textless-replacement-joined.png') });
  expect(errors).toEqual([]);
}
