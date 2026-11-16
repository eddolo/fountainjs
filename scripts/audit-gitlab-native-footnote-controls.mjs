import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/** Operates the actual author UI; observes DOM layout without injecting model state. */
export async function auditNativeFootnoteControls({ page, editor, toolbar, output, report }) {
  const viewport = page.viewportSize();
  const references = editor.locator('sup[data-fountain-footnote-reference]');
  const before = await editor.innerText();
  const rows = [];
  const focusedEditor = async phase => {
    await expect.poll(async () => {
      const focus = await editor.evaluate(el => ({ inside: el.contains(el.ownerDocument.activeElement),
        tag: el.ownerDocument.activeElement?.tagName, role: el.ownerDocument.activeElement?.getAttribute('role'),
        name: el.ownerDocument.activeElement?.getAttribute('aria-label') }));
      report.footnoteControlsFocus = { phase, ...focus }; return focus.inside;
    }).toBe(true);
  };
  const scan = async (panel, name) => {
    const result = await panel.evaluate(element => window.axe.run(element));
    expect(result.violations).toEqual([]);
    (report.footnoteControlsAccessibility ??= []).push({ name, violations: result.violations });
  };
  for (const width of [1440, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    await references.last().click(); await toolbar.scrollIntoViewIfNeeded();
    const group = toolbar.getByRole('group', { name: 'Document tools', exact: true });
    const trigger = group.getByRole('button', { name: 'Footnote actions', exact: true });
    await expect(trigger).toHaveText('Note');
    const insert = await group.getByRole('button', { name: 'Insert footnote', exact: true }).boundingBox();
    const note = await trigger.boundingBox(), bar = await toolbar.boundingBox();
    expect(Math.abs(insert.y - note.y)).toBeLessThanOrEqual(2);
    expect(await toolbar.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    if (width === 1440) expect(bar.height).toBeLessThanOrEqual(52);
    rows.push({ width, bar, insert, note });
    await toolbar.screenshot({ path: fileURLToPath(new URL(`note-toolbar-${width}.png`, output)) });
    await references.last().click(); await page.keyboard.press('Alt+F10');
    const menu = page.getByRole('dialog', { name: 'Footnote actions', exact: true });
    const edit = menu.getByRole('button', { name: 'Edit note text', exact: true });
    await expect(edit).toBeFocused();
    const rename = menu.getByRole('button', { name: 'Rename label', exact: true });
    const remove = menu.getByRole('button', { name: 'Remove this reference', exact: true });
    const removeNote = menu.getByRole('button', { name: 'Delete note and references', exact: true });
    const bounds = await Promise.all([edit, rename, remove, removeNote].map(button => button.boundingBox()));
    for (let index = 1; index < bounds.length; index++) {
      expect(bounds[index].y).toBeGreaterThanOrEqual(bounds[index - 1].y + bounds[index - 1].height);
      expect(Math.abs(bounds[index].x - bounds[0].x)).toBeLessThanOrEqual(2);
      expect(Math.abs(bounds[index].width - bounds[0].width)).toBeLessThanOrEqual(2);
    }
    expect(bounds[2].y - bounds[1].y - bounds[1].height).toBeGreaterThanOrEqual(12);
    expect(await remove.evaluate(button => parseFloat(getComputedStyle(button.parentElement).borderTopWidth))).toBeGreaterThanOrEqual(1);
    await scan(menu, `note-popup-${width}`);
    await menu.screenshot({ path: fileURLToPath(new URL(`note-actions-${width}.png`, output)) });
    await edit.press('Tab'); await expect(rename).toBeFocused(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Rename footnote label', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Footnote label', exact: true }).fill('Cancelled-layout-draft');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await editor.innerText()).toBe(before);
    await focusedEditor(`cancel-${width}`);
    await page.keyboard.press('Alt+F10'); await expect(edit).toBeFocused();
    await page.keyboard.press('Escape'); await expect(menu).toBeHidden();
    await focusedEditor(`escape-${width}`);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await references.last().click();
  const panel = toolbar.getByRole('group', { name: 'Footnote controls', exact: true });
  await expect(panel).toBeVisible();
  const group = toolbar.getByRole('group', { name: 'Document tools', exact: true });
  expect(await group.locator('[data-menu-mode="docked"]').count()).toBe(1);
  expect(await toolbar.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.keyboard.press('Alt+F10');
  await expect(panel.getByRole('button', { name: 'Edit note text', exact: true })).toBeFocused();
  await scan(panel, 'note-panel-360');
  await toolbar.screenshot({ path: fileURLToPath(new URL('note-toolbar-360.png', output)) });
  await panel.getByRole('button', { name: 'Rename label', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename footnote label', exact: true });
  await dialog.getByRole('textbox', { name: 'Footnote label', exact: true }).fill('Mobile-cancelled-draft');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden(); await focusedEditor('cancel-360');
  expect(await editor.innerText()).toBe(before);
  await page.setViewportSize(viewport);
  report.footnoteControlsLayout = rows;
  report.checks.push('Footnote trigger stays with Document tools at 1440/1100px, with stacked edit actions and separated removal; keyboard Tab/Enter/Escape, mobile full-width docking and cancelled drafts retain the document');
}
