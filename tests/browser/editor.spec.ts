import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/browser-tests.html');
});

test('runs reference links, recursive blocks, rich tables, and loss reports in a real browser', async ({ page }) => {
  const result = await page.evaluate(() => (globalThis as any).fountainBrowserTest.inspectMarkdown([
    '> First paragraph.',
    '>',
    '> - Nested item',
    '',
    '| Path \\| label | State |',
    '| --- | :---: |',
    '| C:\\\\tmp | [Ready][status] |',
    '',
    '[status]: https://example.com/status "Status page"',
  ].join('\n')));

  expect(result.document).toEqual(result.roundTrip);
  expect(result.document.content.map((node: any) => node.type)).toEqual(['blockquote', 'table']);
  expect(result.markdown).toContain('[Ready][ref-1]');
  expect(result.markdown).toContain('[ref-1]: https://example.com/status "Status page"');
  expect(result.losses).toEqual([]);

  const losses = await page.evaluate(() => (globalThis as any).fountainBrowserTest.markdownLosses());
  expect(losses).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'node', type: 'browser_counter', path: [2] }),
  ]));
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

test('imports an extension-defined HTML node through the schema contract', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectNode([2]));
  await page.waitForTimeout(0);
  const prevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/html'
          ? '<section data-browser-counter-html data-count="7"></section>'
          : 'Counter 7',
      },
    });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.getByRole('button', { name: 'Count 7' })).toBeVisible();
  expect(await page.evaluate(() => {
    const document = (globalThis as any).fountainBrowserTest.editor.state.doc;
    const counter = document.content.find((node: any) => node.type.name === 'browser_counter');
    return counter?.attrs.count;
  })).toBe(7);
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

test('reorders nested blocks with accessible controls, drop indicators, drag, and undo', async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = (globalThis as any).fountainBrowserTest;
    const { schema } = editor.state;
    const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const quote = schema.node('blockquote', {}, [paragraph('Nested one'), paragraph('Nested two')]);
    editor.dispatch(editor.state.createTransaction().replace(0, editor.state.doc.childCount, [
      paragraph('Outside'), quote, paragraph('Tail'),
    ]));
  });

  const nestedTwo = page.locator('[data-fountain-path="1.1"]');
  await nestedTwo.hover();
  const controls = page.getByRole('toolbar', { name: 'Paragraph block controls' });
  await expect(controls).toBeVisible();
  await expect(controls).toHaveAttribute('data-fountain-block-path', '1.1');
  await expect(controls.getByRole('button', { name: 'Move Paragraph block before' })).toBeEnabled();
  await controls.getByRole('button', { name: 'Move Paragraph block before' }).click();
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.child(1).content.map((node: any) => node.textContent)
  ))).toEqual(['Nested two', 'Nested one']);
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.undo());

  await page.locator('[data-fountain-path="1.1"]').hover();
  const dragResult = await page.evaluate(() => {
    const drag = document.querySelector<HTMLElement>('[data-fountain-block-action="drag"]');
    const target = document.querySelector<HTMLElement>('[data-fountain-path="2"]');
    if (!drag || !target) throw new Error('Missing block drag fixture.');
    const transfer = new DataTransfer();
    drag.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const bounds = target.getBoundingClientRect();
    const over = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + 4,
      clientY: bounds.top + 1,
      dataTransfer: transfer,
    });
    target.dispatchEvent(over);
    const indicator = target.dataset.fountainDropPosition;
    const drop = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + 4,
      clientY: bounds.top + 1,
      dataTransfer: transfer,
    });
    target.dispatchEvent(drop);
    return { indicator, overPrevented: over.defaultPrevented, dropPrevented: drop.defaultPrevented };
  });
  expect(dragResult).toEqual({ indicator: 'before', overPrevented: true, dropPrevented: true });
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.textContent)
  ))).toEqual(['Outside', 'Nested one', 'Nested two', 'Tail']);
  await expect(page.locator('[data-fountain-drop-position]')).toHaveCount(0);
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.undo());
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.child(1).content.map((node: any) => node.textContent)
  ))).toEqual(['Nested one', 'Nested two']);

  const external = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('[data-fountain-path="0"]');
    if (!target) throw new Error('Missing untrusted-drop target.');
    const transfer = new DataTransfer();
    transfer.setData('application/x-fountain-node-path', JSON.stringify([2]));
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer });
    target.dispatchEvent(drop);
    return {
      prevented: drop.defaultPrevented,
      content: (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.textContent),
    };
  });
  expect(external).toEqual({ prevented: true, content: ['Outside', 'Nested oneNested two', 'Tail'] });
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
  await image.locator('img').click();
  await expect(image).toHaveAttribute('data-fountain-selected-node', 'true');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('node');

  await page.keyboard.press('Backspace');
  await expect(image).toHaveCount(0);
});

test('edits, aligns, resizes, and undoes a production image through accessible controls', async ({ page }) => {
  const dataURL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  expect(await page.evaluate((src) => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.insertImage({
      src,
      alt: 'Resizable image',
      caption: 'Initial caption',
      width: '360px',
      align: 'center',
    });
  }, dataURL)).toBe(true);

  const figure = page.locator('.fountain-image');
  await expect(figure).toHaveAttribute('role', 'figure');
  await figure.click();
  await expect(figure).toHaveAttribute('data-fountain-image-selected', 'true');
  const caption = figure.getByRole('textbox', { name: 'Image caption' });
  await caption.fill('A caption edited in the node view');
  await caption.press('ControlOrMeta+Enter');
  await expect.poll(() => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.content.find((node: any) => node.type.name === 'image_super')?.attrs.caption))
    .toBe('A caption edited in the node view');

  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.setImageAlignment('right'))).toBe(true);
  await expect(figure).toHaveAttribute('data-align', 'right');

  const keyboardHandle = figure.getByRole('slider', { name: 'Resize image from right' });
  await keyboardHandle.focus();
  await keyboardHandle.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.content.find((node: any) => node.type.name === 'image_super')?.attrs.width)).toBe('370px');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.content.find((node: any) => node.type.name === 'image_super')?.attrs.width)).toBe('360px');

  await figure.hover();
  const dragHandle = figure.getByRole('slider', { name: 'Resize image from left' });
  const box = await dragHandle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2 - 55, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.mouse.up();
  const resized = await page.evaluate(() => String((globalThis as any).fountainBrowserTest.editor.state.doc.content.find((node: any) => node.type.name === 'image_super')?.attrs.width));
  expect(Number.parseInt(resized, 10)).toBeGreaterThanOrEqual(410);
});

test('inserts and removes a true inline image without breaking surrounding text', async ({ page }) => {
  const dataURL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  expect(await page.evaluate((src) => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 0], 5);
    return contract.commands.commands.insertInlineImage({ src, alt: 'Inline status', width: '1em', height: '1em' });
  }, dataURL)).toBe(true);
  const inline = page.locator('[data-fountain-node="inline_image"]');
  await expect(inline).toHaveAttribute('data-fountain-inline-image', 'true');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).content.map((node: any) => node.type.name)))
    .toEqual(['text', 'inline_image', 'text']);
  await inline.click();
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('node');
  await page.keyboard.press('Delete');
  await expect(inline).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).textContent)).toBe('Alpha Beta');
});

test('tracks and cancels browser-native image upload tasks', async ({ page }) => {
  const started = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const task = contract.startImageUpload(
      contract.editor,
      new File(['image'], 'browser.png', { type: 'image/png' }),
      {
        upload: async (_file: File, context: any) => {
          context.reportProgress(.4);
          await new Promise((resolve) => setTimeout(resolve, 40));
          return { src: 'https://cdn.example.com/browser.png', alt: 'Browser upload' };
        },
      },
    );
    (globalThis as any).browserImageUpload = task;
    return { status: task.snapshot.status, progress: task.snapshot.progress };
  });
  expect(started).toEqual({ status: 'uploading', progress: .4 });
  await expect.poll(() => page.evaluate(() => (globalThis as any).browserImageUpload.snapshot.status)).toBe('succeeded');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.content.some((node: any) => node.attrs.src === 'https://cdn.example.com/browser.png'))).toBe(true);

  const cancelled = await page.evaluate(async () => {
    const contract = (globalThis as any).fountainBrowserTest;
    const task = contract.startImageUpload(
      contract.editor,
      new File(['image'], 'cancel.png', { type: 'image/png' }),
      {
        upload: (_file: File, context: any) => new Promise((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
        }),
      },
    );
    task.completion.catch(() => undefined);
    task.cancel();
    await Promise.resolve();
    return task.snapshot.status;
  });
  expect(cancelled).toBe('cancelled');
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

test('edits merged tables, resizes columns, toggles headers, and exchanges spreadsheet grids', async ({ page }) => {
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { editor, commands } = contract;
    const { schema } = editor.state;
    const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const cell = (text: string) => schema.node('table_cell', {}, [paragraph(text)]);
    const table = schema.node('table', {}, [
      schema.node('table_row', {}, [cell('A'), cell('B')]),
      schema.node('table_row', {}, [cell('C'), cell('D')]),
    ]);
    editor.dispatch(editor.state.createTransaction().replace(0, editor.state.doc.childCount, [table]));
    commands.commands.selectCells([0, 0, 0], [0, 1, 1]);
    return commands.commands.mergeTableCells();
  })).toBe(true);
  const merged = page.locator('[data-fountain-path="0.0.0"]');
  await expect(merged).toHaveAttribute('colspan', '2');
  await expect(merged).toHaveAttribute('rowspan', '2');
  await expect(merged).toContainText('ABCD');

  const resize = merged.locator('.fountain-table-cell__resize-handle');
  await expect(resize).toHaveAttribute('role', 'separator');
  await resize.press('ArrowRight');
  const width = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).child(0).child(0).attrs.colwidth
  ));
  expect(width).toHaveLength(2);
  expect(width[1]).toBeGreaterThanOrEqual(40);

  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.splitTableCell();
  })).toBe(true);
  await expect(page.locator('[data-fountain-node="table_cell"]')).toHaveCount(4);
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 0, 0, 0, 0], 0);
    return contract.commands.commands.toggleTableHeaderRow();
  })).toBe(true);
  await expect(page.locator('th')).toHaveCount(2);

  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.selectCells([0, 0, 0], [0, 1, 1]);
  })).toBe(true);
  const copied = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const values: Record<string, string> = {};
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => values[type] ?? '',
      setData: (type: string, value: string) => { values[type] = value; },
    } });
    editor.dispatchEvent(event);
    return { prevented: event.defaultPrevented, values };
  });
  expect(copied.prevented).toBe(true);
  expect(copied.values['text/plain']).toContain('\t');
  expect(copied.values['text/html']).toContain('<table>');

  const pasted = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/plain' ? '1\t2\n3\t4' : '',
    } });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(pasted).toBe(true);
  await expect(page.locator('[data-fountain-node="table_cell"], [data-fountain-node="table_header"]')).toHaveText(['1', '2', '3', '4']);
});

test('keeps normal paste while offering bounded editor-local clipboard slots', async ({ page }) => {
  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 0], 0, 5);
  });
  await page.waitForTimeout(0);
  const prevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('copy', { bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.clipboardHistory()?.entries[0]?.text
  ))).toBe('Alpha');

  await page.getByRole('textbox', { name: 'Browser contract editor' }).press('Control+Alt+v');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.clipboardHistory()?.open)).toBe(true);
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([1, 0], 16);
    const id = contract.clipboardHistory().entries[0].id;
    return contract.commands.commands.pasteClipboardHistoryEntry(id);
  })).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toHaveText('Second paragraphAlpha');

  const normalPaste = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/plain' ? '!' : '',
    } });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(normalPaste).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toHaveText('Second paragraphAlpha!');
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
  const heading = page.getByRole('heading', { name: 'One editor core. Any framework. Yours to extend.' });
  await expect(heading).toBeVisible();
  const heroLines = await heading.locator(':scope > *').evaluateAll((lines) =>
    lines.map((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      return {
        top: line.getBoundingClientRect().top,
        visualLines: range.getClientRects().length,
      };
    }),
  );
  expect(heroLines).toHaveLength(3);
  expect(heroLines.every(({ visualLines }) => visualLines === 1)).toBe(true);
  expect(heroLines[1].top).toBeGreaterThan(heroLines[0].top);
  expect(heroLines[2].top).toBeGreaterThan(heroLines[1].top);
  await expect(page.getByRole('textbox', { name: 'Rich text editor' })).toContainText('Build an editor');
  expect(errors).toEqual([]);
});

test('uses package-backed mentions, emoji, typography, and live counting in the public React playground', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const count = page.locator('.fountain-character-count');
  await expect(count).toBeVisible();
  await expect(count).toHaveAttribute('aria-live', 'polite');
  const before = Number((await count.textContent())?.match(/\d+/)?.[0] ?? 0);

  const firstParagraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await firstParagraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('@a');

  const mentionMenu = page.locator('.fountain-suggestion-menu[aria-label="Mention a person or topic"]');
  await expect(mentionMenu).toBeVisible();
  await expect(editor.locator('[data-fountain-suggestion-query="@"]')).toHaveText('@a');
  await expect(mentionMenu.getByRole('option')).toHaveCount(3);
  const mentionListboxId = await mentionMenu.getByRole('listbox').getAttribute('id') ?? '';
  await expect(editor).toHaveAttribute('aria-expanded', 'true');
  await expect(editor).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(editor).toHaveAttribute('aria-controls', mentionListboxId);
  await expect(mentionMenu.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toHaveAttribute('aria-activedescendant', await mentionMenu.getByRole('option').first().getAttribute('id') ?? '');
  await page.keyboard.press('ArrowDown');
  await expect(mentionMenu.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toHaveAttribute('aria-activedescendant', await mentionMenu.getByRole('option').nth(1).getAttribute('id') ?? '');
  await page.keyboard.press('Enter');
  await expect(mentionMenu).toHaveCount(0);
  await expect(editor).not.toHaveAttribute('aria-expanded');
  await expect(editor).not.toHaveAttribute('aria-controls');
  const mention = editor.locator('[data-fountain-mention="true"]').last();
  await expect(mention).toHaveText('@Grace Hopper');
  await expect(mention).toHaveAttribute('data-id', 'grace');
  await expect(mention).toHaveAttribute('data-kind', 'person');

  await page.keyboard.type(':rock');
  const emojiMenu = page.locator('.fountain-suggestion-menu[aria-label="Choose an emoji"]');
  await expect(emojiMenu).toBeVisible();
  await expect(editor.locator('[data-fountain-suggestion-query=":"]')).toHaveText(':rock');
  await expect(emojiMenu.getByRole('option')).toHaveCount(1);
  await expect(emojiMenu.getByRole('option')).toContainText('rocket');
  const menuBounds = await emojiMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((menuBounds?.x ?? -1)).toBeGreaterThanOrEqual(0);
  expect((menuBounds?.x ?? 0) + (menuBounds?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect((menuBounds?.y ?? -1)).toBeGreaterThanOrEqual(0);
  expect((menuBounds?.y ?? 0) + (menuBounds?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  await page.keyboard.press('Enter');
  const emoji = editor.locator('[data-fountain-emoji="true"]').last();
  await expect(emoji).toContainText('🚀');
  await expect(emoji).toHaveAttribute('data-name', 'rocket');

  await page.keyboard.type('--');
  const createdParagraph = editor.locator('[data-fountain-node="paragraph"]').nth(1);
  await expect(createdParagraph).toContainText('@Grace Hopper 🚀 —');
  await expect.poll(async () => Number((await count.textContent())?.match(/\d+/)?.[0] ?? 0)).toBeGreaterThan(before);
});

test('runs grouped default and product slash commands in the public React playground', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstParagraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await firstParagraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/heading 2');

  const menu = page.locator('.fountain-slash-command-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option')).toHaveCount(1);
  await expect(menu.getByRole('option')).toContainText('Heading 2');
  await expect(editor).toHaveAttribute('aria-controls', await menu.getByRole('listbox').getAttribute('id') ?? 'missing');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(editor.locator('h2').last()).toBeAttached();

  await page.reload();
  const freshEditor = page.getByRole('textbox', { name: 'Rich text editor' });
  const freshParagraph = freshEditor.locator('[data-fountain-node="paragraph"]').first();
  await freshParagraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/callout');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await expect(menu.getByText('Product', { exact: true })).toBeVisible();
  await menu.getByRole('option').click();
  await expect(freshEditor.locator('.demo-callout').last()).toContainText('A custom node supplied by the demo extension.');
});

test('runs accessible bubble and floating menus in the public React playground', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstText = editor.locator('[data-fountain-text-path]').first();
  await firstText.click();
  await firstText.evaluate((wrapper) => {
    const text = wrapper.firstChild;
    if (!text) throw new Error('Expected editor text.');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(10, text.textContent?.length ?? 0));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });

  const bubble = page.getByRole('toolbar', { name: 'Selection actions' });
  await expect(bubble).toBeVisible();
  await expect(bubble.getByRole('button')).toHaveCount(4);
  await bubble.getByRole('button', { name: 'Bold selection' }).click();
  await expect(editor.locator('strong').first()).toContainText('Build an e');

  const paragraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await paragraph.click();
  await paragraph.locator('[data-fountain-text-path]').last().evaluate((wrapper) => {
    const range = document.createRange();
    range.selectNodeContents(wrapper);
    range.collapse(false);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Enter');
  const floating = page.getByRole('toolbar', { name: 'Empty block actions' });
  await expect(floating).toBeVisible();
  await expect(floating.getByRole('button')).toHaveCount(3);
  await floating.getByRole('button', { name: 'Use heading 2' }).click();
  await expect(editor.locator('h2').last()).toBeAttached();
});

test('composes and keyboard-navigates the public toolbar by stable group and action IDs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Use compact toolbar' }).click();

  const toolbar = page.getByRole('toolbar', { name: 'Compact writing toolbar' });
  await expect(toolbar).toBeVisible();
  expect(await toolbar.locator('[data-fountain-toolbar-group]').evaluateAll((groups) => groups.map((group) => group.getAttribute('data-fountain-toolbar-group')))).toEqual([
    'marks', 'block-types', 'history',
  ]);
  await expect(toolbar.locator('[data-fountain-toolbar-group="marks"]')).toHaveAttribute('aria-label', 'Essential formatting');
  expect((await toolbar.locator('[data-fountain-toolbar-group="marks"] [data-fountain-toolbar-action]').evaluateAll((actions) => actions.map((action) => action.getAttribute('data-fountain-toolbar-action')))).slice(0, 4)).toEqual([
    'highlight', 'bold', 'italic', 'underline',
  ]);
  await expect(toolbar.locator('[data-fountain-toolbar-action="strike"]')).toHaveCount(0);

  const highlight = toolbar.getByRole('button', { name: 'Highlight' });
  const strong = toolbar.getByRole('button', { name: 'Strong emphasis' });
  await highlight.focus();
  await page.keyboard.press('ArrowRight');
  await expect(strong).toBeFocused();

  const firstText = page.getByRole('textbox', { name: 'Rich text editor' }).locator('[data-fountain-text-path]').first();
  await firstText.evaluate((wrapper) => {
    const text = wrapper.firstChild;
    if (!text) throw new Error('Expected editor text.');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(5, text.textContent?.length ?? 0));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await strong.click();
  await expect(page.getByRole('textbox', { name: 'Rich text editor' }).locator('strong').first()).toContainText('Build');
});

test('uses the public React image workflow for metadata, alignment, and replacement', async ({ page }) => {
  await page.goto('/');
  const dataURL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const insertButton = page.getByRole('button', { name: 'Insert image from URL' });
  await insertButton.focus();
  await insertButton.press('Enter');
  await page.getByLabel('Image URL').fill(dataURL);
  await page.getByLabel('Alternative text').fill('Public workflow image');
  await page.getByLabel('Image title').fill('Portable image metadata');
  await page.getByLabel('Image caption').fill('Caption from the toolbar');
  await page.getByLabel('Image width').fill('420px');
  await page.getByText('Responsive sources', { exact: true }).click();
  await page.getByLabel('Image source set').fill('https://cdn.example.com/small.png 480w, https://cdn.example.com/large.png 1200w');
  await page.getByLabel('Image sizes').fill('(max-width: 600px) 100vw, 420px');
  await page.getByRole('button', { name: 'Insert URL' }).click();

  const figure = page.locator('.fountain-image').last();
  await expect(figure).toHaveAttribute('aria-label', '[Image: Public workflow image]');
  await expect(figure).toHaveCSS('width', '420px');
  await figure.locator('img').click();
  await page.getByRole('button', { name: 'Edit selected image' }).click();
  const imageForm = page.locator('form.is-image');
  await imageForm.getByLabel('Image caption').fill('Edited from the public React controls');
  await imageForm.getByLabel('Image alignment').selectOption('right');
  await imageForm.getByRole('button', { name: 'Save image' }).click();
  await expect(figure).toHaveAttribute('data-align', 'right');
  await expect(figure.getByRole('textbox', { name: 'Image caption' })).toHaveValue('Edited from the public React controls');

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'replacement.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
  });
  await expect(page.locator('form.is-image').getByRole('status')).toContainText('replacement.gif inserted');
  await expect(figure.locator('img')).toHaveAttribute('src', /^data:image\/gif;base64,/);
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

test('opens the searchable clipboard-history picker in the public React toolbar', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const paragraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await paragraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(async () => page.getByRole('button', { name: /Clipboard history/ }).isEnabled()).toBe(true);
  await page.keyboard.press('End');
  await page.getByRole('button', { name: /Clipboard history/ }).click();

  const picker = page.getByRole('dialog', { name: 'Clipboard history' });
  await expect(picker).toBeVisible();
  await expect(picker.getByText('Copied in this editor · stored in memory')).toBeVisible();
  await expect(picker.locator('summary')).toContainText('document types, behavior, formats');
  await expect(picker.locator('summary')).toHaveAttribute('title', /document types, behavior, formats/);
  await picker.getByLabel('Search clipboard history').fill('document types');
  await expect(picker.locator('[role="listitem"]')).toHaveCount(1);
  await picker.getByRole('button', { name: 'Paste' }).click();
  await expect(picker).toHaveCount(0);
  await expect(paragraph).toContainText('document types, behavior, formats');
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
  await expect(source).toContainText('[reference links][formats]');
  await expect(page.getByText('Valid document · 7 top-level blocks · no reported Markdown losses')).toBeVisible();
  const output = page.locator('.demo-output pre');
  await expect(output).toContainText('inline_math');
  await expect(output).toContainText('math_block');
  await expect(output).toContainText('"language": "lean"');
  await expect(output).toContainText('table');
  await expect(output).toContainText('Format boundary guide');
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

test('runs production images, native media, safe embeds, and host-owned uploads through the public Custom Element', async ({ page }) => {
  await page.goto('/demos/angular-media.html');
  await expect(page.getByRole('heading', { name: 'Media-rich campaign story' })).toBeVisible();

  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await expect(editor.locator('[data-fountain-node="inline_image"]')).toHaveCount(1);
  const figure = editor.locator('.fountain-image');
  await expect(figure).toHaveCount(1);
  await expect(figure.getByRole('textbox', { name: 'Image caption' })).toHaveValue(/Select me to edit/);
  await expect(figure.getByRole('slider', { name: 'Resize image from right' })).toBeVisible();

  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['framework-neutral upload'], 'portable.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
      clientX: 20,
      clientY: 20,
    }));
  });

  const status = page.getByRole('status');
  await expect(status).toContainText('Uploading portable.png');
  await expect(status).toContainText('portable.png: succeeded');
  await expect(editor.locator('.fountain-image')).toHaveCount(2);
  await expect(editor.locator('.fountain-image img[alt="portable"]')).toBeVisible();
  await expect(page.locator('.demo-output pre')).toContainText('Uploaded through the demo host adapter.');

  await expect(editor.locator('.fountain-media--audio audio[controls]')).toHaveCount(1);
  await expect(editor.locator('.fountain-media--video video[controls][playsinline]')).toHaveCount(1);
  await expect(editor.locator('.fountain-media--file .fountain-file')).toContainText('campaign-artwork.svg');
  const embed = editor.locator('.fountain-media--embed iframe');
  await expect(embed).toHaveAttribute('src', /youtube-nocookie\.com\/embed/);
  await expect(embed).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  await expect(embed).toHaveAttribute('title', 'Approved campaign embed');

  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['framework-neutral audio'], 'voice.mp3', { type: 'audio/mpeg' }));
    element.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
      clientX: 20,
      clientY: 20,
    }));
  });
  await expect(status).toContainText('Uploading voice.mp3');
  await expect(status).toContainText('voice.mp3: succeeded');
  await expect(editor.locator('.fountain-media--audio')).toHaveCount(2);
  await expect(page.locator('.demo-output pre')).toContainText('Audio uploaded through the Angular-owned adapter.');
});

test('uses the public React media workflow for native playback, provider-gated embeds, and asset uploads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Insert audio, video, file, or embed' }).click();
  await page.getByLabel('Media URL').fill('https://cdn.example.com/podcast.mp3');
  await page.getByLabel('Media title').fill('Product podcast');
  await page.getByLabel('Media caption').fill('A framework-neutral audio node.');
  await page.getByRole('button', { name: 'Insert URL' }).click();
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await expect(editor.locator('.fountain-media--audio audio[controls]')).toHaveCount(1);
  await expect(editor.locator('.fountain-media--audio')).toContainText('A framework-neutral audio node.');

  await editor.locator('.fountain-media--audio figcaption').click();
  await page.getByRole('button', { name: 'Edit selected media' }).click();
  await expect(page.getByLabel('Media type')).toBeDisabled();
  await page.getByLabel('Media title').fill('Edited podcast');
  await page.getByRole('button', { name: 'Save media' }).click();
  await expect(editor.locator('.fountain-media--audio')).toHaveAttribute('aria-label', '[Audio: Edited podcast]');

  await editor.locator('.fountain-media--audio figcaption').click();
  await page.keyboard.press('Delete');
  await expect(editor.locator('.fountain-media--audio')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.locator('.fountain-media--audio')).toHaveAttribute('aria-label', '[Audio: Edited podcast]');

  await editor.locator('p').last().click();
  await page.getByRole('button', { name: 'Insert audio, video, file, or embed' }).click();
  await page.getByLabel('Media type').selectOption('embed');
  await page.getByLabel('Media URL').fill('https://untrusted.example/embed/42');
  await page.getByLabel('Media title').fill('Rejected iframe');
  await page.getByRole('button', { name: 'Insert URL' }).click();
  await expect(page.getByLabel('Media URL')).toBeVisible();
  await expect(editor.locator('iframe')).toHaveCount(0);
  await page.getByLabel('Media URL').fill('https://vimeo.com/12345678');
  await page.getByLabel('Media title').fill('Approved Vimeo demo');
  await page.getByRole('button', { name: 'Insert URL' }).click();
  await expect(editor.locator('.fountain-media--embed iframe')).toHaveAttribute('src', 'https://player.vimeo.com/video/12345678');
  await expect(editor.locator('.fountain-media--embed iframe')).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');

  const upload = page.locator('input[type="file"][accept^="audio/"]');
  await upload.setInputFiles({ name: 'voice.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('demo audio') });
  await expect(page.getByRole('status').filter({ hasText: 'Uploading voice.mp3' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'voice.mp3 inserted' })).toBeVisible();
  await expect(editor.locator('.fountain-media--audio')).toHaveCount(2);
});
