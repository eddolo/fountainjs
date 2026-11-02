import { expect, test, type Locator } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const directions = (root: Locator) => root.locator('p').evaluateAll(elements => elements
  .filter(element => element.textContent?.trim()).map(element => ({
    text: element.textContent, direction: getComputedStyle(element).direction,
  })));

// HTML auto with no strong text falls back to LTR, not the RTL parent. Check
// the actual browsers and public UI, rather than inventing provenance attrs.
// https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute
for (const parent of ['ltr', 'rtl'] as const) test(`weak-only shared auto scope under ${parent} parent`, async ({ page }, info) => {
  const source = `<ul dir="${parent}"><li><p>Outer parent</p><ol dir="auto" start="0"><li><p>123 😀</p></li><li><p>456 😀</p></li><li><p>789 😀</p></li></ol></li><li><p>Outer after</p></li></ul>`;
  const native = await page.context().newPage();
  const observations: Record<string, unknown> = { source, parent };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await native.setContent(source);
    const weakReference = await directions(native.locator('body'));
    observations.weakReference = weakReference;
    expect(weakReference.slice(1, 4).map(entry => entry.direction)).toEqual(['ltr', 'ltr', 'ltr']);
    await native.setContent(source.replace('123 😀', 'שלום 123 😀'));
    const strongReference = await directions(native.locator('body'));
    observations.strongReference = strongReference;

    await page.goto('/conversion-lab.html');
    const name = `weak-${parent}.html`;
    await page.getByLabel('Choose documents').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) });
    const workspace = page.getByRole('region', { name: `Conversion workspace: ${name}`, exact: true });
    const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
    const download = async (format: 'json' | 'html') => {
      await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption(format);
      const pending = page.waitForEvent('download');
      await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
      return readFile((await (await pending).path())!, 'utf8');
    };
    const original = JSON.parse(await download('json'));
    expect(await directions(editor)).toEqual(weakReference);
    await editor.locator('p').filter({ hasText: '456 😀' }).click();
    await workspace.getByRole('button', { name: 'Lift list item', exact: true }).click();
    expect(await directions(editor)).toEqual(weakReference);
    const transformed = JSON.parse(await download('json'));
    observations.transformed = transformed;
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(JSON.parse(await download('json'))).toEqual(original);
    await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
    expect(JSON.parse(await download('json'))).toEqual(transformed);
    await native.setContent(await download('html'));
    expect(await directions(native.locator('body'))).toEqual(weakReference);
    await editor.screenshot({ path: info.outputPath('weak-fragments-ltr.png') });

    const anchor = editor.locator('p').filter({ hasText: '123 😀' });
    await anchor.click(); await page.keyboard.press('Home'); await page.keyboard.insertText('שלום ');
    await expect(anchor).toHaveText('שלום 123 😀');
    expect(await directions(editor)).toEqual(strongReference);
    await native.setContent(await download('html'));
    expect(await directions(native.locator('body'))).toEqual(strongReference);
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(JSON.parse(await download('json'))).toEqual(transformed);
    expect(await directions(editor)).toEqual(weakReference);
    await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
    // Establish native arrow behaviour on the same exported document, without
    // Fountain event handlers or DOM selection injection. RTL visual arrows
    // are not a promise of forward logical code-point selection.
    await native.locator('body').evaluate(element => { element.setAttribute('contenteditable', 'true'); });
    await native.locator('p').filter({ hasText: '123 😀' }).click();
    await native.keyboard.press('Home');
    for (let index = 0; index < 5; index += 1) await native.keyboard.press('Shift+ArrowRight');
    observations.nativeArrowSelection = await native.evaluate(() => getSelection()?.toString());
    await anchor.click(); await page.keyboard.press('Home');
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('Shift+ArrowRight');
    observations.fountainArrowSelection = await page.evaluate(() => getSelection()?.toString());
    expect.soft(observations.fountainArrowSelection, 'native RTL arrow selection reference').toBe(observations.nativeArrowSelection);
    // Select the whole line to explicitly remove its strong text, asserting
    // the actual native selection before replacing it with weak-only content.
    await anchor.click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('שלום 123 😀');
    await page.keyboard.insertText('123 😀');
    await expect(anchor).toHaveText('123 😀');
    expect(await directions(editor)).toEqual(weakReference);
    expect(JSON.parse(await download('json'))).toEqual(transformed);
    await editor.screenshot({ path: info.outputPath('weak-fragments-restored.png') });
    observations.final = await directions(editor);
    expect(errors).toEqual([]);
  } finally {
    observations.errors = errors;
    await writeFile(info.outputPath('weak-direction-observations.json'), JSON.stringify(observations, null, 2));
    await native.close();
  }
});
