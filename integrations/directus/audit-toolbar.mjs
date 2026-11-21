import assert from 'node:assert/strict';
import { join } from 'node:path';
import { expect } from '@playwright/test';

const formats = [
  ['bold', 'Bold', 'format_bold', 'strong'],
  ['italic', 'Italic', 'format_italic', 'em'],
  ['underline', 'Underline', 'format_underlined', 'u'],
  ['strikethrough', 'Strikethrough', 'strikethrough_s', 's'],
  ['subscript', 'Subscript', 'subscript', 'sub'],
  ['superscript', 'Superscript', 'superscript', 'sup'],
];
const buttons = ['undo', 'redo', ...formats.map(([key]) => key)];
const source = formats.map(([, label]) => '<p>Keep ' + label + '</p>').join('');
const expected = formats.map(([, label,, tag]) => '<p>Keep <' + tag + '>' + label + '</' + tag + '></p>').join('');

export async function auditToolbar({ side, api, collection, selectInterface, openItem, out, report }) {
  const name = side === 'stock' ? 'input-rich-text-html' : 'fountain-rich-text-html';
  await selectInterface(name, { toolbar: buttons });
  const record = await api('/items/' + collection, { method: 'POST', body: JSON.stringify({ body: source }) });
  const path = '/items/' + collection + '/' + record.id;
  const route = '/admin/content/' + collection + '/' + record.id;
  const { editor, page, context } = await openItem(side, route);
  const group = page.locator(side === 'stock' ? '.wysiwyg .toolbar' : '.fountain-directus-toolbar');
  const button = (label, icon) => side === 'stock'
    ? group.locator('button').filter({ has: page.locator('[data-icon="' + icon + '"]') })
    : group.getByRole('button', { name: label, exact: true });
  await expect(group.locator('button')).toHaveCount(buttons.length);
  await expect(button('Undo', 'undo')).toBeDisabled();
  for (const [index, [, label, icon, tag]] of formats.entries()) {
    report.stage = side + ' toolbar: select and apply ' + label;
    const paragraph = editor.locator('p').nth(index);
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Control+Shift+ArrowLeft');
    await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe(label);
    await button(label, icon).click();
    await expect(paragraph.locator(tag)).toHaveText(label);
    if (side === 'fountain') await expect(button(label, icon)).toHaveAttribute('aria-pressed', 'true');
  }
  report.stage = side + ' toolbar: undo and redo';
  await button('Undo', 'undo').click();
  await expect(editor.locator('sup')).toHaveCount(0);
  await button('Redo', 'redo').click();
  await expect(editor.locator('sup')).toHaveText('Superscript');
  assert.equal((await api(path)).body, source);
  await group.screenshot({ path: join(out, side + '-toolbar.png') });
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await api(path)).body).toBe(expected);
  await context.close();

  // The same stored item also opens with all formatting controls switched off.
  await selectInterface(name, { toolbar: [] });
  const empty = await openItem(side, route);
  await expect(empty.editor.locator('sup')).toHaveText('Superscript');
  await expect(empty.page.locator(side === 'stock' ? '.wysiwyg .toolbar button' : '.fountain-directus-toolbar button')).toHaveCount(0);
  let adminConfiguration;
  if (side === 'fountain') {
    const settings = empty.page;
    report.stage = 'configure toolbar through Data Model';
    const origin = new URL(settings.url()).origin;
    await settings.goto(origin + '/admin/settings/data-model/' + collection + '/body');
    await settings.getByText('Interface', { exact: true }).click();
    const selector = settings.locator('[data-field="toolbar"] .v-input');
    await selector.click();
    await settings.getByText('Italic', { exact: true }).click();
    await settings.locator('.v-drawer .sidebar').click({ position: { x: 4, y: 4 } });
    await settings.locator('[data-field="toolbar"]').screenshot({ path: join(out, 'toolbar-settings.png') });
    await settings.locator('.v-drawer .header-button').filter({ hasText: /^Save$/ })
      .or(settings.locator('.v-drawer .header-button:has([data-icon="check"])')).click();
    await expect.poll(async () => (await api('/fields/' + collection + '/body')).meta.options.toolbar).toEqual(['italic']);

    const author = await openItem(side, route);
    const toolbar = author.page.getByRole('group', { name: 'Rich text formatting' });
    await expect(toolbar.getByRole('button')).toHaveCount(1);
    const italic = toolbar.getByRole('button', { name: 'Italic' });
    const paragraph = author.editor.locator('p').nth(1);
    await paragraph.click();
    await author.page.keyboard.press('End');
    await author.page.keyboard.press('Control+Shift+ArrowLeft');
    await expect(italic).toHaveAttribute('aria-pressed', 'true');
    await italic.focus();
    await author.page.keyboard.press('Space');
    await expect(paragraph.locator('em')).toHaveCount(0);
    await expect(author.editor).toBeFocused();
    const saved = expected.replace('<em>Italic</em>', 'Italic');
    await author.page.keyboard.press('Control+s');
    await expect.poll(async () => (await api(path)).body).toBe(saved);
    adminConfiguration = { toolbar: ['italic'], keyboardSaved: saved };
    await author.context.close();
  }
  await empty.context.close();
  return { adminConfiguration, item: record.id, configured: buttons, saved: expected, emptyConfigurationButtons: 0 };
}
