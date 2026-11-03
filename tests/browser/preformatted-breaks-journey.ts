import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

async function wordGeometry(pre: Locator) {
  return pre.evaluate(element => {
    const root = element.querySelector('code') ?? element;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), leaves: Text[] = [];
    while (walker.nextNode()) {
      const leaf = walker.currentNode as Text;
      if (!leaf.parentElement?.closest('[data-fountain-widget]')) leaves.push(leaf);
    }
    const text = leaves.map(leaf => leaf.data).join('');
    const bounds = (word: string) => {
      let offset = text.indexOf(word);
      if (offset < 0) throw Error('Missing measured code word.');
      for (const leaf of leaves) {
        if (offset < leaf.length) {
          const range = document.createRange(); range.setStart(leaf, offset); range.setEnd(leaf, offset + 1);
          const rect = range.getBoundingClientRect();
          return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
        }
        offset -= leaf.length;
      }
      throw Error('Measured word has no native range.');
    };
    const first = bounds('first'), second = bounds('second');
    return { gap: second.top - first.top, second };
  });
}

async function wordGap(pre: Locator) { return (await wordGeometry(pre)).gap; }

export async function preformattedBreaksJourney(page: Page, info: TestInfo) {
  const source = '<h2>Preformatted import check</h2><pre>first<br>second</pre>'
    + '<pre>first<br>\nsecond</pre><pre>first <em>important</em> second</pre><p>Keep this sibling.</p>';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const native = await page.context().newPage();
  let nativeGaps: number[];
  let nativeSelectedCode = 'first\nsecond edited';
  try {
    await native.setContent('<style>body{font:16px system-ui}pre{font:16px/24px monospace}</style>' + source);
    nativeGaps = [await wordGap(native.locator('pre').nth(0)), await wordGap(native.locator('pre').nth(1))];
    expect(nativeGaps[0]).toBeGreaterThan(10);
    expect(nativeGaps[1] / nativeGaps[0]).toBeCloseTo(2, 1);
    await expect(native.locator('pre em')).toHaveCSS('font-style', 'italic');
    await native.screenshot({ path: info.outputPath('native-preformatted-source.png') });
    if (info.project.name === 'chromium' || info.project.name === 'firefox') {
      await native.setContent('<pre contenteditable="true" role="textbox" aria-label="Native code control">first\nsecond edited</pre>');
      await native.getByRole('textbox', { name: 'Native code control' }).click();
      await native.keyboard.press('ControlOrMeta+a');
      nativeSelectedCode = await native.evaluate(() => getSelection()!.toString());
      expect(['first\nsecond edited', 'first\r\nsecond edited']).toContain(nativeSelectedCode);
    }
  } finally { await native.close(); }
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'preformatted.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: preformatted.html', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const code = editor.locator('pre');
  await expect(code).toHaveCount(3);
  await expect(code.nth(0)).toHaveText('first\nsecond');
  await expect(code.nth(1)).toHaveText('first\n\nsecond');
  await expect(code.nth(2)).toHaveText('first important second');
  await expect(code.nth(0)).toHaveAttribute('data-fountain-code-lines', '1\n2');
  await expect(code.nth(1)).toHaveAttribute('data-fountain-code-lines', '1\n2\n3');
  await expect(code.locator('[data-fountain-widget]')).toHaveCount(0);
  const gutter = await code.nth(0).evaluate(element => ({
    supported: CSS.supports('content', 'attr(data-fountain-code-lines) / ""'),
    content: getComputedStyle(element, '::after').content,
    codeHeight: element.querySelector('code')!.getBoundingClientRect().height,
    gutterLineHeight: getComputedStyle(element, '::after').lineHeight,
    codeLineHeight: getComputedStyle(element.querySelector('code')!).lineHeight,
    sourceOnlyText: element.textContent,
  }));
  expect(gutter.supported).toBe(true);
  // Firefox keeps attr(...) in computed content; Chromium/WebKit resolve it.
  // The labels, measured layout, accessible tree and screenshots are checked
  // separately rather than requiring one engine's CSSOM serialization.
  expect(gutter.content).not.toBe('none');
  expect(gutter.content).not.toBe('normal');
  expect(gutter.gutterLineHeight).toBe(gutter.codeLineHeight);
  expect(gutter.sourceOnlyText).toBe('first\nsecond');
  const accessibleCode = await code.nth(0).ariaSnapshot();
  expect(accessibleCode).not.toMatch(/\b[12]\b/u);
  await expect(workspace.locator('.lab-notice')).toContainText('preformatted-html-projection');
  await expect(workspace.locator('.lab-notice')).toContainText('child formatting');
  await expect(workspace.getByLabel('Original source', { exact: true })).toHaveText(source);
  const editorGaps = [await wordGap(code.nth(0)), await wordGap(code.nth(1))];
  expect(editorGaps[0]).toBeGreaterThan(4);
  expect(editorGaps[1] / editorGaps[0]).toBeCloseTo(nativeGaps[1] / nativeGaps[0], 1);
  await editor.screenshot({ path: info.outputPath('imported-preformatted-lines.png') });
  const editableCode = code.nth(0).locator('code');
  // Click the actually rendered second-line glyph, not an assumed pixel row.
  // Native range measurement observes layout; it does not set the caret.
  const target = (await wordGeometry(code.nth(0))).second;
  const codeBox = await editableCode.boundingBox();
  const position = { x: target.left + target.width / 2 - codeBox!.x, y: target.top + target.height / 2 - codeBox!.y };
  const inspectCaret = () => editableCode.evaluate(element => {
    const selection = getSelection(), range = document.createRange();
    let prefix: string | null = null;
    if (selection?.anchorNode && element.contains(selection.anchorNode)) {
      range.selectNodeContents(element); range.setEnd(selection.anchorNode, selection.anchorOffset); prefix = range.toString();
    }
    return { prefix, anchorOffset: selection?.anchorOffset, anchorText: selection?.anchorNode?.textContent,
      anchorParent: selection?.anchorNode?.parentElement?.outerHTML,
      activeElement: document.activeElement?.tagName,
      activeRole: document.activeElement?.getAttribute('role') };
  });
  await editableCode.evaluate(element => {
    const events: unknown[] = [];
    (globalThis as any).__preformattedCaretEvents = events;
    const pointers: unknown[] = [];
    (globalThis as any).__preformattedPointerEvents = pointers;
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) document.addEventListener(type, event => {
      const point = (event as TouchEvent).changedTouches?.[0] ?? event as MouseEvent;
      const target = event.target as Element | null;
      pointers.push({ type, x: point.clientX, y: point.clientY, target: target?.outerHTML?.slice(0, 160),
        pre: target?.closest('pre')?.getAttribute('data-fountain-path'), scrollY,
        viewport: { top: visualViewport?.offsetTop, pageTop: visualViewport?.pageTop } });
    }, { capture: true, passive: true });
    for (const type of ['selectionchange', 'pointerup', 'keydown']) document.addEventListener(type, event => {
      const selection = getSelection();
      if (!selection?.anchorNode || !element.contains(selection.anchorNode)) return;
      events.push({ type, key: (event as KeyboardEvent).key, offset: selection.anchorOffset,
        text: selection.anchorNode.textContent, parent: selection.anchorNode.parentElement?.tagName });
    }, { capture: true, passive: true });
  });
  if (info.project.name.startsWith('mobile-')) await editableCode.tap({ position });
  else await editableCode.click({ position });
  const afterClick = await inspectCaret();
  await page.keyboard.press('End');
  const afterEnd = await inspectCaret();
  await page.keyboard.type(' edited');
  const afterTyping = await inspectCaret();
  const events = await page.evaluate(() => (globalThis as any).__preformattedCaretEvents);
  const pointers = await page.evaluate(() => (globalThis as any).__preformattedPointerEvents);
  await writeFile(info.outputPath('native-code-caret.json'), JSON.stringify({ target, codeBox, position, afterClick, afterEnd, afterTyping, events, pointers }, null, 2));
  await expect(code.nth(0)).toHaveText('first\nsecond edited');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(code.nth(0)).toHaveText('first\nsecond');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(code.nth(0)).toHaveText('first\nsecond edited');
  let externalClipboard: unknown = null;
  if (info.project.name === 'chromium' || info.project.name === 'firefox') {
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Home');
    await page.keyboard.down('Shift'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.up('Shift');
    // Windows Firefox's native Selection string uses CRLF even for an LF-only
    // pre. Match the independent native editor, not an assumed OS newline.
    expect(await page.evaluate(() => getSelection()?.toString())).toBe(nativeSelectedCode);
    await page.keyboard.press('ControlOrMeta+c');
    const destination = await page.context().newPage();
    try {
      await destination.setContent('<label>Independent plain text destination<textarea></textarea></label>');
      const input = destination.getByRole('textbox', { name: 'Independent plain text destination' });
      await input.evaluate(element => element.addEventListener('paste', event => {
        const paste = event as ClipboardEvent;
        (globalThis as any).__preformattedPaste = { trusted: paste.isTrusted,
          plain: paste.clipboardData?.getData('text/plain'), types: [...(paste.clipboardData?.types ?? [])] };
      }, { once: true }));
      await input.click(); await destination.keyboard.press('ControlOrMeta+v');
      await expect(input).toHaveValue('first\nsecond edited');
      externalClipboard = await destination.evaluate(() => (globalThis as any).__preformattedPaste);
      expect(externalClipboard).toMatchObject({ trusted: true });
      expect(['first\nsecond edited', nativeSelectedCode]).toContain((externalClipboard as { plain: string }).plain);
      await destination.screenshot({ path: info.outputPath('external-code-paste.png') });
    } finally { await destination.close(); }
  }
  await workspace.getByRole('button', { name: 'Check round trip', exact: true }).click();
  await expect(workspace.getByLabel('Round-trip result', { exact: true }))
    .toContainText('Exact Fountain document equality after reopening.');
  // Exact native equality does not mean the original emphasis was retained.
  await expect(workspace.locator('.lab-notice')).toContainText('child formatting');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const download = await pending;
  const path = info.outputPath('preformatted-edited.html');
  await download.saveAs(path);
  const html = await readFile(path, 'utf8');
  const reader = await page.context().newPage();
  let readerGaps: number[];
  try {
    await reader.setContent(html);
    await expect(reader.locator('pre').nth(0)).toHaveText('first\nsecond edited');
    await expect(reader.locator('pre').nth(1)).toHaveText('first\n\nsecond');
    readerGaps = [await wordGap(reader.locator('pre').nth(0)), await wordGap(reader.locator('pre').nth(1))];
    expect(readerGaps[0]).toBeGreaterThan(4);
    expect(readerGaps[1] / readerGaps[0]).toBeCloseTo(2, 1);
    await expect(reader.locator('pre em')).toHaveCount(0);
    await reader.screenshot({ path: info.outputPath('downloaded-preformatted-reader.png') });
  } finally { await reader.close(); }
  await page.getByLabel('Choose documents').setInputFiles({ name: 'reopened-preformatted.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  const reopened = page.getByRole('region', { name: 'Conversion workspace: reopened-preformatted.html', exact: true });
  const reopenedEditor = reopened.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(reopenedEditor.locator('pre').nth(0)).toHaveText('first\nsecond edited');
  await expect(reopenedEditor.locator('pre').nth(1)).toHaveText('first\n\nsecond');
  await expect(reopenedEditor.locator('p')).toHaveText('Keep this sibling.');
  expect(errors).toEqual([]);
  await writeFile(info.outputPath('preformatted-break-observations.json'), JSON.stringify({
    nativeGaps, editorGaps, readerGaps, gutter, accessibleCode, nativeSelectedCode, externalClipboard, explicitBRAndAdjacentLFAreIndependent: true,
    nativeTypingUndoRedo: true, actualDownloadReopen: true, formattingLossDisclosed: true, errors,
  }, null, 2) + '\n');
}
