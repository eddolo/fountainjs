import { writeFile } from 'node:fs/promises';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

const codeFocus = (target: Page) => target.evaluate(() => {
  const root = document.querySelector('.fountain-editor')!, code = root.querySelector('pre')!;
  const selection = getSelection();
  return { role: document.activeElement === root ? 'editor' : document.activeElement === code ? 'code' : 'other',
    caretInCode: Boolean(selection?.anchorNode && code.contains(selection.anchorNode)),
    anchor: selection?.anchorOffset, focus: selection?.focusOffset };
});

export async function nativeCodeClickBaseline(page: Page, editor: Locator, info: TestInfo) {
  // Serialize only rendered DOM and styles into a different page. No script,
  // editor instance, event listener or framework is copied into the baseline.
  const surface = await editor.evaluate(element => ({
    html: element.outerHTML,
    styles: Array.from(document.querySelectorAll('style,link[rel="stylesheet"]')).map(style => style.outerHTML).join(''),
    width: element.getBoundingClientRect().width,
  }));
  const nativePage = await page.context().newPage();
  const observations: Record<string, unknown> = {};
  try {
    await nativePage.setContent(`<base href="${new URL('/', page.url()).href}">${surface.styles}${surface.html}`);
    const nativeRoot = nativePage.locator('.fountain-editor');
    await nativeRoot.evaluate((element, width) => { (element as HTMLElement).style.width = `${width}px`; }, surface.width);
    const nativeCode = nativeRoot.locator('li > pre');
    await nativeCode.click();
    const nativeFocus = await codeFocus(nativePage); observations.nativeClick = nativeFocus;
    expect(['editor', 'code']).toContain(nativeFocus.role);
    expect(nativeFocus.caretInCode).toBe(true);
    await nativePage.keyboard.press('End'); await nativePage.keyboard.type(' edited');
    const nativeAfterTyping = { ...await codeFocus(nativePage), text: await nativeCode.innerText() };
    observations.nativeAfterTyping = nativeAfterTyping;
    const rawEditingWorks = nativeAfterTyping.text === 'literal edited';
    if (!rawEditingWorks) {
      // Linux WebKit can focus the tabbable scrolling PRE while leaving a DOM
      // caret inside it, yet emit no native text insertion. Retain this exact
      // known failure; it is not the reference behavior an editor should copy.
      expect(info.project.name).toBe('webkit');
      expect(process.platform).toBe('linux');
      expect(nativeAfterTyping).toMatchObject({ role: 'code', caretInCode: true, text: 'literal' });
      observations.nativeLimitation = 'Tabbable code region receives focus/caret but native typing inserts no text.';
    } else await expect(nativeCode).toHaveText('literal edited');
    await nativeRoot.screenshot({ path: info.outputPath('code-click-native-edit.png') });

    // Independent editing-source control: same untouched markup/styles, except
    // PRE is not a separate Tab stop. Keep this distinct from the raw clone;
    // neither control contains Fountain scripts, instances or input listeners.
    await nativePage.setContent(`<base href="${new URL('/', page.url()).href}">${surface.styles}${surface.html}`);
    await nativeRoot.evaluate((element, width) => {
      (element as HTMLElement).style.width = `${width}px`;
      element.querySelector('pre')!.removeAttribute('tabindex');
    }, surface.width);
    await nativeCode.click();
    const sourceFocus = await codeFocus(nativePage); observations.nativeSourceClick = sourceFocus;
    expect(sourceFocus).toMatchObject({ role: 'editor', caretInCode: true });
    await nativePage.keyboard.press('End'); await nativePage.keyboard.type(' edited');
    observations.nativeSourceAfterTyping = { ...await codeFocus(nativePage), text: await nativeCode.innerText() };
    await expect(nativeCode).toHaveText('literal edited');
    await expect(nativeRoot.locator(':scope > p')).toHaveText('After');
    await nativeRoot.screenshot({ path: info.outputPath('code-click-native-source-edit.png') });

    const expectedFocus = rawEditingWorks ? nativeFocus : sourceFocus;
    observations.expectedFountainClick = expectedFocus;
    observations.expectedFocusBasis = rawEditingWorks ? 'unchanged native region' : 'independent native editing-source control; raw region cannot type';
    return expectedFocus;
  } finally {
    const path = info.outputPath('code-click-native-baseline.json');
    await writeFile(path, JSON.stringify(observations, null, 2));
    await info.attach('code-click-native-baseline', { path, contentType: 'application/json' });
    await nativePage.close();
  }
}

export async function codeNativeFocusJourney(page: Page, info: TestInfo): Promise<void> {
  await page.goto('/browser-tests.html');
  const editor = page.getByRole('textbox', { name: 'Browser contract editor', exact: true });
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectAll());
  await editor.evaluate(target => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html'
      ? '<ul><li><pre><code>literal</code></pre></li></ul><p>After</p>' : type === 'text/plain' ? 'literal\nAfter' : '' } });
    target.dispatchEvent(event);
  });
  await expect(editor.locator('li > p')).toHaveCount(0);
  await expect(editor.locator('li > pre')).toHaveText('literal');
  const nativeFocus = await nativeCodeClickBaseline(page, editor, info);
  const observations: Record<string, unknown> = { nativeClick: nativeFocus };
  try {
    const code = editor.locator('li > pre');
    await code.click();
    const editorFocus = await codeFocus(page); observations.editorClick = editorFocus;
    await page.keyboard.press('End'); await page.keyboard.type(' edited');
    observations.editorAfterTyping = { ...await codeFocus(page), text: await code.innerText() };
    await expect(code).toHaveText('literal edited');
    await expect(editor.locator('li > p')).toHaveCount(0);
    await editor.screenshot({ path: info.outputPath('code-click-fountain-edit.png') });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(code).toHaveText('literal');
    expect(editorFocus.caretInCode).toBe(true);
    expect(editorFocus.role).toBe(nativeFocus.role);
  } finally {
    const path = info.outputPath('code-click-native-focus.json');
    await writeFile(path, JSON.stringify(observations, null, 2));
    await info.attach('code-click-native-focus', { path, contentType: 'application/json' });
  }
}
