# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editor.spec.ts >> turns multi-format and multi-block selections into visible paragraph boundaries
- Location: tests\browser\editor.spec.ts:7544:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('textbox', { name: 'Browser contract editor' }).locator('[data-fountain-widget="remote"]')
Expected: 1
Received: 2
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByRole('textbox', { name: 'Browser contract editor' }).locator('[data-fountain-widget="remote"]')
    14 × locator resolved to 2 elements
       - unexpected value "2"

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - heading "Browser contract" [level=1] [ref=f1e3]
  - generic [ref=f1e4]:
    - textbox "Browser contract editor" [active] [ref=f1e5]:
      - paragraph [ref=f1e6]:
        - generic [ref=f1e7]:
          - text: Alp
          - generic [ref=f1e8]: ha
      - paragraph [ref=f1e9]:
        - generic [ref=f1e10]: Remote
        - generic [ref=f1e11]: Remote paragraph
      - button "Count 0" [ref=f1e12]
      - paragraph [ref=f1e13]
    - toolbar "Paragraph block controls" [ref=f1e14]:
      - button "Drag Paragraph block" [ref=f1e15]
      - button "Move Paragraph block before" [ref=f1e18] [cursor=pointer]
      - button "Move Paragraph block after" [ref=f1e21] [cursor=pointer]
  - status "Document JSON" [ref=f1e24]: "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"attrs\":{\"align\":\"left\"},\"content\":[{\"type\":\"text\",\"text\":\"Alpha\"}]},{\"type\":\"paragraph\",\"attrs\":{\"align\":\"left\"},\"content\":[{\"type\":\"text\",\"text\":\"\"},{\"type\":\"text\",\"text\":\" paragraph\"}]},{\"type\":\"browser_counter\",\"attrs\":{\"count\":0,\"pageHeight\":0}},{\"type\":\"paragraph\",\"attrs\":{\"align\":\"left\"},\"content\":[{\"type\":\"text\",\"text\":\"\"}]}]}"
  - region "Collaborative browser contract" [ref=f1e25]:
    - textbox "Collaborative editor left" [ref=f1e28]:
      - paragraph [ref=f1e29]: Shared collaboration
    - textbox "Collaborative editor right" [ref=f1e32]:
      - paragraph [ref=f1e33]: Shared collaboration
  - region "Tracked changes browser contract" [ref=f1e34]:
    - textbox "Tracked changes contract editor" [ref=f1e36]:
      - paragraph [ref=f1e37]: Alpha review
  - region "Page intent browser contract" [ref=f1e38]:
    - textbox "Page intent contract editor" [ref=f1e40]:
      - paragraph [ref=f1e41]: Browser pages
  - region "Editable pages browser contract"
```

# Test source

```ts
  7501 |     return {
  7502 |       text: selection?.toString(),
  7503 |       backward: Boolean(selection && selection.anchorOffset > selection.focusOffset),
  7504 |     };
  7505 |   })).toEqual({ text: 'agraph', backward: true });
  7506 | });
  7507 | 
  7508 | test('replaces a backward selection made by a real reverse pointer drag', async ({ page }) => {
  7509 |   const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  7510 |   const wrapper = editor.locator('[data-fountain-text-path="1.0"]');
  7511 |   const box = await wrapper.boundingBox();
  7512 |   expect(box).not.toBeNull();
  7513 |   if (!box) return;
  7514 |   const y = box.y + box.height / 2;
  7515 |   await page.mouse.move(box.x + box.width - 2, y);
  7516 |   await page.mouse.down();
  7517 |   await page.mouse.move(box.x + box.width * 0.3, y, { steps: 12 });
  7518 |   await page.mouse.up();
  7519 | 
  7520 |   const selected = await page.evaluate(() => {
  7521 |     const dom = document.getSelection();
  7522 |     const model = (globalThis as any).fountainBrowserTest.editor.state.selection;
  7523 |     return {
  7524 |       text: dom?.toString() ?? '',
  7525 |       backward: Boolean(dom && dom.anchorNode === dom.focusNode && dom.anchorOffset > dom.focusOffset),
  7526 |       path: model.path,
  7527 |       from: model.from,
  7528 |       to: model.to,
  7529 |     };
  7530 |   });
  7531 |   expect(selected.text.length).toBeGreaterThan(3);
  7532 |   expect(selected.backward).toBe(true);
  7533 |   expect(selected.path).toEqual([1, 0]);
  7534 |   expect(selected.to).toBeGreaterThan(selected.from);
  7535 | 
  7536 |   const original = 'Second paragraph';
  7537 |   const expected = `${original.slice(0, selected.from)}X${original.slice(selected.to)}`;
  7538 |   await page.keyboard.type('X');
  7539 |   await expect.poll(() => page.evaluate(() => (
  7540 |     (globalThis as any).fountainBrowserTest.editor.state.doc.child(1).textContent
  7541 |   ))).toBe(expected);
  7542 | });
  7543 | 
  7544 | test('turns multi-format and multi-block selections into visible paragraph boundaries', async ({ page }, info) => {
  7545 |   const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  7546 |   await page.evaluate(() => {
  7547 |     const contract = (globalThis as any).fountainBrowserTest;
  7548 |     contract.commands.commands.selectText([0, 0], 0, 5);
  7549 |     contract.commands.commands.toggleMark('strong');
  7550 |     contract.commands.commands.closeHistory();
  7551 |     contract.commands.commands.selectTextRange([0, 0], 2, [0, 1], 3);
  7552 |     contract.view.focus();
  7553 |   });
  7554 |   await page.keyboard.press('Enter');
  7555 |   await expect(editor.locator(':scope > p')).toHaveCount(4);
  7556 |   await expect(editor.locator(':scope > p').nth(0)).toHaveText('Al');
  7557 |   await expect(editor.locator(':scope > p').nth(1)).toHaveText('ta');
  7558 |   const firstGeometry = await editor.locator(':scope > p').nth(0).evaluate((element) => element.getBoundingClientRect());
  7559 |   const secondGeometry = await editor.locator(':scope > p').nth(1).evaluate((element) => element.getBoundingClientRect());
  7560 |   expect(secondGeometry.top).toBeGreaterThan(firstGeometry.top);
  7561 |   await page.keyboard.press('ControlOrMeta+z');
  7562 |   await expect(editor.locator(':scope > p')).toHaveCount(3);
  7563 |   await expect(editor.locator(':scope > p').first()).toHaveText('Alpha Beta');
  7564 |   await expect.poll(() => readDocumentDOMText(editor.locator(':scope > p').first().locator('strong'))).toBe('Alpha');
  7565 | 
  7566 |   await page.reload();
  7567 |   const freshEditor = page.getByRole('textbox', { name: 'Browser contract editor' });
  7568 |   await page.evaluate(() => {
  7569 |     const textPoint = (path: string, offset: number) => {
  7570 |       const wrapper = document.querySelector<HTMLElement>(`[data-fountain-text-path="${path}"]`);
  7571 |       const walker = wrapper && document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
  7572 |         acceptNode: (node) => node.parentElement?.closest('[data-fountain-widget]')
  7573 |           ? NodeFilter.FILTER_REJECT
  7574 |           : NodeFilter.FILTER_ACCEPT,
  7575 |       });
  7576 |       let remaining = offset;
  7577 |       for (let text = walker?.nextNode(); text; text = walker?.nextNode()) {
  7578 |         const length = text.textContent?.length ?? 0;
  7579 |         if (remaining <= length) return { wrapper, text, offset: remaining };
  7580 |         remaining -= length;
  7581 |       }
  7582 |       return { wrapper, text: null, offset: 0 };
  7583 |     };
  7584 |     const start = textPoint('0.0', 5);
  7585 |     const end = textPoint('1.0', 6);
  7586 |     if (!start.wrapper || !start.text || !end.text) throw new Error('Expected both paragraph text nodes.');
  7587 |     start.wrapper.closest<HTMLElement>('[contenteditable="true"]')?.focus();
  7588 |     const selection = document.getSelection();
  7589 |     selection?.setBaseAndExtent(end.text, end.offset, start.text, start.offset);
  7590 |     document.dispatchEvent(new Event('selectionchange'));
  7591 |   });
  7592 |   await expect.poll(() => page.evaluate(() => document.getSelection()?.anchorOffset)).toBe(6);
  7593 |   await page.keyboard.press('Enter');
  7594 |   await expect(freshEditor.locator(':scope > p')).toHaveCount(3);
  7595 |   await expect(freshEditor.locator(':scope > p').nth(0)).toHaveText('Alpha');
  7596 |   await info.attach('native-range-enter-state', { contentType: 'application/json', body: JSON.stringify(await freshEditor.evaluate(element => ({
  7597 |     html: element.innerHTML,
  7598 |     widgetCount: element.querySelectorAll('[data-fountain-widget="remote"]').length,
  7599 |     document: (globalThis as any).fountainBrowserTest.editor.getJSON(),
  7600 |   })), null, 2) });
> 7601 |   await expect(freshEditor.locator('[data-fountain-widget="remote"]')).toHaveCount(1);
       |                                                                        ^ Error: expect(locator).toHaveCount(expected) failed
  7602 |   await expect.poll(() => readDocumentDOMText(freshEditor.locator(':scope > p').nth(1))).toBe(' paragraph');
  7603 |   await page.keyboard.press('ControlOrMeta+z');
  7604 |   await expect(freshEditor.locator(':scope > p').nth(0)).toHaveText('Alpha Beta');
  7605 |   await expect(freshEditor.locator(':scope > p').nth(1)).toHaveText('Second paragraph');
  7606 | });
  7607 | 
  7608 | test('visibly splits and joins ordinary paragraphs with both deletion directions', async ({ page }) => {
  7609 |   const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  7610 |   const blocks = editor.locator(':scope > p[data-fountain-path]');
  7611 |   const expectJoinedContent = async (text: string) => {
  7612 |     // This fixture deliberately renders a non-document "Remote" cursor label.
  7613 |     // Verify both the visible content and the model without treating that
  7614 |     // retained widget as text inserted by the paragraph join.
  7615 |     await expect.poll(() => blocks.first().evaluate(element => {
  7616 |       const content = element.cloneNode(true) as HTMLElement;
  7617 |       content.querySelectorAll('[data-fountain-widget]').forEach(widget => widget.remove());
  7618 |       return content.textContent;
  7619 |     })).toBe(text);
  7620 |     const widget = blocks.first().locator('[data-fountain-widget="remote"]');
  7621 |     await expect(widget).toHaveCount(1);
  7622 |     await expect(widget).toHaveText('Remote');
  7623 |     await expect(widget).toHaveAttribute('contenteditable', 'false');
  7624 |     expect(await page.evaluate(() => {
  7625 |       const model = (globalThis as any).fountainBrowserTest.editor;
  7626 |       return { text: model.state.doc.child(0).textContent, includesWidget: JSON.stringify(model.getJSON()).includes('Remote') };
  7627 |     })).toEqual({ text, includesWidget: false });
  7628 |   };
  7629 |   await blocks.first().click();
  7630 |   await page.keyboard.press('End');
  7631 |   await page.keyboard.press('Enter');
  7632 |   await expect(blocks).toHaveCount(4);
  7633 |   await expect(blocks.nth(1).locator('[data-fountain-caret-placeholder]')).toHaveCount(1);
  7634 |   const emptyGeometry = await blocks.nth(1).evaluate((element) => element.getBoundingClientRect());
  7635 |   expect(emptyGeometry.height).toBeGreaterThan(0);
  7636 | 
  7637 |   await page.keyboard.type('Bridge');
  7638 |   await expect(blocks.nth(1)).toHaveText('Bridge');
  7639 |   await page.keyboard.press('Home');
  7640 |   await page.keyboard.press('Backspace');
  7641 |   await expect(blocks).toHaveCount(3);
  7642 |   await expectJoinedContent('Alpha BetaBridge');
  7643 | 
  7644 |   await blocks.first().click();
  7645 |   await page.keyboard.press('End');
  7646 |   await page.keyboard.press('Delete');
  7647 |   await expect(blocks).toHaveCount(2);
  7648 |   await expectJoinedContent('Alpha BetaBridgeSecond paragraph');
  7649 | });
  7650 | 
  7651 | test('deletes an adjacent inline atom without eating surrounding text', async ({ page }) => {
  7652 |   const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  7653 |   const setFixture = async (direction: 'backward' | 'forward') => page.evaluate((value) => {
  7654 |     const contract = (globalThis as any).fountainBrowserTest;
  7655 |     const { editor: instance } = contract;
  7656 |     const paragraph = instance.state.schema.node('paragraph', {}, [
  7657 |       instance.state.schema.text('Before'),
  7658 |       instance.state.schema.node('hard_break'),
  7659 |       instance.state.schema.text('After'),
  7660 |     ]);
  7661 |     const offset = value === 'backward' ? 0 : 6;
  7662 |     const path = value === 'backward' ? [0, 2] : [0, 0];
  7663 |     instance.dispatch(instance.state.createTransaction().replace(0, instance.state.doc.childCount, [paragraph]));
  7664 |     contract.commands.commands.selectText(path, offset);
  7665 |     contract.view.focus();
  7666 |   }, direction);
  7667 | 
  7668 |   await setFixture('backward');
  7669 |   const hardBreak = editor.locator('br[data-fountain-node="hard_break"]');
  7670 |   await expect(hardBreak).toHaveCount(1);
  7671 |   await page.keyboard.press('Backspace');
  7672 |   await expect(hardBreak).toHaveCount(0);
  7673 |   await expect(editor).toHaveText('BeforeAfter');
  7674 | 
  7675 |   await setFixture('forward');
  7676 |   await page.keyboard.press('Delete');
  7677 |   await expect(hardBreak).toHaveCount(0);
  7678 |   await expect(editor).toHaveText('BeforeAfter');
  7679 | });
  7680 | 
  7681 | test('unwraps and exits an inserted quote with ordinary browser keys', async ({ page }) => {
  7682 |   await page.goto('/');
  7683 |   const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  7684 |   const quotes = editor.locator(':scope > blockquote[data-fountain-path]');
  7685 |   const before = await quotes.count();
  7686 |   await page.getByRole('button', { name: '❝ Quote' }).click();
  7687 |   await expect(quotes).toHaveCount(before + 1);
  7688 |   const inserted = quotes.filter({ hasText: 'A thought worth keeping…' });
  7689 |   await expect(inserted).toHaveCount(1);
  7690 |   await inserted.locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
  7691 |     const text = wrapper.firstChild;
  7692 |     if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected quote text.');
  7693 |     document.getSelection()?.setBaseAndExtent(text, 0, text, 0);
  7694 |     document.dispatchEvent(new Event('selectionchange'));
  7695 |   });
  7696 |   await page.keyboard.press('Backspace');
  7697 |   await expect(quotes).toHaveCount(before);
  7698 |   await expect(editor.locator(':scope > p[data-fountain-path]').filter({ hasText: 'A thought worth keeping…' })).toHaveCount(1);
  7699 | 
  7700 |   await page.getByRole('button', { name: '❝ Quote' }).click();
  7701 |   const second = quotes.filter({ hasText: 'A thought worth keeping…' });
```