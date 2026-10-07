import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

export const listDirectionCases = ['unwrap', 'indent', 'nested-lift', 'contained'] as const;
export type ListDirectionCase = typeof listDirectionCases[number];

const sources: Record<ListDirectionCase, string> = {
  unwrap: '<ol dir="rtl" start="0"><li><p>Before</p></li><li><p>Moved Latin text</p></li><li dir="ltr"><p>After override</p></li></ol>',
  indent: '<ol dir="rtl" start="0"><li dir="ltr"><p>Parent override</p><ol dir="ltr"><li><p>Existing nested text</p></li></ol></li><li><p>Moved Latin text</p></li></ol>',
  'nested-lift': '<ol dir="ltr" start="0"><li dir="rtl"><p>Parent override</p><ol start="0"><li><p>Moved Latin text</p></li><li><p>Trailing nested text</p></li></ol></li></ol>',
  contained: '<blockquote dir="ltr"><ol dir="rtl"><li><p>Moved Latin text</p></li></ol></blockquote><table><tr><td dir="ltr"><ol dir="rtl"><li><p>Cell Latin text</p></li></ol></td></tr></table>',
};

const layout = (paragraph: Locator) => paragraph.evaluate(element => {
  const style = getComputedStyle(element);
  const range = document.createRange();
  range.selectNodeContents(element);
  const text = range.getBoundingClientRect(), block = element.getBoundingClientRect();
  return { direction: style.direction, align: style.textAlign, dirAttribute: element.getAttribute('dir'),
    text: element.textContent, textOnRight: block.right - text.right < text.left - block.left };
});

/** Real file import, pointer/keyboard transforms, typing/history and downloaded reader.
 * No model mutations, forged input events or forced DOM selections in this journey.
 */
export async function listDirectionTransformJourney(page: Page, info: TestInfo, sample: ListDirectionCase): Promise<void> {
  const observations: Record<string, unknown> = { sample };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations += 1; });
  const source = sources[sample];
  let nativeRightAligned: boolean;
  const native = await page.context().newPage();
  try {
    await native.setContent(`<style>body{width:700px}p{margin:16px 0}</style>${source}`);
    const nativeLayout = await layout(native.locator('p').filter({ hasText: 'Moved Latin text' }));
    observations.native = nativeLayout;
    nativeRightAligned = nativeLayout.textOnRight;
    // Mixed-direction list alignment differs between browser UA styles.
    // Compare to this engine's independent native source, not Chromium's.
    expect(nativeLayout.direction).toBe('rtl');
    await native.locator('body').screenshot({ path: info.outputPath('list-direction-native.png') });
  } finally { await native.close(); }

  await page.goto('/conversion-lab.html');
  const name = `list-direction-${sample}.html`;
  await page.getByLabel('Choose documents').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: `Conversion workspace: ${name}`, exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const moved = editor.locator('p').filter({ hasText: 'Moved Latin text' });
  await expect(moved).toBeVisible();
  observations.imported = await layout(moved);
  expect(observations.imported).toMatchObject({ direction: 'rtl', textOnRight: nativeRightAligned });
  const original = await editor.locator('p').allTextContents();
  const assertMoved = async () => {
    observations.transformed = await layout(moved);
    expect(observations.transformed).toMatchObject({ direction: 'rtl', textOnRight: nativeRightAligned });
    expect(await editor.locator('p').allTextContents()).toEqual(original);
    if (sample === 'unwrap') {
      // The imported editor may already have an empty trailing landing block;
      // assert the moved paragraph's actual parent, not all root paragraphs.
      await expect(editor.locator(':scope > p').filter({ hasText: 'Moved Latin text' })).toHaveCount(1);
      await expect(moved).toHaveAttribute('dir', 'rtl');
      await expect(editor.locator(':scope > ol').first()).toHaveAttribute('start', '0');
      await expect(editor.locator(':scope > ol').last()).toHaveAttribute('start', '2');
      await expect(editor.locator('p').filter({ hasText: 'After override' })).toHaveCSS('direction', 'ltr');
    } else if (sample === 'indent') {
      await expect(editor.locator(':scope > ol > li')).toHaveCount(1);
      await expect(editor.locator('p').filter({ hasText: 'Existing nested text' })).toHaveCSS('direction', 'ltr');
      await expect(moved.locator('..')).toHaveAttribute('dir', 'rtl');
    } else if (sample === 'nested-lift') {
      await expect(editor.locator(':scope > ol > li')).toHaveCount(2);
      await expect(moved.locator('..')).toHaveAttribute('dir', 'rtl');
      await expect(editor.locator('p').filter({ hasText: 'Trailing nested text' })).toHaveCSS('direction', 'rtl');
      // HTML's default start=1 is intentionally emitted without an attribute.
      await expect(moved.locator('..').locator('ol')).toHaveJSProperty('start', 1);
    } else {
      await expect(editor.locator('blockquote > p')).toHaveText('Moved Latin text');
    }
  };
  const action = sample === 'indent' ? 'Indent list item' : 'Lift list item';
  await moved.click();
  await workspace.getByRole('button', { name: action, exact: true }).click();
  await assertMoved();
  await editor.screenshot({ path: info.outputPath('list-direction-pointer-transformed.png') });
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await editor.locator('p').allTextContents()).toEqual(original);
  expect(await layout(moved)).toEqual(observations.imported);
  await moved.click();
  await page.keyboard.press(sample === 'indent' ? 'Tab' : 'Shift+Tab');
  await assertMoved();

  if (sample === 'contained') {
    const cell = editor.locator('td p').filter({ hasText: 'Cell Latin text' });
    const beforeCell = await layout(cell);
    observations.cellBefore = beforeCell;
    await cell.click();
    // Tab in a table is table navigation; use the explicit toolbar lift action.
    await workspace.getByRole('button', { name: 'Lift list item', exact: true }).click();
    await expect(cell).toHaveText('Cell Latin text');
    await expect(editor.locator('td ol')).toHaveCount(0);
    await expect(cell.locator('..')).toHaveAttribute('class', 'fountain-table-cell__content');
    observations.cell = await layout(cell);
    expect(observations.cell).toMatchObject({ direction: 'rtl', textOnRight: beforeCell.textOnRight });
  }
  await moved.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' revised');
  await expect(moved).toContainText('revised');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(moved).toHaveText('Moved Latin text');
  await editor.screenshot({ path: info.outputPath('list-direction-keyboard-history.png') });

  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
  const pendingDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const download = await pendingDownload;
  const html = await readFile((await download.path())!, 'utf8');
  const reader = await page.context().newPage();
  try {
    await reader.setContent(html);
    observations.reader = await layout(reader.locator('p').filter({ hasText: 'Moved Latin text' }));
    expect(observations.reader).toMatchObject({ direction: 'rtl', textOnRight: nativeRightAligned });
    if (sample === 'contained') await expect(reader.locator('td > p')).toHaveCSS('direction', 'rtl');
    await reader.locator('body').screenshot({ path: info.outputPath('list-direction-downloaded-reader.png') });
  } finally { await reader.close(); }
  expect(errors).toEqual([]);
  expect(navigations).toBe(1);
  observations.pageErrors = errors;
  observations.navigations = navigations;
  await writeFile(info.outputPath('list-direction-observations.json'), JSON.stringify(observations, null, 2));
}
