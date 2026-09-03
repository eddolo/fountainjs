import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/browser-tests.html');
});

test('edits through real beforeinput events and undoes a Markdown input rule', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor).toContainText('Second paragraph');
  await page.locator('[data-fountain-path="1"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# ');
  await expect(editor.locator('[data-fountain-node="heading"]')).toHaveCount(1);

  await page.keyboard.press('Backspace');
  await expect(editor.locator('[data-fountain-node="heading"]')).toHaveCount(0);
  await expect(editor.locator('[data-fountain-path="2"]')).toHaveText('# ');
});

test('groups adjacent browser typing and respects explicit undo boundaries', async ({ page }) => {
  const first = page.locator('[data-fountain-path="0"]');
  await first.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('abc');
  const firstText = () => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).textContent);
  await expect.poll(firstText).toBe('abcAlpha Beta');
  await page.keyboard.press('Control+z');
  await expect.poll(firstText).toBe('Alpha Beta');

  await page.keyboard.type('x');
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.closeHistory());
  await page.keyboard.type('y');
  await page.keyboard.press('Control+z');
  await expect.poll(firstText).toBe('xAlpha Beta');
  await page.keyboard.press('Control+z');
  await expect.poll(firstText).toBe('Alpha Beta');
});

test('commits cross-browser composition sequences once and supports replacement input', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectText([0, 0], 0, 5));
  await page.waitForTimeout(0);
  const result = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertCompositionText', data: '東', isComposing: true,
    }));
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '東京' }));
    const commit = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertCompositionText', data: '東京',
    });
    editor.dispatchEvent(commit);
    return { commitPrevented: commit.defaultPrevented };
  });
  expect(result).toEqual({ commitPrevented: true });
  const firstText = () => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).textContent);
  await expect.poll(firstText).toBe('東京 Beta');

  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectText([0, 0], 0, 2));
  await page.waitForTimeout(0);
  const replacementPrevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const replacement = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: '京都',
    });
    editor.dispatchEvent(replacement);
    return replacement.defaultPrevented;
  });
  expect(replacementPrevented).toBe(true);
  await expect.poll(firstText).toBe('京都 Beta');
});

test('maps decorations through typing without persisting widget content', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  expect(await editor.locator('.tested-range').allTextContents()).toEqual(['Alp', 'ha']);
  expect(await editor.locator('.tested-overlap').allTextContents()).toEqual(['ha', ' Bet']);
  await expect(editor.locator('[data-fountain-widget="remote"]')).toHaveText('Remote');

  await page.locator('[data-fountain-path="0"]').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('!');
  expect(await editor.locator('.tested-range').allTextContents()).toEqual(['Alp', 'ha']);
  expect(await editor.locator('.tested-overlap').allTextContents()).toEqual(['ha', ' Bet']);
  await expect(editor).toContainText('!AlphaRemote Beta');
  await expect(page.getByLabel('Document JSON')).not.toContainText('Remote');
});

test('highlights editable code and updates language metadata through public commands', async ({ page }) => {
  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { editor, commands } = contract;
    const source = 'const answer = 42;\n// editable';
    const block = editor.state.schema.node('code_block', { language: 'ts', lineNumbers: true }, [editor.state.schema.text(source)]);
    editor.dispatch(editor.state.createTransaction().replace(0, editor.state.doc.childCount, [block]));
    commands.commands.selectText([0, 0], source.length);
    contract.view.focus();
  });

  const block = page.locator('pre.fjs-code-block');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-language', 'typescript');
  await expect(block.locator('.fjs-token--keyword')).toHaveText('const');
  await expect(block.locator('.fjs-token--number')).toHaveText('42');
  await expect(block.locator('.fjs-token--comment')).toHaveText('// editable');
  await expect(block.locator('.fjs-code-line-number')).toHaveCount(2);

  await page.keyboard.press('Enter');
  await page.keyboard.type('return answer;');
  await expect(block.locator('.fjs-token--keyword')).toHaveText(['const', 'return']);
  await expect(block.locator('.fjs-code-line-number')).toHaveCount(3);

  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.setCodeBlockLanguage('PY'))).toBe(true);
  await expect(block).toHaveAttribute('data-language', 'python');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.toggleCodeBlockLineNumbers(false))).toBe(true);
  await expect(block.locator('.fjs-code-line-number')).toHaveCount(0);
});

test('runs a view-focused chain and checks it without preview side effects', async ({ page }) => {
  const output = page.getByLabel('Document JSON');
  const before = await output.textContent();
  const canRun = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.can().chain().focus('end').insertText(' chained').run();
  });
  expect(canRun).toBe(true);
  await expect(output).toHaveText(before ?? '');

  const ran = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.chain().focus('end').insertText(' chained').run();
  });
  expect(ran).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' })).toBeFocused();
  await expect(page.locator('[data-fountain-path="1"]')).toContainText('Second paragraph chained');
});

test('applies every configured paste-rule match through a browser paste event', async ({ page }) => {
  await page.locator('[data-fountain-path="1"]').click();
  await page.keyboard.press('End');
  const prevented = await page.locator('[data-fountain-path="1"]').evaluate((target) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/plain' ? ' one -- two --' : '',
      },
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toContainText('Second paragraph one — two —');
});

test('autolinks, safely activates, edits, and removes links in a real browser', async ({ page }) => {
  await page.locator('[data-fountain-path="1"]').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Visit https://example.com. ');
  const link = page.getByRole('textbox', { name: 'Browser contract editor' }).getByRole('link', { name: 'https://example.com' });
  await expect(link).toHaveAttribute('href', 'https://example.com');
  await expect(page.locator('[data-fountain-path="1"]')).toContainText('https://example.com.');

  const activation = await link.evaluate((anchor) => {
    let detail: unknown;
    anchor.closest('[role="textbox"]')?.addEventListener('fountain-link-activate', (event) => {
      detail = (event as CustomEvent).detail;
    }, { once: true });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);
    return { prevented: click.defaultPrevented, detail };
  });
  expect(activation).toEqual({ prevented: true, detail: expect.objectContaining({ href: 'https://example.com' }) });

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([1, 1], 3);
    contract.commands.commands.editLink('/docs', { title: 'Documentation', target: '_self' });
  });
  await expect(link).toHaveAttribute('href', '/docs');
  await expect(link).toHaveAttribute('title', 'Documentation');
  await expect(link).toHaveAttribute('target', '_self');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.removeLink())).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' }).getByRole('link')).toHaveCount(0);
});

test('preserves structured rich HTML from a real browser clipboard event', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectText([1, 0], 16));
  await page.waitForTimeout(0);
  const prevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/html'
          ? '<h2>Imported heading</h2><p>A <strong>rich</strong> fragment</p>'
          : 'Imported heading\nA rich fragment',
      },
    });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' }).locator('h2')).toHaveText('Imported heading');
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' }).locator('strong')).toHaveText('rich');
});

test('pastes mixed nested HTML lists without flattening their hierarchy', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectText([1, 0], 16));
  const prevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/html'
          ? '<ul><li>Parent <strong>bold</strong><ol start="3"><li>Nested</li></ol></li><li>Sibling</li></ul>'
          : 'Parent bold\nNested\nSibling',
      },
    });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor.locator('ul > li')).toHaveCount(2);
  await expect(editor.locator('ul > li').first().locator('strong')).toHaveText('bold');
  await expect(editor.locator('ul > li').first().locator('ol')).toHaveAttribute('start', '3');
  await expect(editor.locator('ul > li').first().locator('ol > li')).toHaveText('Nested');
});

test('wraps, indents, lifts, and exits lists through browser-visible commands and keys', async ({ page }) => {
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectTextRange([0, 0], 0, [1, 0], 6);
    return contract.commands.commands.toggleList('ordered');
  })).toBe(true);
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor.locator('ol').first().locator(':scope > li')).toHaveCount(2);

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 1, 0, 0], 0);
    contract.view.focus();
  });
  await page.keyboard.press('Tab');
  await expect(editor.locator('ol ol')).toHaveCount(1);
  await expect(editor.locator('ol ol > li')).toContainText('Second paragraph');
  await page.keyboard.press('Shift+Tab');
  await expect(editor.locator('ol ol')).toHaveCount(0);

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 0, 0, 0], 0);
    contract.view.focus();
  });
  await page.keyboard.press('Backspace');
  await expect(editor.locator(':scope > p').first()).toHaveText('Alpha Beta');
  await expect(editor.locator(':scope > ol > li')).toHaveCount(1);
});

test('edits bidirectional and deeply nested text by logical document positions', async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = (globalThis as any).fountainBrowserTest;
    const { schema } = editor.state;
    const bidi = schema.node('paragraph', {}, [schema.text('שלום world مرحبا')]);
    const quote = schema.node('blockquote', {}, [schema.node('paragraph', {}, [schema.text('Nested text')])]);
    editor.dispatch(editor.state.createTransaction().replace(editor.state.doc.childCount, editor.state.doc.childCount, [bidi, quote]));
  });

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([3, 0], 0, 4);
    contract.view.focus();
  });
  await page.keyboard.type('Hello');
  await expect(page.locator('[data-fountain-path="3"]')).toHaveText('Hello world مرحبا');

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([4, 0, 0], 11);
    contract.view.focus();
  });
  await page.keyboard.type('!');
  await expect(page.locator('[data-fountain-path="4.0"]')).toHaveText('Nested text!');
});

test('moves a selected top-level block through native drag data', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectNode([0]));
  const first = page.locator('[data-fountain-path="0"]');
  const second = page.locator('[data-fountain-path="1"]');
  await expect(first).toHaveAttribute('draggable', 'true');
  const targetBox = await second.boundingBox();
  await first.dragTo(second, { targetPosition: { x: 8, y: Math.max(1, (targetBox?.height ?? 2) - 1) } });

  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.textContent)
  ))).toEqual(['Second paragraph', 'Alpha Beta', '']);
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.textContent)
  ))).toEqual(['Alpha Beta', 'Second paragraph', '']);
});

test('replaces a DOM selection that crosses block boundaries', async ({ page }) => {
  await page.evaluate(() => {
    const wrappers = document.querySelectorAll<HTMLElement>('[data-fountain-text-path]');
    const textNode = (wrapper: HTMLElement, offset: number): { node: Node; offset: number } => {
      const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.parentElement?.closest('[data-fountain-widget]')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
      });
      let remaining = offset;
      let node = walker.nextNode();
      while (node) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) return { node, offset: remaining };
        remaining -= length;
        node = walker.nextNode();
      }
      throw new Error('Unable to locate text offset.');
    };
    const start = textNode(wrappers[0] as HTMLElement, 6);
    const end = textNode(wrappers[1] as HTMLElement, 7);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });

  await page.keyboard.type('joined ');
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor.locator('[data-fountain-node="paragraph"]')).toHaveCount(1);
  const documentJSON = JSON.parse(await page.getByLabel('Document JSON').textContent() ?? '{}');
  expect(documentJSON.content[0].content.map((node: { text?: string }) => node.text ?? '').join('')).toBe('Alpha joined paragraph');
  await expect(editor.locator('[data-fountain-widget="remote"]')).toHaveCount(1);
});

test('uses Ctrl+A as an explicit all-document selection and replaces the document', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('all');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toContain('Alpha');

  await page.keyboard.type('Replacement');
  await expect(editor).toHaveText('Replacement');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('text');
});

test('selects and deletes an atomic image through real pointer and keyboard input', async ({ page }) => {
  const inserted = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.insertImage({ src: 'https://example.com/selected.png', alt: 'Selected image' });
  });
  expect(inserted).toBe(true);
  const image = page.locator('[data-fountain-node="image_super"]');
  await page.locator('[data-fountain-path="0"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expect(image).toHaveAttribute('data-fountain-selected-node', 'true');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('node');

  await page.locator('[data-fountain-path="0"]').click();
  await image.click();
  await expect(image).toHaveAttribute('data-fountain-selected-node', 'true');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('node');

  await page.keyboard.press('Backspace');
  await expect(image).toHaveCount(0);
});

test('extends and replaces a rectangular cell selection through real pointer input', async ({ page }) => {
  const inserted = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const didInsert = contract.commands.commands.insertTable({ rows: 2, columns: 2, headerRow: true });
    contract.commands.commands.selectText([1, 0, 0, 0, 0], 0);
    return didInsert;
  });
  expect(inserted).toBe(true);
  await page.locator('[data-fountain-path="1.1.1"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-fountain-selected-cell="true"]')).toHaveCount(4);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('cell');

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([1, 0, 0, 0, 0], 0);
    contract.view.focus();
  });
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(page.locator('[data-fountain-selected-cell="true"]')).toHaveCount(4);

  await page.keyboard.type('First cell only');
  await expect(page.locator('[data-fountain-path="1.0.0"]')).toHaveText('First cell only');
  await expect(page.locator('[data-fountain-path="1.0.1"]')).toHaveText('');
  await expect(page.locator('[data-fountain-path="1.1.0"]')).toHaveText('');
  await expect(page.locator('[data-fountain-path="1.1.1"]')).toHaveText('');
});

test('renders and types into a structural gap as a new block', async ({ page }) => {
  const selected = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.selectGap(12);
  });
  expect(selected).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toHaveAttribute('data-fountain-gap', 'before');
  await page.keyboard.type('Between');
  await expect(page.locator('[data-fountain-path="1"]')).toHaveText('Between');
  await expect(page.locator('[data-fountain-path="2"]')).toContainText('Second paragraph');
});

test('edits Lean without a mandatory server and renders transient provider diagnostics', async ({ page }) => {
  const inserted = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const result = contract.commands.commands.insertLeanBlock('example : \\forall');
    contract.view.focus();
    return result;
  });
  expect(inserted).toBe(true);
  const lean = page.locator('pre[data-language="lean"]');
  await expect(lean).toContainText('example : \\forall');
  await page.keyboard.press('Tab');
  await expect(lean).toContainText('example : ∀');
  await page.evaluate(async () => {
    await (globalThis as any).fountainBrowserTest.leanController.check();
  });
  await expect(page.locator('[data-fountain-lean-diagnostic="error"]')).toHaveText('example');
  await expect(page.locator('#document-json')).not.toContainText('Browser fixture diagnostic');
  await page.keyboard.type(' ');
  await expect(page.locator('[data-fountain-lean-diagnostic]')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.editor.state.doc.content.some((node: any) => (
      node.attrs.language === 'lean' && node.textContent === 'example : ∀ '
    ));
  })).toBe(true);
});

test('keeps custom NodeViews live across updates and mapped moves while containing their DOM', async ({ page }) => {
  const counter = page.locator('[data-browser-counter]');
  await expect(counter).toHaveText('Count 0');
  await counter.click();
  await expect(counter).toHaveText('Count 1');
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return { ...contract.nodeViewMetrics, selection: contract.editor.state.selection.kind };
  })).toEqual({ created: 1, destroyed: 0, updates: 1, selection: 'text' });

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectNode([2]);
  });
  await expect(counter).toHaveAttribute('data-selection-hook', 'selected');

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const paragraph = contract.editor.state.schema.node('paragraph', {}, [contract.editor.state.schema.text('Leading')]);
    contract.editor.dispatch(contract.editor.state.createTransaction().replace(0, 0, [paragraph]));
  });
  expect(await page.evaluate(() => {
    const selection = (globalThis as any).fountainBrowserTest.editor.state.selection;
    return { kind: selection.kind, path: selection.nodePath };
  })).toEqual({ kind: 'node', path: [3] });
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.nodeViewMetrics.created)).toBe(1);
  await counter.click();
  await expect(counter).toHaveText('Count 2');

  await counter.evaluate((element) => { (element as HTMLElement).dataset.localState = 'kept'; });
  await expect(counter).toHaveAttribute('data-local-state', 'kept');
  await counter.evaluate((element) => { element.textContent = 'Tampered'; });
  await expect(counter).toHaveText('Count 2');
  expect(await page.evaluate(() => ({ ...(globalThis as any).fountainBrowserTest.nodeViewMetrics })))
    .toEqual({ created: 2, destroyed: 1, updates: 2 });
});

test('loads the public React playground without console or page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'One editor core. Any framework. Yours to extend.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Rich text editor' })).toContainText('Build an editor');
  expect(errors).toEqual([]);
});

test('creates and edits a link through the public React toolbar', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstParagraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await firstParagraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.getByRole('button', { name: 'Add or edit link' }).click();
  await page.getByLabel('Link URL').fill('www.example.com');
  await page.getByLabel('Link title').fill('Example website');
  await page.getByLabel('Link destination').selectOption('_self');
  await page.getByRole('button', { name: 'Apply link' }).click();

  const link = editor.getByRole('link').first();
  await expect(link).toHaveAttribute('href', 'https://www.example.com');
  await expect(link).toHaveAttribute('title', 'Example website');
  await expect(link).toHaveAttribute('target', '_self');

  await link.click();
  await page.getByRole('button', { name: 'Add or edit link' }).click();
  await expect(page.getByLabel('Link URL')).toHaveValue('https://www.example.com');
  await expect(page.getByRole('link', { name: 'Open current link' })).toHaveAttribute('href', 'https://www.example.com');
  await page.getByLabel('Link URL').fill('/internal');
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(link).toHaveAttribute('href', '/internal');
  await page.getByRole('button', { name: 'Remove link' }).click();
  await expect(editor.getByRole('link')).toHaveCount(0);
});

test('toggles a selected block through the public React list controls', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const paragraph = editor.locator('[data-fountain-node="paragraph"]').first();
  const text = await paragraph.textContent();
  await paragraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.getByRole('button', { name: 'Bullet list' }).click();
  await expect(editor.locator('ul > li').first()).toHaveText(text ?? '');
  await page.getByRole('button', { name: 'Bullet list' }).click();
  await expect(editor.locator('ul > li').filter({ hasText: text ?? '' })).toHaveCount(0);
  await expect(editor.locator('[data-fountain-node="paragraph"]').filter({ hasText: text ?? '' })).toHaveCount(1);
});

test('edits code language and line numbers through the public React toolbar', async ({ page }) => {
  await page.goto('/');
  const block = page.locator('pre.fjs-code-block');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-language', 'typescript');
  await expect(block.locator('.fjs-token--keyword').first()).toHaveText('const');
  await block.click();
  await page.getByRole('button', { name: 'Code block and language' }).click();

  const language = page.getByLabel('Code language');
  await expect(language).toHaveValue('typescript');
  await language.fill('js');
  await page.getByLabel('Show code line numbers').uncheck();
  await page.getByRole('button', { name: 'Apply' }).click();

  await expect(block).toHaveAttribute('data-language', 'javascript');
  await expect(block.locator('.fjs-code-line-number')).toHaveCount(0);
});

test('runs the public plain-DOM custom NodeView demo', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demos/plain-dom-notes.html');
  await expect(page.getByRole('heading', { name: 'Knowledge-base notes' })).toBeVisible();
  await expect(page.getByText('Custom interactive NodeView', { exact: true })).toBeVisible();

  const status = page.getByRole('button', { name: 'Incident status · Investigating' });
  await expect(status).toBeVisible();
  await status.click();
  await expect(page.getByRole('button', { name: 'Incident status · Resolved' })).toBeVisible();
  await expect(page.locator('.demo-output pre')).toContainText('"status": "Resolved"');
  expect(errors).toEqual([]);
});

test('runs the public headless Markdown and LaTeX pipeline', async ({ page }) => {
  await page.goto('/demos/node-markdown.html');
  const source = page.getByLabel('Markdown input');
  await expect(source).toContainText('$E=mc^2$');
  await expect(page.getByText('Valid document · 6 top-level blocks')).toBeVisible();
  const output = page.locator('.demo-output pre');
  await expect(output).toContainText('inline_math');
  await expect(output).toContainText('math_block');
  await expect(output).toContainText('"language": "lean"');
  await source.fill('# Formula\n\n$\\alpha+\\beta$');
  await expect(page.getByText('Valid document · 2 top-level blocks')).toBeVisible();
  await page.getByRole('button', { name: 'markdown' }).click();
  await expect(output).toContainText('$\\alpha+\\beta$');
});

test('renders and inserts native math in the public DOM integration', async ({ page }) => {
  await page.goto('/demos/go-docs-service.html');
  const math = page.locator('[data-fountain-math]');
  await expect(math).toHaveCount(2);
  await expect(math.filter({ hasText: 'T(n)=O(n \\log n)' })).toHaveAttribute('role', 'math');
  await expect(math.filter({ hasText: '\\sum_{i=1}^{n} i' })).toHaveAttribute('aria-label', 'Sum of the first n integers');
  await expect(page.locator('pre[data-language="lean"]')).toContainText('example : 1 = 1 := rfl');
  await expect(page.getByText('Source-only mode. No checker is configured and no source leaves this editor.')).toBeVisible();
  await page.getByRole('button', { name: '+ Math' }).click();
  await expect(math).toHaveCount(3);
  await expect(page.locator('.demo-output pre')).toContainText('a^2 + b^2 = c^2');
});

test('publishes semantic selection controls and table interaction in the demo gallery', async ({ page }) => {
  await page.goto('/demos/svelte-report.html');
  await expect(page.getByRole('heading', { name: 'Structured data report' })).toBeVisible();
  await expect(page.getByText('Rectangular cell selection', { exact: true })).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await expect(editor).toContainText('Quarterly service report');

  await page.locator('[data-fountain-path="2.0.0"]').click();
  await page.locator('[data-fountain-path="2.1.2"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-fountain-selected-cell="true"]')).toHaveCount(6);

  await page.getByRole('button', { name: 'Gap after first' }).click();
  await expect(page.locator('[data-fountain-path="1"]')).toHaveAttribute('data-fountain-gap', 'before');
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString() ?? '')).toContain('Quarterly service report');
});
