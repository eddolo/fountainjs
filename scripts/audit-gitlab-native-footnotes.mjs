import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

export async function auditNativeFootnotes({ page, editor, toolbar, output, report }) {
  const definitions = () => editor.locator('[data-fountain-footnote-definition]');
  const references = () => editor.locator('sup[data-fountain-footnote-reference]');
  const main = editor.locator('p').filter({ hasText: 'End of the original description.' }).first();
  const installed = JSON.parse(await readFile(new URL('../artifacts/gitlab-native-browser-install/install.json', import.meta.url)));
  const require = createRequire(installed.source + '/storybook/package.json');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const audit = async (locator, name) => {
    const result = await locator.evaluate(element => window.axe.run(element));
    (report.footnoteAccessibility ??= []).push({ name, violations: result.violations });
    expect(result.violations).toEqual([]);
  };
  const selectionEvidence = async phase => {
    const selection = await editor.evaluate(element => {
      const native = element.ownerDocument.getSelection();
      const anchor = native?.anchorNode;
      const owner = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
      return { inside: Boolean(anchor && element.contains(anchor)), offset: native?.anchorOffset,
        paragraph: owner?.closest('p')?.textContent, path: owner?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') };
    });
    (report.footnoteSelections ??= []).push({ phase, ...selection });
  };
  const open = async () => {
    await main.click(); await selectionEvidence('clicked');
    await page.keyboard.press('End'); await selectionEvidence('end');
    await toolbar.getByRole('button', { name: 'Insert footnote', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert footnote', exact: true });
    await expect(dialog).toBeVisible(); return dialog;
  };
  let dialog = await open();
  await audit(dialog, 'insert-footnote-dialog');
  await dialog.getByRole('textbox', { name: 'Footnote text (Markdown)', exact: true }).fill('Cancelled note.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(definitions()).toHaveCount(0);
  dialog = await open();
  await dialog.getByRole('textbox', { name: 'Footnote text (Markdown)', exact: true }).fill('A service reliability note.');
  await dialog.getByRole('button', { name: 'Insert footnote', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(definitions()).toHaveCount(1); await expect(references()).toHaveCount(1);
  await expect(main.locator('sup[data-fountain-footnote-reference]')).toHaveCount(1);
  await editor.getByText('A service reliability note.', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.type(' Verified in Chrome.');
  await expect(definitions().first()).toContainText('Verified in Chrome.');
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(definitions()).toHaveCount(1); await expect(definitions().first()).not.toContainText('Verified in Chrome.');
  await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(definitions().first()).toContainText('Verified in Chrome.');
  dialog = await open();
  await dialog.getByRole('textbox', { name: 'Footnote text (Markdown)', exact: true }).fill('Second note body.');
  await dialog.getByRole('button', { name: 'Insert footnote', exact: true }).click();
  await expect(dialog).toBeHidden(); await expect(definitions()).toHaveCount(2);
  await expect(main.locator('sup[data-fountain-footnote-reference]')).toHaveCount(2);
  dialog = await open();
  const choice = dialog.getByRole('combobox', { name: 'Footnote to insert', exact: true });
  await choice.selectOption({ index: 1 });
  await expect(choice.locator('option:checked')).toContainText('A service reliability note.');
  await dialog.getByRole('button', { name: 'Insert reference', exact: true }).click();
  await expect(dialog).toBeHidden(); await expect(references()).toHaveCount(3); await expect(definitions()).toHaveCount(2);
  await expect(main.locator('sup[data-fountain-footnote-reference]')).toHaveCount(3);
  await references().last().click();
  await page.keyboard.press('Alt+F10');
  let menu = page.getByRole('dialog', { name: 'Footnote actions', exact: true });
  await expect(menu.getByRole('button', { name: 'Edit note text', exact: true })).toBeFocused();
  await menu.getByRole('button', { name: 'Remove this reference', exact: true }).click();
  await expect(references()).toHaveCount(2); await expect(definitions()).toHaveCount(2);
  await expect(main.locator('sup[data-fountain-footnote-reference]')).toHaveCount(2);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(references()).toHaveCount(3);
  report.checks.push('Real footnote dialog cancels without mutation, inserts and directly edits two native notes, undoes/redoes typing independently, and reuses a note without duplicating its definition; all three references stay in the chosen paragraph');
  await definitions().nth(1).locator('p').first().click();
  await toolbar.getByRole('button', { name: 'Footnote actions', exact: true }).click();
  menu = page.getByRole('dialog', { name: 'Footnote actions', exact: true });
  await expect(menu).toBeVisible();
  await audit(menu, 'definition-actions');
  await menu.getByRole('button', { name: 'Edit note text', exact: true }).press('Escape');
  expect(await editor.evaluate(element => element.contains(element.ownerDocument.activeElement))).toBe(true);
  await page.keyboard.press('Alt+F10');
  await expect(menu).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('footnote-controls.png', output)), fullPage: true });
  await menu.getByRole('button', { name: 'Delete note and references', exact: true }).click();
  await expect(definitions()).toHaveCount(1); await expect(references()).toHaveCount(2);
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(definitions()).toHaveCount(2); await expect(references()).toHaveCount(3);
  const viewport = page.viewportSize();
  dialog = await open();
  await dialog.getByRole('textbox', { name: 'Footnote text (Markdown)', exact: true }).fill('Mobile retained draft.');
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(dialog.getByRole('textbox', { name: 'Footnote text (Markdown)', exact: true })).toHaveValue('Mobile retained draft.');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await audit(dialog, 'mobile-insert-footnote-dialog');
  await page.screenshot({ path: fileURLToPath(new URL('footnote-mobile-draft.png', output)), fullPage: true });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize(viewport);
  await expect(definitions()).toHaveCount(2); await expect(references()).toHaveCount(3);
  await editor.getByRole('img', { name: 'Uploaded baseline figure', exact: true }).click();
  const media = page.getByRole('dialog', { name: 'Media actions', exact: true });
  await expect(media).toBeVisible();
  await toolbar.scrollIntoViewIfNeeded();
  const bar = await toolbar.boundingBox();
  const attach = await toolbar.getByRole('button', { name: 'Attach a file or image', exact: true }).boundingBox();
  const paste = await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).boundingBox();
  const trigger = await toolbar.getByRole('button', { name: 'Media actions', exact: true }).boundingBox();
  expect(bar.height).toBeLessThanOrEqual(52);
  expect(Math.abs(attach.y - paste.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(trigger.y - paste.y)).toBeLessThanOrEqual(2);
  const properties = await media.getByRole('button', { name: 'Edit media properties', exact: true }).boundingBox();
  const remove = await media.getByRole('button', { name: 'Delete media', exact: true }).boundingBox();
  expect(remove.y).toBeGreaterThan(properties.y + properties.height + 12);
  report.footnoteToolbarLayout = { bar, attach, paste, trigger, properties, remove };
  await audit(media, 'current-media-actions');
  await toolbar.screenshot({ path: fileURLToPath(new URL('footnote-toolbar-ui.png', output)) });
  await media.screenshot({ path: fileURLToPath(new URL('footnote-media-controls.png', output)) });
  await main.click();
  report.nativeFootnotes = { definitions: 2, references: 3,
    bodies: ['A service reliability note. Verified in Chrome.', 'Second note body.'] };
  report.checks.push('Keyboard-accessible controls remove one reference without deleting its body, or delete a whole note and its references; Undo restores both operations; a 360px dialog retains its draft and cancels without inserting');
  report.checks.push('Current desktop toolbar keeps attachment, paste and media actions on one row; media deletion remains visibly separated; note dialogs and note/media controls pass scoped accessibility checks');
}

export async function assertSavedNativeFootnotes({ page, description, report, phase }) {
  expect(description).toContain('End of the original description.[^1][^2][^1]');
  expect(description).not.toContain('<p data-fountain-empty=');
  const reader = page.getByTestId('work-item-description');
  const notes = reader.locator('section[data-footnotes] > ol > li');
  for (const text of report.nativeFootnotes.bodies) {
    await expect(notes.filter({ hasText: text })).toHaveCount(1);
    expect(description).toContain(text);
  }
  await expect(notes).toHaveCount(report.nativeFootnotes.definitions);
  await expect(reader.locator('sup a[data-footnote-ref]')).toHaveCount(report.nativeFootnotes.references);
  report.checks.push(`Native footnote bodies, two definitions and three references agree with the actual saved GitLab Markdown and reader (${phase})`);
}
