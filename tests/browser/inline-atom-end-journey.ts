import { expect, type Page, type TestInfo } from '@playwright/test';

/** Initial fixtures only; cursor movement, typing and undo use browser input. */
export async function inlineAtomEndJourney(page: Page, info: TestInfo) {
  const editor = page.getByRole('textbox', { name: 'Page intent contract editor', exact: true });
  for (const kind of ['footnote_reference', 'inline_math']) {
    await page.evaluate(type => {
      const { editor } = (globalThis as any).fountainBrowserTest.pages;
      const { schema } = editor.state;
      const atom = schema.node(type, type === 'footnote_reference' ? { id: 'end-note' } : { latex: 'x^2' });
      const paragraphs = [schema.node('paragraph', {}, [schema.text('Boundary'), atom, schema.text('')]),
        schema.node('paragraph', {}, [schema.text('Following paragraph.')])];
      if (type === 'footnote_reference') paragraphs.push(schema.node('footnote_definition', { id: 'end-note' },
        [schema.node('paragraph', {}, [schema.text('Untouched note body.')])]));
      editor.dispatch(editor.createTransaction().replaceDocument(editor.state.doc.copy(paragraphs)));
    }, kind);
    const paragraph = editor.locator(':scope > p').first();
    await paragraph.click();
    const before = await paragraph.boundingBox();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' typed');
    await expect(paragraph).toContainText(' typed');
    await expect(editor.locator(':scope > p').nth(1)).toHaveText('Following paragraph.');
    const after = await paragraph.boundingBox();
    expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(2);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(paragraph).not.toContainText(' typed');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(paragraph).toContainText(' typed');
    const document = await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editor.state.doc.toJSON());
    expect(JSON.stringify(document)).not.toContain('hard_break');
    expect(document.content[0].content.at(-1).text).toBe(' typed');
    if (kind === 'footnote_reference') await expect(editor.locator('[data-fountain-footnote-definition]')).toHaveText('Untouched note body.');
    await editor.screenshot({ path: info.outputPath(`end-after-${kind}.png`) });
  }
}
