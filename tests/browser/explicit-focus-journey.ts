import { expect, type Page, type TestInfo } from '@playwright/test';

export async function explicitFocusJourney(page: Page, info: TestInfo, edge: 'start' | 'end') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/browser-tests.html');
  const surface = page.getByRole('textbox', { name: 'Browser contract editor', exact: true });
  for (const type of ['paragraph', 'heading', 'code_block']) {
    const before = await page.evaluate(({ type, edge }) => {
      const { editor, view } = (globalThis as any).fountainBrowserTest;
      const empty = { type, attrs: { id: 'empty-edge', ...(type === 'heading' ? { level: 3 }
        : type === 'code_block' ? { language: 'python', lineNumbers: false } : { align: 'right' }) } };
      const keep = { type: 'paragraph', content: [{ type: 'text', text: 'Keep this paragraph.' }] };
      const next = editor.state.schema.nodeFromJSON({ type: 'doc', attrs: { focusAudit: edge },
        content: edge === 'start' ? [empty, keep] : [keep, empty] });
      editor.dispatch(editor.createTransaction().replaceDocument(next).setMeta('addToHistory', false));
      const before = editor.getJSON(); view.focus(edge);
      return { before, afterFocus: editor.getJSON() };
    }, { type, edge });
    expect(before.afterFocus).toEqual(before.before);
    await expect(surface).toBeFocused();
    await page.keyboard.type(`Typed at ${edge}.`);
    const after = await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON());
    const index = edge === 'start' ? 0 : 1;
    expect(after.content).toHaveLength(2);
    expect(after.content[index].type).toBe(type);
    expect(after.content[index].attrs).toEqual(before.before.content[index].attrs);
    expect(after.content[index].content.map((node: any) => node.text ?? '').join('')).toBe(`Typed at ${edge}.`);
    expect(after.content[1 - index]).toEqual(before.before.content[1 - index]);
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON())).toEqual(before.before);
    await page.keyboard.press('Control+Shift+z');
    expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON())).toEqual(after);
    const geometry = await surface.evaluate(node => {
      const controls = node.parentElement!.querySelector<HTMLElement>('[data-fountain-block-controls]')!.getBoundingClientRect();
      const contentStart = Math.min(...Array.from(node.children).filter(child => child.hasAttribute('data-fountain-path'))
        .map(child => child.getBoundingClientRect().left));
      return { controlsWidth: controls.width, gutterGap: contentStart - controls.right };
    });
    expect(geometry.controlsWidth).toBeGreaterThan(0);
    expect(geometry.gutterGap, 'Reorder controls must not cover this or an adjacent block').toBeGreaterThanOrEqual(4);
  }
  await surface.screenshot({ path: info.outputPath(`explicit-focus-${edge}.png`) });
  expect(errors).toEqual([]);
}
