import assert from 'node:assert/strict';
import { join } from 'node:path';
import { expect } from '@playwright/test';

const initial = '<p>Publication brief.</p>';
const revised = '<p>Reviewed by <strong>Ada</strong>.</p>';
const legacy = '<marquee>Legacy wording.</marquee>';
const retained = "<marquee data-edition='print'>Reviewed wording.</marquee>";

export async function auditSource({ side, api, collection, selectInterface, openItem, out, report }) {
  const stock = side === 'stock';
  const name = stock ? 'input-rich-text-html' : 'fountain-rich-text-html';
  await selectInterface(name, { toolbar: ['code', 'undo', 'redo'] });
  async function record(body) {
    const item = await api('/items/' + collection, { method: 'POST', body: JSON.stringify({ body }) });
    return { id: item.id, path: '/items/' + collection + '/' + item.id, route: '/admin/content/' + collection + '/' + item.id };
  }
  function openDrawer(page) {
    return stock ? page.locator('.wysiwyg .toolbar button:has([data-icon="html"])').click()
      : page.getByRole('button', { name: 'Edit HTML source', exact: true }).click();
  }
  async function enterSource(page, value, inline = false) {
    const surface = inline ? page.locator('.wysiwyg') : page.locator('.v-drawer');
    if (stock) {
      await surface.locator('.CodeMirror-lines').click();
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText(value);
      await expect(surface.locator('.CodeMirror-code')).toContainText(value);
    } else {
      await surface.getByRole('textbox', { name: 'HTML source' }).fill(value);
    }
  }
  async function apply(page) {
    const drawer = page.locator('.v-drawer');
    if (stock) {
      await drawer.locator('.header-button').filter({ hasText: /^Save$/ })
        .or(drawer.locator('.header-button:has([data-icon="check"])')).click();
    } else {
      await drawer.getByRole('button', { name: 'Apply source' }).click();
    }
    await expect(drawer).toHaveCount(0);
  }
  const brief = await record(initial);
  const field = await openItem(side, brief.route);
  const { editor, page } = field;
  report.stage = side + ' cancel a source edit';
  await openDrawer(page);
  await enterSource(page, '<p>Discard this edit.</p>');
  await page.locator('.v-drawer .close-button').click();
  await expect(page.locator('.v-drawer')).toHaveCount(0);
  await expect(editor.locator('p')).toHaveText('Publication brief.');
  report.stage = side + ' apply HTML then save item';
  await openDrawer(page);
  await enterSource(page, revised);
  await apply(page);
  await expect(editor.locator('strong')).toHaveText('Ada');
  if (!stock) {
    await page.getByRole('button', {name:'Undo',exact:true}).click();
    await expect(editor.locator('p')).toHaveText('Publication brief.');
    await page.getByRole('button', {name:'Redo',exact:true}).click();
    await expect(editor.locator('strong')).toHaveText('Ada');
  }
  assert.equal((await api(brief.path)).body, initial);
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await api(brief.path)).body).toBe(revised);
  await field.context.close();
  const reopened = await openItem(side, brief.route);
  await expect(reopened.editor.locator('strong')).toHaveText('Ada');
  await reopened.context.close();

  const archive = await record(legacy);
  const raw = await openItem(side, archive.route, { protectedSource: true });
  report.stage = side + ' edit a stored HTML fragment as text';
  if (stock) {
    await raw.editor.click();
    await raw.page.getByRole('button', { name: 'Edit Raw HTML' }).click();
    await enterSource(raw.page, retained, true);
  } else {
    await expect(raw.editor.locator('pre')).toHaveText(legacy);
    await openDrawer(raw.page);
    await enterSource(raw.page, retained);
    await raw.page.locator('.v-drawer').screenshot({path:join(out,'source-drawer.png')});
    await apply(raw.page);
    await expect(raw.editor.locator('pre')).toHaveText(retained);
  }
  assert.equal((await api(archive.path)).body, legacy);
  await raw.page.keyboard.press('Control+s');
  await expect.poll(async () => (await api(archive.path)).body).toBe(retained);
  await raw.context.close();
  const protectedItem = await openItem(side, archive.route, { protectedSource: true });
  if (stock) {
    await protectedItem.editor.click();
    await protectedItem.page.getByRole('button', {name:'Edit Raw HTML'}).click();
    await expect(protectedItem.page.locator('.wysiwyg .CodeMirror-code')).toContainText(retained);
  } else {
    await expect(protectedItem.editor.locator('pre')).toHaveText(retained);
    await openDrawer(protectedItem.page);
    await enterSource(protectedItem.page, revised);
    await apply(protectedItem.page);
    await expect(protectedItem.editor.locator('.fountain-editor strong')).toHaveText('Ada');
    await protectedItem.page.keyboard.press('Control+s');
    await expect.poll(async () => (await api(archive.path)).body).toBe(revised);
  }
  await protectedItem.context.close();
  let preservedLineEndings;
  if (!stock) {
    report.stage = 'retain physical line endings in edited source';
    const mixed = "<marquee data-edition='print'>\r\nFirst line.\r\n\nSecond line.\rLast line.\r\n</marquee>";
    const exact = await record(mixed);
    const session = await openItem(side, exact.route, { protectedSource: true });
    await openDrawer(session.page);
    const input = session.page.getByRole('textbox', {name:'HTML source'});
    await expect(input).toHaveValue(mixed.replace(/\r\n?/g, '\n'));
    await input.focus();
    await session.page.keyboard.press('Control+Home');
    await session.page.keyboard.press('ArrowDown');
    await session.page.keyboard.press('End');
    await session.page.keyboard.insertText(' Edited.');
    await apply(session.page);
    await session.page.keyboard.press('Control+s');
    const expected = mixed.replace('First line.', 'First line. Edited.');
    await expect.poll(async () => (await api(exact.path)).body).toBe(expected);
    await session.context.close();
    const blank = await openItem(side, exact.route, { protectedSource: true });
    await openDrawer(blank.page);
    const source = blank.page.getByRole('textbox', { name: 'HTML source' });
    await source.focus();
    await blank.page.keyboard.press('Control+Home');
    await blank.page.keyboard.press('ArrowDown');
    await blank.page.keyboard.press('ArrowDown');
    await blank.page.keyboard.press('Home');
    await blank.page.keyboard.press('Backspace');
    await apply(blank.page);
    await blank.page.keyboard.press('Control+s');
    const afterBackspace = expected.replace('Edited.\r\n\n', 'Edited.\n');
    await expect.poll(async () => (await api(exact.path)).body).toBe(afterBackspace);
    await blank.context.close();
    preservedLineEndings = { item: exact.id, saved: expected, afterBackspace };

    report.stage = 'read-only field with preserved HTML';
    await api('/fields/' + collection + '/body', {
      method:'PATCH', body: JSON.stringify({meta:{readonly:true}}),
    });
    try {
      const readOnly = await openItem(side, exact.route, {protectedSource:true});
      await expect(readOnly.editor.locator('pre')).toBeVisible();
      await expect(readOnly.editor.getByRole('button')).toHaveCount(0);
      assert.equal((await api(exact.path)).body, afterBackspace);
      await readOnly.context.close();
    } finally {
      await api('/fields/' + collection + '/body', {
        method:'PATCH', body: JSON.stringify({meta:{readonly:false}}),
      });
    }
  }
  return { brief: brief.id, archived: archive.id, savedHTML: revised, preservedHTML: retained, preservedLineEndings };
}
