import { expect, test, type Page, type TestInfo } from '@playwright/test';

const pause = (page: Page, milliseconds = 550) => page.waitForTimeout(milliseconds);

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, {
    path,
    contentType: 'image/png',
  });
}

test('human multiline equation journey: inspect, edit, undo, export, and reimport', async ({ page }, testInfo) => {
  await page.goto('/demos/go-docs-service.html');
  const latex = '\\begin{aligned}\nx_0 &= 1 \\\\\nx_{n+1} &= 2x_n\n\\end{aligned}';
  await page.getByLabel('Math source', { exact: true }).fill(latex);
  await page.getByRole('button', { name: '+ New Math', exact: true }).click();
  const math = page.locator('[data-fountain-math="block"]').first();
  const direct = page.locator('[aria-label="Edit math source"]:visible');
  await expect(direct).toHaveValue(latex);
  await expect(math.locator('[data-fountain-math-source]')).toHaveCSS('white-space', 'pre-wrap');
  await math.scrollIntoViewIfNeeded();
  await capture(page, testInfo, '01-multiline-source-intact');
  await direct.focus();
  await direct.press('Control+Enter');
  await expect(math).toHaveAttribute('aria-label', 'Editable math expression');
  await direct.focus();
  await direct.press('Control+Home');
  await direct.press('ArrowDown');
  await direct.press('ArrowDown');
  await direct.press('End');
  await direct.press('Shift+Home');
  await page.keyboard.type('x_{n+1} &= 3x_n');
  const edited = latex.replace('2x_n', '3x_n');
  await expect(direct).toHaveValue(edited);
  await expect(math).toHaveAttribute('data-latex', edited);
  await direct.press('Control+Enter');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(math).toHaveAttribute('data-latex', latex);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(math).toHaveAttribute('data-latex', edited);
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await output.locator('pre').innerText();
  expect(markdown).toContain(`$$\n${edited}\n$$`);
  await math.scrollIntoViewIfNeeded();
  await capture(page, testInfo, '02-edited-equation-and-export');
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect(output.locator('pre')).toContainText(JSON.stringify(edited));
});

test('human Go-docs journey: selection, quote, tables, math, Lean, paste, and trailing input', async ({ page, context }, testInfo) => {
  test.setTimeout(60_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const output = page.locator('.demo-output pre');

  await test.step('make and preserve a backward selection, then toggle a quote', async () => {
    const paragraph = editor.locator(':scope > p').first();
    await paragraph.click();
    await editor.press('End');
    for (let index = 0; index < 6; index += 1) await editor.press('Shift+ArrowLeft');
    expect(await editor.evaluate(() => {
      const selection = document.getSelection();
      if (!selection?.anchorNode || !selection.focusNode || selection.isCollapsed) return false;
      if (selection.anchorNode === selection.focusNode) return selection.anchorOffset > selection.focusOffset;
      return Boolean(selection.anchorNode.compareDocumentPosition(selection.focusNode)
        & Node.DOCUMENT_POSITION_PRECEDING);
    })).toBe(true);
    await page.getByRole('button', { name: 'Quote', exact: true }).click();
    await expect(editor.locator(':scope > blockquote')).toContainText('Technical prose');
    await capture(page, testInfo, '01-backward-selection-quoted');
    await pause(page);
    await page.getByRole('button', { name: 'Remove quote' }).click();
    await expect(editor.locator(':scope > blockquote')).toHaveCount(0);
  });

  await test.step('edit a selected LaTeX block directly and create a second one', async () => {
    const math = editor.locator('[data-fountain-math]');
    const display = math.filter({ hasText: '\\sum_{i=1}^{n} i' });
    await display.click();
    const directSource = page.locator('[aria-label="Edit math source"]:visible');
    await expect(directSource).toHaveValue('\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}');
    await directSource.fill('a^2 + b^2 = c^2');
    await directSource.press('Control+Enter');
    const edited = math.filter({ hasText: 'a^2 + b^2 = c^2' });
    await expect(edited).toHaveAttribute('aria-label', 'Math expression: a^2 + b^2 = c^2');
    await expect(output).toContainText('"ariaLabel": ""');

    await page.getByLabel('Math source', { exact: true }).fill('e^{i\\pi} + 1 = 0');
    await page.getByRole('button', { name: '+ New Math' }).click();
    await expect(math).toHaveCount(3);
    await capture(page, testInfo, '02-direct-and-new-math');
    await pause(page);
  });

  await test.step('edit Lean source and use its unicode shortcut without a provider', async () => {
    const lean = editor.locator('pre[data-language="lean"]');
    await lean.click();
    await editor.press('End');
    await editor.press('Enter');
    await editor.pressSequentially('example : \\forall', { delay: 35 });
    await editor.press('Tab');
    await expect(lean).toContainText('example : ∀');
    await expect(output).toContainText('example : ∀');
    await expect(page.getByText('Source-only mode. No checker is configured and no source leaves this editor.')).toBeVisible();
    await lean.scrollIntoViewIfNeeded();
    await capture(page, testInfo, '03-lean-source-and-portable-json');
    await pause(page);
  });

  await test.step('insert an explicitly sized table and remove the whole table', async () => {
    const tables = editor.locator('table');
    await page.getByLabel('Table rows').fill('3');
    await page.getByLabel('Table columns').fill('4');
    await page.getByRole('button', { name: '+ Table', exact: true }).click();
    await expect(tables).toHaveCount(2);
    const inserted = tables.first();
    await expect(inserted.locator('tr')).toHaveCount(3);
    expect(await inserted.locator('tr').first().locator('th, td').count()).toBe(4);
    await inserted.locator('th, td').first().click();
    await page.getByRole('button', { name: 'Table options' }).click();
    await capture(page, testInfo, '04-labelled-table-options');
    await pause(page);
    await page.getByRole('button', { name: 'Delete entire table' }).click();
    await expect(tables).toHaveCount(1);
    await expect(editor.locator(':scope > p').last()).toBeVisible();
  });

  await test.step('create visible blank lines and paste a real browser clipboard value', async () => {
    await editor.click();
    await editor.press('Control+End');
    await editor.press('Enter');
    await editor.press('Enter');
    await editor.pressSequentially('Pasted release evidence', { delay: 30 });
    await editor.press('Shift+Home');
    await editor.press('Control+C');
    await editor.press('End');
    await editor.press('Enter');
    await editor.press('Control+V');
    await expect(editor).toContainText('Pasted release evidence');
    const occurrences = (await editor.textContent())?.match(/Pasted release evidence/g)?.length ?? 0;
    expect(occurrences).toBeGreaterThanOrEqual(2);
    await editor.locator(':scope > p').last().scrollIntoViewIfNeeded();
    await capture(page, testInfo, '05-newlines-and-real-clipboard-paste');
    await pause(page);
  });

  expect(errors).toEqual([]);
});

test('human clipboard journey: external rich document into Fountain and Fountain back out', async ({ page, context }, testInfo) => {
  test.setTimeout(45_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/');
  await page.setContent(`<!doctype html><meta charset="utf-8"><title>External editor</title>
    <main contenteditable="true" role="textbox" aria-label="External rich editor" style="font:18px system-ui;padding:40px;max-width:760px">
      <h2>External incident note</h2>
      <p>A <strong>formatted</strong> paragraph from another browser editor.</p>
      <ul><li>First external task</li><li>Second external task</li></ul>
      <table border="1"><tr><th>Owner</th><th>Status</th></tr><tr><td>Ada</td><td>Ready</td></tr></table>
    </main>`);
  const external = page.getByRole('textbox', { name: 'External rich editor' });
  await external.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+C');
  await capture(page, testInfo, '01-external-rich-source');
  await pause(page);

  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+V');
  await expect(editor.getByRole('heading', { name: 'External incident note' })).toBeVisible();
  await expect(editor.locator('strong')).toContainText('formatted');
  await expect(editor.locator('ul')).toContainText('Second external task');
  await expect(editor.locator('table')).toHaveCount(2);
  await editor.getByRole('heading', { name: 'External incident note' }).scrollIntoViewIfNeeded();
  await capture(page, testInfo, '02-external-rich-content-in-fountain');
  await pause(page);

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+C');
  await page.setContent(`<!doctype html><meta charset="utf-8"><title>External receiver</title>
    <main contenteditable="true" role="textbox" aria-label="External receiver" style="font:18px system-ui;padding:40px;max-width:900px;min-height:500px"></main>`);
  const receiver = page.getByRole('textbox', { name: 'External receiver' });
  await receiver.click();
  await page.keyboard.press('Control+V');
  await expect(receiver).toContainText('Create an API client');
  await expect(receiver).toContainText('External incident note');
  await expect(receiver.locator('strong')).toContainText('formatted');
  await expect(receiver.locator('table')).toHaveCount(2);
  await capture(page, testInfo, '03-fountain-rich-content-in-external-editor');
  await pause(page);
});

test('human homepage journey: live outline, invisible text review, and structural drag feedback', async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');

  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const outline = page.getByRole('navigation', { name: 'Document outline' });
  const secondHeading = outline.getByRole('button', { name: 'What you can test here' });
  await secondHeading.click();
  await expect(secondHeading).toHaveAttribute('aria-current', 'location');
  await capture(page, testInfo, '01-live-outline-navigation');
  await pause(page);

  await test.step('expose and explicitly review an invisible character', async () => {
    const sample = editor.locator('p', { hasText: 'Integrity sample:' });
    await sample.scrollIntoViewIfNeeded();
    await sample.locator('[data-fountain-text-path]').evaluate((wrapper) => {
      const text = wrapper.firstChild;
      if (!text?.textContent) throw new Error('Expected the integrity sample text.');
      const start = text.textContent.indexOf('ABC123');
      const end = text.textContent.indexOf('xyz') + 3;
      const selection = document.getSelection();
      wrapper.closest<HTMLElement>('[contenteditable="true"]')?.focus();
      selection?.removeAllRanges();
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, end);
      selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    const inspector = page.getByRole('region', { name: 'Text integrity' });
    await expect(inspector).toContainText('U+200B');
    await inspector.getByRole('button', { name: 'Show invisibles' }).click();
    await expect(sample.locator('[data-fountain-invisible="zero-width-space"]')).toHaveCount(1);
    await capture(page, testInfo, '02-invisible-character-exposed');
    await pause(page);
    await inspector.getByLabel('Remove zero-width characters and BOM').check();
    await inspector.getByRole('button', { name: 'Preview cleanup' }).click();
    await expect(inspector.getByRole('region', { name: 'Cleanup preview' })).toContainText('ABC123xyz');
    await inspector.getByRole('button', { name: 'Apply reviewed cleanup' }).click();
    await expect(sample.locator('[data-fountain-invisible="zero-width-space"]')).toHaveCount(0);
  });

  await test.step('show whole-block hover and keyboard-grab feedback', async () => {
    const heading = editor.locator(':scope > h2').first();
    await heading.hover();
    await expect(heading).toHaveAttribute('data-fountain-block-active', 'true');
    const controls = page.getByRole('toolbar', { name: 'Heading block controls' });
    const drag = controls.getByRole('button', { name: 'Drag Heading block' });
    await drag.focus();
    await expect(heading).toHaveAttribute('data-fountain-block-handle-active', 'true');
    await capture(page, testInfo, '03-whole-block-handle-focus');
    await pause(page);
    await drag.press('Space');
    await expect(heading).toHaveAttribute('data-fountain-block-grabbed', 'true');
    await capture(page, testInfo, '04-keyboard-grab-active');
    await pause(page);
    await drag.press('ArrowDown');
    await expect(editor.locator('[data-fountain-block-grabbed="true"]')).toHaveCount(1);
    await drag.press('Escape');
    await expect(editor.locator('[data-fountain-block-grabbed]')).toHaveCount(0);

    const target = editor.locator(':scope > p').first();
    await target.scrollIntoViewIfNeeded();
    const currentHeading = editor.locator(':scope > h2').first();
    await currentHeading.hover();
    const pointerDrag = page.getByRole('button', { name: 'Drag Heading block' });
    const dragBox = await pointerDrag.boundingBox();
    const targetBox = await target.boundingBox();
    expect(dragBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    if (dragBox && targetBox) {
      await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(dragBox.x + dragBox.width / 2 + 12, dragBox.y + dragBox.height / 2 + 12, { steps: 4 });
      await page.mouse.move(targetBox.x + 20, targetBox.y + 2, { steps: 14 });
      const indicator = page.locator('[data-fountain-block-drop-indicator]');
      await expect(indicator).toBeVisible();
      await expect(target).toHaveAttribute('data-fountain-drop-position', 'before');
      await capture(page, testInfo, '05-separate-pointer-drop-indicator');
      await pause(page);
      await page.mouse.up();
      await expect(indicator).toBeHidden();
    }
  });

  expect(errors).toEqual([]);
});
