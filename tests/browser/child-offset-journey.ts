import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export async function childOffsetJourney(page: Page, info: TestInfo) {
  await page.setViewportSize({ width: 1200, height: 850 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const original = await page.evaluate(() => {
    const api = (globalThis as any).fountainBrowserTest;
    const schema = api.editor.state.schema;
    const document = schema.node('doc', { title: 'Research review' }, [
      schema.node('heading', { level: 1 }, [schema.text('Research review')]),
      ...Array.from({ length: 256 }, (_, i) => schema.node('paragraph', {}, [schema.text(`Section ${i + 1}: review note.`)])),
    ]);
    api.editor.dispatch(api.editor.createTransaction().replaceDocument(document).setMeta('addToHistory', false));
    api.positionOriginal = document;
    return document.toJSON();
  });
  const editor = page.getByRole('textbox', { name: 'Browser contract editor', exact: true });
  const paragraphs = editor.locator(':scope > p');
  await expect(paragraphs).toHaveCount(256);
  const tail = paragraphs.nth(255);
  await tail.scrollIntoViewIfNeeded();
  await tail.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Draft.');
  await expect(tail).toHaveText('Section 256: review note. Draft.');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON())).toEqual(original);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(tail).toHaveText('Section 256: review note. Draft.');
  await page.keyboard.press('End');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('Draft.');
  await page.keyboard.type('Final.');
  await expect(tail).toHaveText('Section 256: review note. Final.');

  // Change the prefix, then return to the distant block using native input.
  const middle = paragraphs.nth(100);
  await middle.scrollIntoViewIfNeeded();
  await middle.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Prefix edit.');
  await expect(middle).toHaveText('Section 101: review note. Prefix edit.');
  await tail.scrollIntoViewIfNeeded();
  await tail.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Approved.');
  await expect(tail).toHaveText('Section 256: review note. Final. Approved.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Follow-up owner: Ada.');
  await expect(paragraphs).toHaveCount(257);
  await expect(paragraphs.last()).toHaveText('Follow-up owner: Ada.');
  const beforeMerge = await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON());
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect(paragraphs).toHaveCount(256);
  await expect(tail).toHaveText('Section 256: review note. Final. Approved.Follow-up owner: Ada.');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON())).toEqual(beforeMerge);
  const observed = await page.evaluate(() => {
    const api = (globalThis as any).fountainBrowserTest;
    const document = api.editor.state.doc;
    return { original: api.positionOriginal.toJSON(), current: document.toJSON(),
      reopened: document.type.schema.nodeFromJSON(document.toJSON()).toJSON(), selection: api.editor.state.selection };
  });
  expect(observed.original).toEqual(original);
  expect(observed.reopened).toEqual(observed.current);
  expect(observed.current.attrs.title).toBe('Research review');
  expect(errors).toEqual([]);
  await paragraphs.last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('distant-edit-history.png') });
  await writeFile(info.outputPath('distant-edit-observations.json'), JSON.stringify({
    paragraphs: 257, preservedOriginal: true, nativeBackwardSelection: 'Draft.',
    prefix: 'Section 101: review note. Prefix edit.', finalSelection: observed.selection,
    nativeSplitMergeUndo: true, nativeJSONReopen: true, errors,
  }, null, 2) + '\n');
}
