import assert from 'node:assert/strict';
import { join } from 'node:path';
import { expect } from '@playwright/test';

const lead = '<h2>Editor’s note</h2>';
const opening = '<p>Before the review.</p>';
const middle = '<p>Keep <strong>this evidence</strong>.</p>';
const closing = '<p>After the review.</p>';
const tail = '<p>Attribution.</p>';
const initial = lead + opening + middle + closing + tail;
const quoted = lead + '<blockquote>' + opening + middle + closing + '</blockquote>' + tail;
const split = lead + '<blockquote>' + opening + '</blockquote>' + middle + '<blockquote>' + closing + '</blockquote>' + tail;

export async function auditQuote({ side, api, collection, selectInterface, openItem, out, report }) {
  const name = side === 'stock' ? 'input-rich-text-html' : 'fountain-rich-text-html';
  await selectInterface(name, { toolbar: ['blockquote', 'undo', 'redo'] });
  const item = await api('/items/' + collection, { method: 'POST', body: JSON.stringify({ body: initial }) });
  const path = '/items/' + collection + '/' + item.id;
  const route = '/admin/content/' + collection + '/' + item.id;
  const field = await openItem(side, route);
  const button = (view, label, icon) => side === 'stock'
    ? view.page.locator('.wysiwyg .toolbar button').filter({ has: view.page.locator('[data-icon="' + icon + '"]') })
    : view.page.getByRole('button', { name: label, exact: true });
  report.stage = side + ' quote three selected paragraphs';
  await field.editor.getByText('After the review.').click();
  await field.page.keyboard.press('End');
  await field.page.keyboard.press('Shift+ArrowUp');
  await field.page.keyboard.press('Shift+ArrowUp');
  await field.page.keyboard.press('Shift+Home');
  await expect.poll(() => field.page.evaluate(() => window.getSelection().toString().trim().replace(/\s+/g, ' ')))
    .toBe('Before the review. Keep this evidence. After the review.');
  await button(field, 'Block quote', 'format_quote').click();
  await expect(field.editor.locator('blockquote > p')).toHaveCount(3);
  assert.equal((await api(path)).body, initial);
  await field.page.keyboard.press('Control+s');
  await expect.poll(async () => (await api(path)).body).toBe(quoted);
  await field.context.close();

  const fresh = await openItem(side, route);
  const quote = fresh.editor.locator('blockquote');
  await expect(quote.locator('strong')).toHaveText('this evidence');
  const geometry = await quote.evaluate(node => {
    const style = getComputedStyle(node);
    return { border: style.borderInlineStartWidth, indent: style.paddingInlineStart,
      inset: node.getBoundingClientRect().left - node.parentElement.getBoundingClientRect().left };
  });
  await fresh.editor.screenshot({ path: join(out, side + '-quote.png') });
  report.stage = side + ' lift only the middle quoted paragraph';
  await fresh.editor.getByText('this evidence').click();
  await fresh.page.keyboard.press('End');
  const control = button(fresh, 'Block quote', 'format_quote');
  if (side === 'fountain') await expect(control).toHaveAttribute('aria-pressed', 'true');
  await control.click();
  await expect(fresh.editor.locator('blockquote')).toHaveCount(2);
  await expect(quote.locator('p')).toHaveText(['Before the review.', 'After the review.']);
  await expect(fresh.editor).toBeFocused();
  await button(fresh, 'Undo', 'undo').click();
  await expect(quote.locator('p')).toHaveCount(3);
  await button(fresh, 'Redo', 'redo').click();
  await expect(quote).toHaveCount(2);
  await expect(fresh.editor).toBeFocused();
  await fresh.page.keyboard.insertText(' Verified.');
  const middleEdited = split.replace('evidence</strong>.', 'evidence</strong>. Verified.');
  await fresh.page.keyboard.press('Control+s');
  await expect.poll(async () => (await api(path)).body).toBe(middleEdited);
  await fresh.context.close();

  const writing = await openItem(side, route);
  report.stage = side + ' leave a quote with Enter and continue typing';
  const lastQuote = writing.editor.locator('blockquote').last();
  await lastQuote.locator('p').click({ position: { x: 4, y: 8 } });
  await writing.page.keyboard.press('End');
  await expect.poll(() => writing.page.evaluate(() => {
    const caret = window.getSelection();
    return [caret?.anchorNode?.textContent, caret?.anchorOffset];
  })).toEqual(['After the review.', 'After the review.'.length]);
  const keyboard = [];
  const captureCaret = async () => writing.editor.evaluate(root => {
    const caret = window.getSelection();
    const pos = root.editor?.state?.selection?.$head;
    return {
      blocks: [...root.children].map(node => [node.localName, node.textContent, node.childElementCount]),
      browser: [caret.anchorNode?.textContent, caret.anchorOffset],
      model: pos ? [pos.parent.textContent, pos.parentOffset] : null,
    };
  });
  report.quoteKeyboard ??= {};
  report.quoteKeyboard[side] = keyboard;
  if (side === 'stock') {
    await expect.poll(async () => (await captureCaret()).model).toEqual(['After the review.', 'After the review.'.length]);
  }
  keyboard.push(await captureCaret());
  await writing.page.keyboard.press('Enter');
  keyboard.push(await captureCaret());
  await writing.page.keyboard.press('Enter');
  keyboard.push(await captureCaret());
  await writing.page.keyboard.insertText('Follow-up.');
  const outside = writing.editor.getByText('Follow-up.', { exact: true });
  await expect(outside).toBeVisible();
  assert.equal(await outside.evaluate(node => Boolean(node.closest('blockquote'))), false);
  const revised = middleEdited.replace(tail, '<p>Follow-up.</p>' + tail);
  await writing.page.keyboard.press('Control+s');
  await expect.poll(async () => (await api(path)).body).toContain('Follow-up.');
  const actual = (await api(path)).body;
  assert.equal(actual, revised);
  await writing.context.close();
  return { item: item.id, quoted, revised: actual, geometry, exitAtExpectedPosition: actual === revised };
}
