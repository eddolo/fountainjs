import { expect, type Page, type TestInfo } from '@playwright/test';

/** Fixtures only use the model; selection, copy/paste, undo and redo use real browser input. */
export async function footnoteClipboardJourney(page: Page, info: TestInfo, browserName: string) {
  if (browserName === 'chromium') await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const editor = page.getByRole('textbox', { name: 'Page intent contract editor', exact: true });
  await page.evaluate(() => {
    const { editor } = (globalThis as any).fountainBrowserTest.pages, { schema } = editor.state;
    const reference = () => schema.node('footnote_reference', { id: 'clipboard-note' });
    editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [
      schema.node('paragraph', {}, [schema.text('Copy this note'), reference(), schema.text(' and again'), reference(), schema.text('.')]),
      schema.node('paragraph', {}, [schema.text('Destination.')]),
      schema.node('footnote_definition', { id: 'clipboard-note' }, [schema.node('paragraph', {}, [
        schema.text('Shared body.', [schema.mark('strong')]),
      ])]),
    ])));
    const input = document.createElement('textarea'); input.setAttribute('aria-label', 'Independent plain-text destination');
    input.style.cssText = 'display:block;width:100%;min-height:100px;margin-block:12px';
    document.querySelector('[aria-label="Page intent contract editor"]')!.insertAdjacentElement('afterend', input);
    (globalThis as any).footnoteClipboardProbe = { copies: [], pastes: [] };
  for (const type of ['copy', 'paste']) document.addEventListener(type, event => {
      const data = (event as ClipboardEvent).clipboardData;
      const values = data ? Object.fromEntries([...data.types].map(key => [key, data.getData(key)])) : {};
      (globalThis as any).footnoteClipboardProbe[type === 'copy' ? 'copies' : 'pastes'].push(values);
    });
  });
  const original = await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editor.getJSON());
  const paragraph = editor.locator(':scope > p').first();
  await paragraph.click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await page.keyboard.press('ControlOrMeta+c');
  const copied = await page.evaluate(() => (globalThis as any).footnoteClipboardProbe.copies.at(-1));
  await info.attach('clipboard-offered', { body: JSON.stringify(copied), contentType: 'application/json' });
  expect(copied['text/plain']).toContain('[^clipboard-note]');
  expect(copied['text/plain']).toContain('[^clipboard-note]: Shared body.');
  expect(copied['text/html']).toContain('Shared body.');
  if (copied['application/x-fountainjs+json']) {
    const payload = JSON.parse(copied['application/x-fountainjs+json']);
    expect(payload.document.content.filter((node: any) => node.type === 'footnote_definition')).toHaveLength(1);
  }
  expect(await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html')
    .querySelectorAll('aside[data-fountain-footnote-definition]').length, copied['text/html'])).toBe(1);
  const external = page.getByRole('textbox', { name: 'Independent plain-text destination', exact: true });
  await external.click(); await page.keyboard.press('ControlOrMeta+v');
  await expect(external).toHaveValue(copied['text/plain']);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editor.getJSON())).toEqual(original);
  await external.screenshot({ path: info.outputPath('external-plain-footnotes.png') });
  const destination = editor.locator(':scope > p').filter({ hasText: 'Destination.' });
  await destination.click(); await page.keyboard.press('End'); await page.keyboard.press('ControlOrMeta+v');
  await info.attach('clipboard-delivered', { body: JSON.stringify(await page.evaluate(() =>
    (globalThis as any).footnoteClipboardProbe.pastes)), contentType: 'application/json' });
  await expect(editor.locator('[data-fountain-footnote-definition]')).toHaveCount(2);
  await expect(editor.locator('sup[data-fountain-footnote-reference]')).toHaveCount(4);
  await expect(editor.locator('[data-fountain-footnote-definition] strong')).toHaveCount(2);
  const graph = await page.evaluate(() => {
    const notes: string[] = [], refs: string[] = [], editor = (globalThis as any).fountainBrowserTest.pages.editor;
    editor.state.doc.descendants((node: any, path: number[]) => {
      if (node.type.name === 'footnote_definition') { if (path.length !== 1) throw new Error('Nested pasted definition'); notes.push(node.attrs.id); }
      if (node.type.name === 'footnote_reference') refs.push(node.attrs.id);
    });
    return { notes, refs, json: editor.getJSON() };
  });
  expect(new Set(graph.notes).size).toBe(2);
  expect(graph.refs.filter(id => id === 'clipboard-note')).toHaveLength(2);
  expect(graph.refs.filter(id => id !== 'clipboard-note')).toHaveLength(2);
  for (const id of graph.refs) expect(graph.notes.filter(note => note === id)).toHaveLength(1);
  await editor.screenshot({ path: info.outputPath('same-editor-pasted-notes.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.locator('[data-fountain-footnote-definition]')).toHaveCount(1);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editor.getJSON())).toEqual(original);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editor.getJSON())).toEqual(graph.json);
  await info.attach('footnote-clipboard-evidence', { body: JSON.stringify({ browserName, graph,
    clipboard: await page.evaluate(() => (globalThis as any).footnoteClipboardProbe) }), contentType: 'application/json' });
}
