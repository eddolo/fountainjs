import { expect, type Page, type TestInfo } from '@playwright/test';

export async function modelIntegrityJourney(page: Page, info: TestInfo): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  const editor = page.getByRole('textbox', { name: 'Browser contract editor', exact: true });
  const before = await page.evaluate(() => {
    const api = (globalThis as any).fountainBrowserTest;
    const schema = api.editor.state.schema;
    const attrs = JSON.parse('{"constructor":"retained","__proto__":{"literal":true},"标签":"α\\r\\nβ"}');
    const doc = schema.node('doc', {}, [schema.node('paragraph', attrs, [
      schema.text('Original link', [schema.mark('link', { href: '/safe', ...attrs })]).withAttrs(attrs),
    ])]);
    api.editor.dispatch(api.editor.createTransaction().replaceDocument(doc).setMeta('addToHistory', false));
    const original = api.editor.state.doc;
    const json = original.toJSON();
    const text = original.child(0).child(0);
    const mark = text.marks[0];
    const attempts = [Reflect.set(text, 'text', 'Tampered'), Reflect.set(text, 'type', null),
      Reflect.set(original, 'content', []), Reflect.set(mark, 'attrs', { href: '/changed' }),
      Reflect.deleteProperty(text, 'text'), Reflect.defineProperty(mark, 'type', { value: null })];
    api.modelIntegritySnapshot = original;
    schema.validate(original);
    return { json, attempts, unchanged: JSON.stringify(json) === JSON.stringify(original.toJSON()),
      nodeKeys: Object.keys(original.child(0).attrs), markKeys: Object.keys(mark.attrs) };
  });
  expect(before.attempts).toEqual([false, false, false, false, false, false]);
  expect(before.unchanged).toBe(true);
  expect(before.nodeKeys).toEqual(expect.arrayContaining(['constructor', '__proto__', '标签']));
  expect(before.markKeys).toEqual(expect.arrayContaining(['constructor', '__proto__', '标签']));
  await expect(editor.locator('p')).toHaveText('Original link');
  await expect(editor.locator('a')).toHaveAttribute('href', '/safe');
  await editor.locator('p').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('Reviewed: ');
  await expect(editor.locator('p')).toHaveText('Reviewed: Original link');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.locator('p')).toHaveText('Original link');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON())).toEqual(before.json);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor.locator('p')).toHaveText('Reviewed: Original link');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second paragraph');
  await expect(editor.locator('p')).toHaveCount(2);
  await expect(editor.locator('p').last()).toHaveText('Second paragraph');
  const result = await page.evaluate(() => {
    const api = (globalThis as any).fountainBrowserTest;
    const current = api.editor.getJSON();
    return { historical: api.modelIntegritySnapshot.toJSON(), current,
      reopened: api.editor.state.schema.nodeFromJSON(JSON.parse(JSON.stringify(current))).toJSON() };
  });
  expect(result.historical).toEqual(before.json);
  expect(result.reopened).toEqual(result.current);
  expect(result.current.content[0].attrs).toEqual(before.json.content[0].attrs);
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('immutable-model-real-editing.png') });
}
