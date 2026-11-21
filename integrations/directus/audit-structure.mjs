import assert from 'node:assert/strict';
import { join } from 'node:path';
import { expect } from '@playwright/test';

const initial = '<p>Release notes</p><p>Highlights</p><p>Pack <strong>assets</strong>.</p><p>Ship build.</p><p>Owner: Ava.</p>';
const final = '<h2>Release notes</h2><h2>Highlights</h2><ol><li><p>Pack <strong>assets</strong>.</p></li><li><p>Ship build.</p></li></ol><p>Owner: Ava.</p>';

export async function auditStructure({ side, api, collection, selectInterface, openItem, out, report }) {
  const name = side === 'stock' ? 'input-rich-text-html' : 'fountain-rich-text-html';
  const levels = [1, 2, 3, 4, 5, 6];
  await selectInterface(name, { toolbar: [...levels.map(level => 'h' + level), 'numlist', 'bullist'] });
  const item = await api('/items/' + collection, { method: 'POST', body: JSON.stringify({ body: initial }) });
  const resource = '/items/' + collection + '/' + item.id;
  const route = '/admin/content/' + collection + '/' + item.id;
  const { page, editor, context } = await openItem(side, route);
  const control = (label, icon) => side === 'stock'
    ? page.locator('.wysiwyg .toolbar button').filter({ has: page.locator('[data-icon="' + icon + '"]') })
    : page.getByRole('button', { name: label, exact: true });
  const heading = level => control('Heading ' + level, 'format_h' + level);
  const numbered = control('Numbered list', 'format_list_numbered');
  const bulleted = control('Bulleted list', 'format_list_bulleted');
  async function selectPair(first, last) {
    await editor.getByText(last, { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+Home');
    await expect.poll(() => page.evaluate(() => window.getSelection().toString().trim().replace(/\s+/g, ' '))).toBe(first + ' ' + last);
  }

  report.stage = side + ' apply and remove heading levels';
  await editor.getByText('Release notes', { exact: true }).click();
  for (const level of levels) {
    await heading(level).click();
    await expect(editor.locator('h' + level)).toHaveText('Release notes');
    if (side === 'fountain') await expect(heading(level)).toHaveAttribute('aria-pressed', 'true');
    await heading(level).click();
    await expect(editor.locator('p').first()).toHaveText('Release notes');
  }
  report.stage = side + ' format selected headings';
  await selectPair('Release notes', 'Highlights');
  await heading(2).click();
  await expect(editor.locator('h2')).toHaveText(['Release notes', 'Highlights']);

  report.stage = side + ' wrap, switch and remove a two-item list';
  await selectPair('Pack assets.', 'Ship build.');
  await bulleted.click();
  await expect(editor.locator('ul > li')).toHaveCount(2);
  await selectPair('Pack assets.', 'Ship build.');
  await numbered.click();
  await expect(editor.locator('ol > li')).toHaveCount(2);
  await selectPair('Pack assets.', 'Ship build.');
  await numbered.click();
  await expect(editor.locator('li')).toHaveCount(0);
  await selectPair('Pack assets.', 'Ship build.');
  await numbered.click();
  await expect(editor.locator('ol > li')).toHaveCount(2);
  assert.equal((await api(resource)).body, initial);
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await api(resource)).body).toBe(final);
  await context.close();

  const fresh = await openItem(side, route);
  await expect(fresh.editor.locator('h2')).toHaveText(['Release notes', 'Highlights']);
  await expect(fresh.editor.locator('ol > li')).toHaveText(['Pack assets.', 'Ship build.']);
  await expect(fresh.editor.locator('ol strong')).toHaveText('assets');
  const marker = await fresh.editor.locator('ol > li').first().evaluate(item => {
    const style = getComputedStyle(item);
    return { display: style.display, type: style.listStyleType, indent: getComputedStyle(item.parentElement).paddingInlineStart };
  });
  assert.equal(marker.display, 'list-item');
  assert.equal(marker.type, 'decimal');
  await fresh.editor.screenshot({ path: join(out, side + '-structure.png') });
  report.stage = side + ' switch list type at a caret';
  await fresh.editor.getByText('Ship build.', { exact: true }).click();
  await fresh.page.keyboard.press('End');
  const bullet = side === 'stock'
    ? fresh.page.locator('.wysiwyg .toolbar button:has([data-icon="format_list_bulleted"])')
    : fresh.page.getByRole('button', { name: 'Bulleted list', exact: true });
  await bullet.click();
  await expect(fresh.editor).toBeFocused();
  await expect.poll(() => fresh.page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest('li')?.textContent)).toBe('Ship build.');
  await fresh.page.keyboard.insertText(' Ready.');
  const switched = await fresh.editor.locator('li').evaluateAll(items =>
    items.map(item => ({ type: item.parentElement.localName, text: item.textContent })));
  report.caretListSwitch ??= {};
  report.caretListSwitch[side] = switched;
  const switchedHTML = final.replace('<ol>', '<ul>').replace('</ol>', '</ul>').replace('Ship build.', 'Ship build. Ready.');
  assert.deepEqual(switched, [{type:'ul',text:'Pack assets.'}, {type:'ul',text:'Ship build. Ready.'}]);
  await fresh.page.keyboard.press('Control+s');
  await expect.poll(async () => (await api(resource)).body).toBe(switchedHTML);
  await fresh.context.close();
  return { item: item.id, levels, saved: final, marker, switchedHTML };
}
