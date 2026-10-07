import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

interface NativeSelectionObservation { anchor: number; focus: number; text: string }

function nativeSelection(page: Page): Promise<NativeSelectionObservation> {
  return page.evaluate(() => {
    const selection = getSelection();
    if (!selection) throw new Error('Native selection is unavailable');
    return { anchor: selection.anchorOffset, focus: selection.focusOffset, text: selection.toString() };
  });
}

export async function textDirectionJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Record the platform's untouched contenteditable behaviour alongside the
  // editor. Range reconstruction can lose bidi caret affinity even when the
  // visible selection endpoints look identical.
  const baseline = await page.context().newPage();
  const keys = ['Home', 'ArrowLeft', 'Shift+ArrowLeft', 'Shift+ArrowLeft'];
  let nativeSequence: NativeSelectionObservation[] = [];
  try {
    const observations: Record<string, NativeSelectionObservation[]> = {};
    for (const mode of ['untouched', 'reconstructed']) {
      await baseline.setContent('<div contenteditable="true"><p dir="rtl" style="text-align:start"><span>אבגד הוזח</span></p></div>');
      if (mode === 'reconstructed') {
        await baseline.evaluate(() => document.querySelector('[contenteditable]')!.addEventListener('keyup', () => {
          const selection = getSelection();
          if (!selection?.rangeCount) return;
          const range = selection.getRangeAt(0).cloneRange();
          selection.removeAllRanges(); selection.addRange(range);
        }));
      }
      await baseline.locator('p').click();
      observations[mode] = [];
      for (const key of keys) {
        await baseline.keyboard.press(key);
        observations[mode]!.push(await nativeSelection(baseline));
      }
    }
    const baselinePath = info.outputPath('native-rtl-selection-baseline.json');
    await writeFile(baselinePath, JSON.stringify(observations, null, 2));
    await info.attach('native-rtl-selection-baseline', { path: baselinePath, contentType: 'application/json' });
    nativeSequence = observations.untouched!;
    expect(nativeSequence[0]).toEqual({ anchor: 0, focus: 0, text: '' });
    expect(nativeSequence[1]).toEqual({ anchor: 1, focus: 1, text: '' });
    // Linux Firefox extends logically here; the other certified platforms
    // extend visually. Match actual native endpoints, not a Windows-only rule.
    expect([{ anchor: 1, focus: 3, text: 'בג' }, { anchor: 1, focus: 0, text: 'א' }]).toContainEqual(nativeSequence[3]);
  } finally { await baseline.close(); }
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('אבגד הוזח');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('مرحبا world שלום');
  const blocks = editor.locator(':scope > p');
  await expect(blocks).toHaveText(['אבגד הוזח', 'مرحبا world שלום']);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'RTL', exact: true }).click();
  await page.getByRole('button', { name: 'Align start', exact: true }).click();
  for (const block of await blocks.all()) {
    await expect(block).toHaveAttribute('dir', 'rtl');
    await expect(block).toHaveCSS('direction', 'rtl');
    await expect(block).toHaveCSS('text-align', 'start');
  }
  await blocks.first().click();
  for (let index = 0; index < keys.length; index += 1) {
    await page.keyboard.press(keys[index]!);
    await expect.poll(() => nativeSelection(page)).toEqual(nativeSequence[index]);
  }
  const selected = nativeSequence[3]!;
  const from = Math.min(selected.anchor, selected.focus), to = Math.max(selected.anchor, selected.focus);
  await page.keyboard.insertText('XY');
  await expect(blocks.first()).toHaveText('אבגד הוזח'.slice(0, from) + 'XY' + 'אבגד הוזח'.slice(to));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(blocks.first()).toHaveText('אבגד הוזח');

  // Enter must carry base direction into the newly created paragraph.
  await blocks.first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(blocks).toHaveText(['א', 'בגד הוזח', 'مرحبا world שלום']);
  await expect(blocks.nth(1)).toHaveAttribute('dir', 'rtl');
  await expect(blocks.nth(1)).toHaveCSS('text-align', 'start');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(blocks).toHaveText(['אבגד הוזח', 'مرحبا world שלום']);

  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Centre', exact: true }).click();
  await page.getByRole('button', { name: 'LTR', exact: true }).click();
  await expect(blocks.first()).toHaveCSS('direction', 'ltr');
  await expect(blocks.first()).toHaveCSS('text-align', 'center');
  await page.getByRole('button', { name: 'Auto direction', exact: true }).click();
  await page.getByRole('button', { name: 'Align start', exact: true }).click();
  await expect(blocks.first()).toHaveAttribute('dir', 'auto');
  await expect(blocks.first()).toHaveCSS('direction', 'rtl');
  await editor.screenshot({ path: info.outputPath('rtl-editor-desktop.png') });

  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  expect(html).toContain('dir="auto"');
  expect(html).toContain('text-align:start');
  const reader = await page.context().newPage();
  await reader.setContent(html);
  await expect(reader.getByText('אבגד הוזח', { exact: true })).toHaveCSS('direction', 'rtl');
  await expect(reader.getByText('مرحبا world שלום', { exact: true })).toHaveCSS('text-align', 'start');
  await reader.screenshot({ path: info.outputPath('rtl-exported-reader.png') });
  await reader.close();
  await page.setViewportSize({ width: 390, height: 900 });
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('rtl-editor-mobile.png') });
  expect(errors).toEqual([]);
}
