import { writeFile } from 'node:fs/promises';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

const codeFocus = (target: Page) => target.evaluate(() => {
  const root = document.querySelector('.fountain-editor')!, code = root.querySelector('pre')!;
  const selection = getSelection();
  const describe = (node: Node | null | undefined) => node ? {
    name: node.nodeName, text: node.textContent?.slice(0, 80),
    parent: node.parentElement?.tagName,
    parentEditable: node.parentElement?.isContentEditable,
    elementEditable: ((node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null)?.isContentEditable,
    widget: ((node.nodeType === 1 ? node : node.parentElement) as Element | null)?.closest('[data-fountain-widget]')?.getAttribute('data-fountain-widget'),
  } : null;
  return { role: document.activeElement === root ? 'editor' : document.activeElement === code ? 'code' : 'other',
    caretInCode: Boolean(selection?.anchorNode && code.contains(selection.anchorNode)),
    anchor: selection?.anchorOffset, focus: selection?.focusOffset,
    documentFocused: document.hasFocus(), visibility: document.visibilityState,
    anchorNode: describe(selection?.anchorNode), focusNode: describe(selection?.focusNode),
    rootEditable: (root as HTMLElement).isContentEditable, codeEditable: (code as HTMLElement).isContentEditable };
});

// Observe native dispatch without changing default behavior or adding editor
// handlers. Missing keyboard events, missing beforeinput and a widget-boundary
// caret are different failures; focus/offset numbers alone cannot distinguish them.
async function observeCodeInput(page: Page): Promise<void> {
  await page.evaluate(() => {
    const events: unknown[] = [];
    (globalThis as any).__fountainCodeInputEvents = events;
    for (const type of ['keydown', 'keyup', 'beforeinput', 'input', 'focusin']) {
      document.addEventListener(type, event => {
        const target = event.target as HTMLElement | null;
        events.push({ type: event.type, target: target?.tagName,
          editable: target?.isContentEditable, key: (event as KeyboardEvent).key,
          inputType: (event as InputEvent).inputType, data: (event as InputEvent).data,
          trusted: event.isTrusted, defaultPrevented: event.defaultPrevented });
      }, { capture: true, passive: true });
    }
  });
}

async function codeInputEvidence(page: Page) {
  return page.evaluate(() => ({
    events: (globalThis as any).__fountainCodeInputEvents,
    html: document.querySelector('.fountain-editor')?.outerHTML,
    codeStyle: (() => {
      const code = document.querySelector('.fountain-editor pre')!;
      const style = getComputedStyle(code);
      return { userModify: style.getPropertyValue('-webkit-user-modify'),
        userSelect: style.userSelect, pointerEvents: style.pointerEvents, whiteSpace: style.whiteSpace };
    })(),
  }));
}

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
  const requireKnownWidgetCaret = (focus: Awaited<ReturnType<typeof codeFocus>> & { text: string },
    evidence: Awaited<ReturnType<typeof codeInputEvidence>>) => {
    // This is specifically a caret inside the non-editable line-number widget,
    // not a tolerance for arbitrary native insertion or event-delivery failure.
    expect(info.project.name).toBe('webkit');
    expect(process.platform).toBe('linux');
    expect(focus).toMatchObject({ caretInCode: true, documentFocused: true, text: 'literal',
      anchorNode: { widget: 'syntax-line-0.0.0-1', elementEditable: false },
      focusNode: { widget: 'syntax-line-0.0.0-1', elementEditable: false } });
    expect(evidence.events.filter((event: any) => event.type === 'keydown').map((event: any) => event.key))
      .toEqual(['End', ' ', 'e', 'd', 'i', 't', 'e', 'd']);
    expect(evidence.events.filter((event: any) => event.type === 'beforeinput' || event.type === 'input')).toEqual([]);
  };
  try {
    await nativePage.setContent(`<base href="${new URL('/', page.url()).href}">${surface.styles}${surface.html}`);
    const nativeRoot = nativePage.locator('.fountain-editor');
    await nativeRoot.evaluate((element, width) => { (element as HTMLElement).style.width = `${width}px`; }, surface.width);
    const nativeCode = nativeRoot.locator('li > pre');
    await observeCodeInput(nativePage);
    await nativeCode.click();
    const nativeFocus = await codeFocus(nativePage); observations.nativeClick = nativeFocus;
    expect(['editor', 'code']).toContain(nativeFocus.role);
    expect(nativeFocus.caretInCode).toBe(true);
    await nativePage.keyboard.press('End'); await nativePage.keyboard.type(' edited');
    const nativeAfterTyping = { ...await codeFocus(nativePage), text: await nativeCode.innerText() };
    observations.nativeAfterTyping = nativeAfterTyping;
    const nativeEvidence = await codeInputEvidence(nativePage);
    observations.nativeInputEvidence = nativeEvidence;
    const rawEditingWorks = nativeAfterTyping.text === 'literal edited';
    if (!rawEditingWorks) {
      requireKnownWidgetCaret(nativeAfterTyping, nativeEvidence);
      expect(nativeAfterTyping).toMatchObject({ role: 'code', caretInCode: true, text: 'literal' });
      observations.nativeLimitation = 'Native caret is inside a non-editable line-number widget; keyboard events arrive but no text-input event is emitted.';
    } else await expect(nativeCode).toHaveText('literal edited');
    await nativeRoot.screenshot({ path: info.outputPath('code-click-native-edit.png') });

    // Isolate the Tab-stop hypothesis without removing the line-number widget.
    // Linux evidence disproves that hypothesis: its caret remains in the widget.
    await nativePage.setContent(`<base href="${new URL('/', page.url()).href}">${surface.styles}${surface.html}`);
    await nativeRoot.evaluate((element, width) => {
      (element as HTMLElement).style.width = `${width}px`;
      element.querySelector('pre')!.removeAttribute('tabindex');
    }, surface.width);
    await observeCodeInput(nativePage);
    await nativeCode.click();
    const sourceFocus = await codeFocus(nativePage); observations.nativeSourceClick = sourceFocus;
    expect(sourceFocus).toMatchObject({ role: 'editor', caretInCode: true });
    await nativePage.keyboard.press('End'); await nativePage.keyboard.type(' edited');
    const sourceAfterTyping = { ...await codeFocus(nativePage), text: await nativeCode.innerText() };
    const sourceEvidence = await codeInputEvidence(nativePage);
    observations.nativeSourceAfterTyping = sourceAfterTyping;
    observations.nativeSourceInputEvidence = sourceEvidence;
    if (sourceAfterTyping.text !== 'literal edited') {
      requireKnownWidgetCaret(sourceAfterTyping, sourceEvidence);
      observations.nativeSourceLimitation = 'Removing PRE tabindex does not remove the non-editable widget caret.';
    } else await expect(nativeCode).toHaveText('literal edited');
    await expect(nativeRoot.locator(':scope > p')).toHaveText('After');
    await nativeRoot.screenshot({ path: info.outputPath('code-click-native-source-edit.png') });

    // Independent source-only native control: preserve source markup/styles,
    // but remove PRE's Tab stop and the editor-generated line-number widgets.
    // No Fountain handlers or forced Range are installed. A real click, End and
    // typing must work here before this control can establish editing behavior.
    await nativePage.setContent(`<base href="${new URL('/', page.url()).href}">${surface.styles}${surface.html}`);
    await nativeRoot.evaluate((element, width) => {
      (element as HTMLElement).style.width = `${width}px`;
      const pre = element.querySelector('pre')!;
      pre.removeAttribute('tabindex');
      pre.querySelectorAll('[data-fountain-widget]').forEach(widget => widget.remove());
    }, surface.width);
    await expect(nativeCode).toHaveText('literal');
    await expect(nativeCode.locator('[data-fountain-widget]')).toHaveCount(0);
    await observeCodeInput(nativePage);
    await nativeCode.click();
    const sourceOnlyFocus = await codeFocus(nativePage);
    observations.nativeSourceOnlyClick = sourceOnlyFocus;
    expect(sourceOnlyFocus).toMatchObject({ role: 'editor', caretInCode: true, documentFocused: true,
      anchorNode: { elementEditable: true } });
    await nativePage.keyboard.press('End'); await nativePage.keyboard.type(' edited');
    observations.nativeSourceOnlyAfterTyping = { ...await codeFocus(nativePage), text: await nativeCode.innerText() };
    observations.nativeSourceOnlyInputEvidence = await codeInputEvidence(nativePage);
    await expect(nativeCode).toHaveText('literal edited');
    await expect(nativeRoot.locator(':scope > p')).toHaveText('After');
    await nativeRoot.screenshot({ path: info.outputPath('code-click-native-source-only-edit.png') });

    const expectedFocus = rawEditingWorks ? nativeFocus : sourceOnlyFocus;
    observations.expectedFountainClick = expectedFocus;
    observations.expectedFocusBasis = rawEditingWorks ? 'unchanged native region'
      : 'independent source-only native control; raw and Tab-stop-only controls retain a proven non-editable widget caret';
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
    await observeCodeInput(page);
    const code = editor.locator('li > pre');
    await code.click();
    const editorFocus = await codeFocus(page); observations.editorClick = editorFocus;
    await page.keyboard.press('End'); await page.keyboard.type(' edited');
    observations.editorAfterTyping = { ...await codeFocus(page), text: await code.innerText() };
    observations.editorInputEvidence = await codeInputEvidence(page);
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
