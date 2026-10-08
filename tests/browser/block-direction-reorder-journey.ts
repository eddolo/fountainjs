import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

async function stored(page: Page) {
  return JSON.parse((await page.locator('details pre').textContent())!);
}
async function snapshot(page: Page, info: TestInfo, name: string) {
  await page.locator('.reorder-lab__mount').screenshot({ path: info.outputPath(`block-direction-${name}.png`) });
}
async function openLab(page: Page, direction: 'ltr' | 'rtl') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/block-reordering.html');
  await expect(page.getByRole('textbox', { name: 'Runbook reordering editor' })).toBeVisible();
  await page.getByLabel('Editor direction').selectOption(direction);
  await expect(page.getByRole('textbox', { name: 'Runbook reordering editor' })).toHaveAttribute('dir', direction);
  return errors;
}

export async function blockDirectionPointerJourney(page: Page, info: TestInfo, direction: 'ltr' | 'rtl') {
  const errors = await openLab(page, direction);
  const original = await stored(page);
  const editor = page.getByRole('textbox', { name: 'Runbook reordering editor' });
  const source = editor.locator('[data-fountain-path="2.1"]');
  const target = editor.locator('[data-fountain-path="3.0"]');
  await source.hover();
  const controls = page.locator('[data-fountain-block-controls]');
  await expect(controls).toHaveAttribute('data-fountain-block-path', '2.1');
  await expect(controls).toHaveAttribute('dir', direction);
  const handle = controls.getByRole('button', { name: 'Drag Paragraph block', exact: true });
  await handle.hover();
  await expect(source).toHaveAttribute('data-fountain-block-handle-active', 'true');
  await snapshot(page, info, `${direction}-hover`);
  await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox();
  const end = await target.boundingBox();
  if (!start || !end) throw new Error('Native drag needs visible source and target.');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 12, { steps: 5 });
  await page.mouse.move(end.x + end.width / 2, end.y + 3, { steps: 10 });
  // Deliver native dragover after dragenter with another physical pointer move.
  await page.mouse.move(end.x + end.width / 2 + 2, end.y + 4);
  const indicator = page.locator('[data-fountain-block-drop-indicator]');
  try {
    await expect(source).toHaveAttribute('data-fountain-block-grabbed', 'true');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveAttribute('dir', direction);
    await expect(indicator).toHaveAttribute('data-fountain-drop-path', '3.0');
    await expect(indicator).toHaveAttribute('data-fountain-drop-position', 'before');
    const geometry = await indicator.evaluate(element => {
      const marker = getComputedStyle(element, '::before');
      const controls = document.querySelector<HTMLElement>('[data-fountain-block-controls]')!;
      const editable = document.querySelector<HTMLElement>('[aria-label="Runbook reordering editor"]')!;
      const gutter = controls.getBoundingClientRect(), root = editable.getBoundingClientRect();
      return { direction: getComputedStyle(element).direction, left: marker.left, right: marker.right,
        controlsLeft: gutter.left, controlsRight: gutter.right, editorLeft: root.left, editorRight: root.right };
    });
    expect(direction === 'rtl' ? geometry.right : geometry.left).toBe('-4px');
    expect(direction === 'rtl' ? geometry.controlsRight <= geometry.editorRight : geometry.controlsLeft >= geometry.editorLeft).toBe(true);
    await snapshot(page, info, `${direction}-drag`);
    await writeFile(info.outputPath('block-direction-drag-observations.json'), JSON.stringify({ direction, geometry }, null, 2));
  } finally { await page.mouse.up(); }
  const moved = editor.locator('[data-fountain-path="3.0"]');
  await expect(moved).toContainText('Move this handover note');
  await expect(moved).toHaveAttribute('dir', 'rtl');
  const movedDoc = await stored(page);
  expect(movedDoc.content[3].content[0].attrs.nodeId).toBe(original.content[2].content[1].attrs.nodeId);
  expect(movedDoc.content[3].content[0].attrs.dir).toBe('rtl');
  expect(movedDoc.content[3].content[0].attrs.align).toBe('start');
  expect(movedDoc.content[2].content).toHaveLength(1);
  await snapshot(page, info, `${direction}-moved`);
  await moved.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Checked.');
  await expect(moved).toContainText('Checked.');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await stored(page)).toEqual(movedDoc);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await stored(page)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await stored(page)).toEqual(movedDoc);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Runbook reader preview' });
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await expect(reader.locator('[data-fountain-path="3.0"]')).toHaveAttribute('dir', 'rtl');
  await expect(reader.locator('[data-fountain-block-controls]')).toHaveCount(0);
  await reader.screenshot({ path: info.outputPath(`block-direction-${direction}-reader.png`) });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
  const download = await downloaded;
  await download.saveAs(info.outputPath('runbook.html'));
  const html = await readFile(info.outputPath('runbook.html'), 'utf8');
  expect(html).toContain('dir="rtl"');
  expect(html).not.toMatch(/data-fountain-block-(?:controls|grabbed|active|drop)/u);
  const exported = await page.context().newPage();
  await exported.setContent(html);
  await expect(exported.locator('blockquote[dir="ltr"] > p[dir="rtl"]')).toContainText('Move this handover note');
  await expect.poll(() => exported.locator('img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(320);
  await exported.screenshot({ path: info.outputPath(`block-direction-${direction}-export.png`), fullPage: true });
  await exported.close();
  expect(errors).toEqual([]);
}

export async function blockDirectionKeyboardJourney(page: Page, info: TestInfo) {
  const errors = await openLab(page, 'rtl');
  const original = await stored(page);
  const editor = page.getByRole('textbox', { name: 'Runbook reordering editor' });
  const observations: unknown[] = [];
  for (const index of [1, 4, 5, 6, 7, 8, 9]) {
    const block = editor.locator(`[data-fountain-path="${index}"]`);
    // Use the user-facing whole-block chooser, not a synthetic model selection
    // or a guessed two-pixel border inside an RTL container.
    await page.getByLabel('Choose a whole block').selectOption(original.content[index].attrs.nodeId);
    const controls = page.locator('[data-fountain-block-controls]');
    await expect(controls).toHaveAttribute('data-fountain-block-path', String(index));
    const handle = controls.locator('[data-fountain-block-action="drag"]');
    await handle.focus();
    if (index === 1) {
      await handle.press('ArrowLeft');
      await expect(controls.locator('[data-fountain-block-action="before"]')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(handle).toBeFocused();
    }
    await expect(block).toHaveAttribute('data-fountain-block-handle-active', 'true');
    await handle.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    await expect(block).toHaveAttribute('data-fountain-block-grabbed', 'true');
    await snapshot(page, info, `keyboard-${index}-grabbed`);
    await handle.press('ArrowDown');
    await expect(controls).toHaveAttribute('data-fountain-block-path', String(index + 1));
    await expect(handle).toBeFocused();
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    expect((await stored(page)).content[index + 1].attrs.nodeId).toBe(original.content[index].attrs.nodeId);
    await handle.press('Escape');
    await expect(handle).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await stored(page)).toEqual(original);
    observations.push({ index, nodeType: original.content[index].type, keyboardMoveAndUndo: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Editor direction').selectOption('ltr');
  await editor.locator('[data-fountain-path="1"]').hover();
  await expect(page.locator('[data-fountain-block-controls]')).toHaveAttribute('dir', 'ltr');
  const wrap = await editor.locator('[data-fountain-path="1"]').evaluate(element => ({ height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight) }));
  expect(wrap.height).toBeGreaterThan(wrap.lineHeight * 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await snapshot(page, info, 'narrow-ltr');
  await page.getByLabel('Editor direction').selectOption('rtl');
  await editor.locator('[data-fountain-path="1"]').hover();
  await expect(page.locator('[data-fountain-block-controls]')).toHaveAttribute('dir', 'rtl');
  await snapshot(page, info, 'narrow-rtl');
  await page.getByLabel('Editor direction').selectOption('auto');
  await editor.locator('[data-fountain-path="1"]').hover();
  await expect(page.locator('[data-fountain-block-controls]')).toHaveAttribute('dir', 'ltr');
  expect(await stored(page)).toEqual(original);
  await writeFile(info.outputPath('block-direction-keyboard-observations.json'), JSON.stringify({ observations, wrap, nativeMobileCertification: false }, null, 2));
  expect(errors).toEqual([]);
}
