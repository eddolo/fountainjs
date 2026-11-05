import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { Editor } from '../../src/core';

test('native split undo and redo preserve later independent host text edits and visible paragraphs', async ({ page }, info) => {
  const errors: string[] = [], observations: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const replacement of ['', 'BB']) {
    await page.goto('/browser-tests.html');
    const expected = await page.evaluate(() => {
      const { editor } = (globalThis as unknown as { fountainBrowserTest: { editor: Editor } }).fountainBrowserTest;
      const source = editor.state.schema.nodeFromJSON({ type: 'doc', attrs: { audit: 'native independent edit' }, content:
        ['Before', 'Alpha', 'After'].map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })) });
      editor.dispatch(editor.createTransaction().replaceDocument(source).setMeta('addToHistory', false));
      return source.toJSON();
    });
    const editor = page.getByRole('textbox', { name: 'Browser contract editor', exact: true });
    const target = editor.locator(':scope > p').filter({ hasText: /^Alpha$/ });
    await target.click(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(editor.locator(':scope > p')).toHaveText(['Before', 'Al', 'pha', 'After']);
    const geometry = await editor.locator(':scope > p').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, height: rect.height };
    }));
    expect(geometry[2]!.top).toBeGreaterThanOrEqual(geometry[1]!.bottom);
    await editor.screenshot({ path: info.outputPath(`split-${replacement || 'deletion'}.png`) });
    // The host edit is intentionally independent of the user's local history.
    // This is not a Yjs exchange or a claim about the separate CRDT failures.
    await page.evaluate(text => {
      const { editor } = (globalThis as unknown as { fountainBrowserTest: { editor: Editor } }).fountainBrowserTest;
      editor.dispatch(editor.createTransaction().replaceText([2, 0], 0, 1, text).setMeta('addToHistory', false));
    }, replacement);
    await expect(editor.locator(':scope > p')).toHaveText(['Before', 'Al', `${replacement}ha`, 'After']);
    await page.keyboard.press('Control+z');
    await expect(editor.locator(':scope > p')).toHaveText(['Before', `Al${replacement}ha`, 'After']);
    const readModel = () => page.evaluate(() =>
      (globalThis as unknown as { fountainBrowserTest: { editor: Editor } }).fountainBrowserTest.editor.getJSON());
    const undone = await readModel();
    expect(undone.attrs).toEqual(expected.attrs);
    expect(undone.content![0]).toEqual(expected.content![0]);
    expect(undone.content![2]).toEqual(expected.content![2]);
    await editor.screenshot({ path: info.outputPath(`undo-${replacement || 'deletion'}.png`) });
    await page.keyboard.press('Control+Shift+z');
    await expect(editor.locator(':scope > p')).toHaveText(['Before', 'Al', `${replacement}ha`, 'After']);
    const redone = await readModel();
    expect(redone.attrs).toEqual(expected.attrs);
    expect(redone.content![0]).toEqual(expected.content![0]);
    expect(redone.content![3]).toEqual(expected.content![2]);
    await editor.screenshot({ path: info.outputPath(`redo-${replacement || 'deletion'}.png`) });
    observations.push({ replacement, geometry, undone, redone });
  }
  expect(errors).toEqual([]);
  await writeFile(info.outputPath('history-observations.json'), JSON.stringify({ engine: info.project.name, observations, errors }, null, 2));
});
