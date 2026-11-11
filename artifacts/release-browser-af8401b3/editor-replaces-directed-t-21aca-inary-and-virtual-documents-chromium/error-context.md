# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editor.spec.ts >> replaces directed text-to-image document boundary ranges in ordinary and virtual documents
- Location: tests\manual\document-boundary-range-real.spec.ts:5:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.waitForEvent: Test timeout of 120000ms exceeded.
=========================== logs ===========================
waiting for event "download"
============================================================
```

# Page snapshot

```yaml
- main [ref=f1e3]:
  - generic [ref=f1e4]:
    - link "F FountainJS" [ref=f1e5] [cursor=pointer]:
      - /url: ./
      - generic [ref=f1e6]: F
      - text: FountainJS
    - navigation "Primary navigation" [ref=f1e7]:
      - link "Home" [ref=f1e8] [cursor=pointer]:
        - /url: ./
        - generic [ref=f1e10]: ↗
      - link "10 demos" [ref=f1e11] [cursor=pointer]:
        - /url: ./demos.html
        - generic [ref=f1e13]: ↗
      - link "Workflows" [ref=f1e14] [cursor=pointer]:
        - /url: ./workflows.html
        - generic [ref=f1e16]: ↗
      - link "Developers" [ref=f1e17] [cursor=pointer]:
        - /url: ./developers.html
        - generic [ref=f1e19]: ↗
    - link "How this is built ↓" [ref=f1e20] [cursor=pointer]:
      - /url: "#integration"
  - generic [ref=f1e21]:
    - generic [ref=f1e22]:
      - navigation "Breadcrumb" [ref=f1e23]:
        - list [ref=f1e24]:
          - listitem [ref=f1e25]:
            - link "Home" [ref=f1e26] [cursor=pointer]:
              - /url: ./
          - listitem [ref=f1e27]:
            - generic [ref=f1e28]: /
            - link "Workflow lab" [ref=f1e29] [cursor=pointer]:
              - /url: ./workflows.html
          - listitem [ref=f1e30]:
            - generic [ref=f1e31]: /
            - generic [ref=f1e32]: GitLab-style issue editor (unofficial)
        - link "Back to workflow lab" [ref=f1e33] [cursor=pointer]:
          - /url: ./workflows.html
          - generic [ref=f1e34]: ←
          - text: Back to workflow lab
      - heading "A bug report, from draft to review." [level=1] [ref=f1e35]
      - paragraph [ref=f1e36]: Write visually, inspect the Markdown, and preview what a reader sees. This is a FountainJS implementation of an issue-writing workflow, not a GitLab integration or a full GitLab Flavored Markdown implementation.
      - generic [ref=f1e37]:
        - text: Issue title
        - textbox "Issue title" [ref=f1e38]: Room switch leaves stale content
      - region "Issue description" [ref=f1e39]:
        - navigation "Description mode" [ref=f1e40]:
          - button "Visual editor" [pressed] [ref=f1e41] [cursor=pointer]
          - button "Markdown source" [ref=f1e42] [cursor=pointer]
          - button "Reader preview" [ref=f1e43] [cursor=pointer]
        - generic [ref=f1e45]:
          - toolbar "Formatting and rich content" [ref=f1e47]:
            - group "History and search" [ref=f1e48]:
              - button "Undo" [ref=f1e49] [cursor=pointer]
              - button "Redo" [ref=f1e50] [cursor=pointer]
              - button "Find and replace" [ref=f1e51] [cursor=pointer]
            - group "Block types" [ref=f1e52]:
              - button "Paragraph" [ref=f1e53] [cursor=pointer]
              - button "H1 — Heading 1" [ref=f1e54] [cursor=pointer]:
                - img:
                  - generic: H1
              - button "H2 — Heading 2" [ref=f1e55] [cursor=pointer]:
                - img:
                  - generic: H2
              - button "H3 — Heading 3" [ref=f1e56] [cursor=pointer]:
                - img:
                  - generic: H3
            - group "Text formatting" [ref=f1e57]:
              - button "Bold" [ref=f1e58] [cursor=pointer]
              - button "Italic" [ref=f1e59] [cursor=pointer]
              - button "Strikethrough" [ref=f1e60] [cursor=pointer]
              - button "Inline code" [ref=f1e61] [cursor=pointer]
              - button "Add or edit link" [ref=f1e62] [cursor=pointer]
              - button "Remove link" [disabled] [ref=f1e63]
            - group "Insert rich content" [ref=f1e64]:
              - button "Insert definition list" [ref=f1e65] [cursor=pointer]
              - button "Quote selected blocks" [ref=f1e66] [cursor=pointer]
              - button "Bullet list" [ref=f1e67] [cursor=pointer]
              - button "123 — Numbered list" [ref=f1e68] [cursor=pointer]:
                - img:
                  - generic: "1"
                  - generic: "2"
                  - generic: "3"
              - button "Task list" [ref=f1e69] [cursor=pointer]
              - button "Lift list item" [disabled] [ref=f1e70]
              - button "Indent list item" [disabled] [ref=f1e71]
              - button "Code block and language" [ref=f1e72] [cursor=pointer]
              - button "Insert table" [ref=f1e73] [cursor=pointer]
              - button "Insert image from URL" [ref=f1e74] [cursor=pointer]
              - button "Upload image" [ref=f1e75] [cursor=pointer]
              - button "Divider" [ref=f1e76] [cursor=pointer]
              - button "Line break" [ref=f1e77] [cursor=pointer]
          - textbox "Issue description editor" [ref=f1e79]:
            - 'figure "[Image: Boundary figure]" [ref=f1e80]':
              - generic [ref=f1e81]:
                - img "Boundary figure" [ref=f1e82]
                - generic:
                  - slider "Resize image from left" [ref=f1e83]
                  - slider "Resize image from right" [ref=f1e84]
              - textbox "Image caption" [ref=f1e87]:
                - /placeholder: Add a caption
            - paragraph [ref=f1e88]: Paragraph 1.
            - paragraph [ref=f1e89]: Paragraph 272.
            - paragraph [ref=f1e90]: Paragraph 273.
            - paragraph [ref=f1e91]: Paragraph 274.
            - paragraph [ref=f1e92]: Paragraph 275.
            - paragraph [ref=f1e93]: Paragraph 276.
            - paragraph [ref=f1e94]: Paragraph 277.
            - paragraph [ref=f1e95]: Paragraph 278.
            - paragraph [ref=f1e96]: Paragraph 279.
            - paragraph [ref=f1e97]: Paragraph 280.
            - paragraph [ref=f1e98]: Paragraph 281.
            - paragraph [ref=f1e99]: Paragraph 282.
            - paragraph [ref=f1e100]: Paragraph 283.
            - paragraph [ref=f1e101]: Paragraph 284.
            - paragraph [ref=f1e102]: Paragraph 285.
            - paragraph [ref=f1e103]: Paragraph 286.
            - paragraph [ref=f1e104]: Paragraph 287.
            - paragraph [ref=f1e105]: Paragraph 288.
            - paragraph [ref=f1e106]: Paragraph 289.
            - paragraph [ref=f1e107]: Paragraph 290.
            - paragraph [ref=f1e108]: Paragraph 291.
            - paragraph [ref=f1e109]: Paragraph 292.
            - paragraph [ref=f1e110]: Paragraph 293.
            - paragraph [ref=f1e111]: Paragraph 294.
            - paragraph [ref=f1e112]: Paragraph 295.
            - paragraph [ref=f1e113]: Paragraph 296.
            - paragraph [ref=f1e114]: Paragraph 297.
            - paragraph [ref=f1e115]: Paragraph 298.
            - paragraph [ref=f1e116]: Paragraph 299.
            - paragraph [ref=f1e117]: Paragraph 300.
            - paragraph [ref=f1e118]: Right
      - generic [ref=f1e119]:
        - generic [ref=f1e120]: Table export
        - combobox "Table export" [ref=f1e121]:
          - option "Markdown pipes · widest compatibility" [selected]
          - option "HTML tables · preserve cell structure"
      - paragraph [ref=f1e122]: HTML tables retain supported cell roles, spans and rich content when reopened here. Other readers must support HTML tables. This choice affects regenerated tables; untouched source stays unchanged. In source mode, download saves your raw text as written.
      - generic [ref=f1e123]:
        - button "Download Markdown draft" [active] [ref=f1e124] [cursor=pointer]
        - button "Open Markdown draft" [ref=f1e125] [cursor=pointer]
      - status [ref=f1e126]: Downloaded description Markdown. Keep the host title separately; this does not create an online issue.
    - complementary "Fountain diagnostics" [ref=f1e127]:
      - heading "Fountain diagnostics" [level=2] [ref=f1e128]
      - button "Check Markdown export" [ref=f1e129] [cursor=pointer]
      - paragraph [ref=f1e130]: Check the current draft before sharing. Opening source or downloading also checks it; editing stays separate.
      - generic [ref=f1e131]:
        - term [ref=f1e132]: Engine
        - definition [ref=f1e133]: FountainJS · React surface
        - term [ref=f1e134]: Document blocks
        - definition [ref=f1e135]: 302 top-level blocks
        - term [ref=f1e136]: Source preservation
        - definition [ref=f1e137]: Not checked for this draft
        - term [ref=f1e138]: Export warnings
        - definition [ref=f1e139]: Not checked for this draft
        - term [ref=f1e140]: Images
        - definition [ref=f1e141]: Local raster uploads · imported image URLs may load remotely
        - term [ref=f1e142]: Collaboration / pagination
        - definition [ref=f1e143]: Not enabled in this workflow
        - term [ref=f1e144]: Viewport rendering
        - definition [ref=f1e145]: Enabled above 250 top-level blocks
        - term [ref=f1e146]: Server runtimes
        - definition [ref=f1e147]: Not measured by this page
      - group [ref=f1e148]:
        - generic "What does preservation mean?" [ref=f1e149] [cursor=pointer]
      - generic [ref=f1e150]:
        - heading "Try the source-fidelity check" [level=3] [ref=f1e151]
        - list [ref=f1e152]:
          - listitem [ref=f1e153]: Open Markdown source and find the tilde code fence and double underscores.
          - listitem [ref=f1e154]: Return to Visual editor. Edit only the first paragraph.
          - listitem [ref=f1e155]: Switch back. Check that the untouched source is still there.
          - listitem [ref=f1e156]: Download, reopen, and preview your draft.
  - generic [ref=f1e157]:
    - heading "Build this into your product" [level=2] [ref=f1e158]
    - paragraph [ref=f1e159]:
      - text: The host owns the title, file controls and submission. Fountain owns the description model, history, selection and formatting. Switching modes uses
      - code [ref=f1e160]: parseWithSource
      - text: ","
      - code [ref=f1e161]: exportWithSource
      - text: and a document-replacement transaction. The preview creates a separate read-only editor; read-only UI is not access control.
    - paragraph [ref=f1e162]: Images here use a bounded local file adapter. A real issue tracker supplies its own authenticated upload service, permissions and API submission. Drafts are not automatically persisted. External links and images in imported content may make network requests; this is not an offline sandbox.
    - paragraph [ref=f1e163]:
      - link "Developer guide ↗" [ref=f1e164] [cursor=pointer]:
        - /url: ./developers.html
      - text: ·
      - link "Workflow API walkthrough ↗" [ref=f1e165] [cursor=pointer]:
        - /url: https://github.com/eddolo/fountainjs/blob/master/docs/ISSUE_EDITOR_DEMO.md
      - text: ·
      - link "Demo source ↗" [ref=f1e166] [cursor=pointer]:
        - /url: https://github.com/eddolo/fountainjs/blob/master/examples/react-app/src/IssueEditor.tsx
```

# Test source

```ts
  30  |   const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  31  |   const upload = page.getByLabel('Open Markdown draft file', { exact: true });
  32  |   const schema = new Schema(StarterKit.schema);
  33  |   const image = '![Boundary figure](https://example.test/boundary.png)';
  34  |   for (const virtual of [false, true]) for (const leading of [false, true]) for (const backward of [false, true]) {
  35  |     const name = `${virtual ? 'virtual' : 'ordinary'}-${leading ? 'leading' : 'terminal'}-${backward ? 'backward' : 'forward'}`;
  36  |     const filler = virtual ? Array.from({ length: 300 }, (_, index) => `Paragraph ${index + 1}.`).join('\n\n') : '';
  37  |     const source = (leading ? [image, filler, 'Right'] : ['Left', filler, image]).filter(Boolean).join('\n\n') + '\n';
  38  |     const expected = MarkdownImporter.parse(leading ? 'Xht\n' : 'LeX\n', schema, issueMarkdownOptions);
  39  |     await writeFile(resolve(root, `${name}-original.md`), source);
  40  |     await upload.setInputFiles({ name: `${name}.md`, mimeType: 'text/markdown', buffer: Buffer.from(source) });
  41  |     const text = editor.locator('[data-fountain-text-path]').filter({ hasText: leading ? /^Right$/ : /^Left$/ });
  42  |     // Visit the edge containing the figure before selecting, so a broken image
  43  |     // or an unloaded virtualized NodeView cannot pass as successful media.
  44  |     await text.scrollIntoViewIfNeeded();
  45  |     await text.click();
  46  |     await page.keyboard.press(leading ? 'Control+Home' : 'Control+End');
  47  |     await expect(editor.locator('img')).toHaveCount(1);
  48  |     await expect.poll(() => editor.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement
  49  |       && image.complete && image.naturalWidth === 400))).toBe(true);
  50  |     const checkpoints: unknown[] = [];
  51  |     const checkpoint = async (phase: string) => {
  52  |       checkpoints.push(await editor.evaluate((element, phase) => {
  53  |         const selection = getSelection();
  54  |         return { phase, anchor: selection?.anchorNode?.nodeName, anchorText: selection?.anchorNode?.textContent?.slice(0, 30),
  55  |           anchorOffset: selection?.anchorOffset, head: selection?.focusNode?.nodeName, headOffset: selection?.focusOffset,
  56  |           gaps: Array.from(element.querySelectorAll('[data-fountain-gap]')).map(node => ({ path: node.getAttribute('data-fountain-path'), gap: node.getAttribute('data-fountain-gap') })) };
  57  |       }, phase));
  58  |     };
  59  |     await checkpoint('edge');
  60  |     const point = async () => {
  61  |       await text.scrollIntoViewIfNeeded();
  62  |       return text.evaluate((wrapper, offset) => {
  63  |         const range = document.createRange(); range.setStart(wrapper.firstChild!, offset); range.collapse(true);
  64  |         const rect = range.getBoundingClientRect();
  65  |         return { x: rect.x + .1, y: rect.y + rect.height / 2 };
  66  |       }, leading ? 3 : 2);
  67  |     };
  68  |     if (leading ? backward : !backward) {
  69  |       if (virtual) await page.keyboard.press(leading ? 'Control+End' : 'Control+Home');
  70  |       // Native click waits for the virtual block's measured position to settle.
  71  |       // A precomputed viewport coordinate can otherwise hit below the viewport
  72  |       // while WebKit corrects estimated block heights after scrolling.
  73  |       await text.click();
  74  |       await page.keyboard.press('Home');
  75  |       for (let index = 0; index < (leading ? 3 : 2); index++) await page.keyboard.press('ArrowRight');
  76  |       await writeFile(resolve(root, `${name}-navigation.json`), JSON.stringify(await page.evaluate(() =>
  77  |         (globalThis as unknown as { boundaryNavigationRecords: unknown[] }).boundaryNavigationRecords), null, 2));
  78  |       await expect.poll(() => page.evaluate(() => ({ text: getSelection()?.focusNode?.textContent,
  79  |         offset: getSelection()?.focusOffset }))).toEqual({ text: leading ? 'Right' : 'Left', offset: leading ? 3 : 2 });
  80  |       await page.keyboard.press(leading ? 'Control+Shift+Home' : 'Control+Shift+End');
  81  |     } else if (virtual) {
  82  |       // The target text is unmounted at the other edge. Extend there using
  83  |       // native document navigation, then move the head to the partial offset.
  84  |       await page.keyboard.press(leading ? 'Control+Shift+End' : 'Control+Shift+Home');
  85  |       await checkpoint('document-extended');
  86  |       for (let index = 0; index < 2; index++) {
  87  |         await page.keyboard.press(leading ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
  88  |         await checkpoint(`character-extended-${index + 1}`);
  89  |       }
  90  |     } else {
  91  |       // Returning from the opposite edge must retain the structural anchor.
  92  |       const at = await point();
  93  |       await checkpoint('before-shift');
  94  |       await page.keyboard.down('Shift');
  95  |       await checkpoint('shift-down');
  96  |       try { await page.mouse.click(at.x, at.y); } finally { await page.keyboard.up('Shift'); }
  97  |     }
  98  |     const native = await page.evaluate(() => {
  99  |       const selection = getSelection();
  100 |       const endpoint = (node: Node | null | undefined, offset: number | undefined) => ({
  101 |         textPath: (node instanceof Element ? node : node?.parentElement)?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null,
  102 |         element: node instanceof Element ? node.tagName : node?.nodeName, offset,
  103 |       });
  104 |       return { anchor: endpoint(selection?.anchorNode, selection?.anchorOffset),
  105 |         head: endpoint(selection?.focusNode, selection?.focusOffset), collapsed: selection?.isCollapsed };
  106 |     });
  107 |     await writeFile(resolve(root, `${name}-native.json`), JSON.stringify(native, null, 2));
  108 |     await writeFile(resolve(root, `${name}-checkpoints.json`), JSON.stringify(checkpoints, null, 2));
  109 |     expect(native.collapsed).toBe(false);
  110 |     const textEndpoint = backward ? native.head : native.anchor;
  111 |     const boundaryEndpoint = backward ? native.anchor : native.head;
  112 |     // In a leading-image forward selection the text is the head, not anchor.
  113 |     const actualText = leading ? boundaryEndpoint : textEndpoint;
  114 |     const actualBoundary = leading ? textEndpoint : boundaryEndpoint;
  115 |     expect(actualText.textPath).toBe(await text.getAttribute('data-fountain-text-path'));
  116 |     expect(actualText.offset).toBe(leading ? 3 : 2);
  117 |     expect(actualBoundary.textPath).toBeNull();
  118 |     await page.screenshot({ path: resolve(root, `${name}-selected.png`) });
  119 |     await page.keyboard.type('X');
  120 |     await expect(editor.locator('img')).toHaveCount(0);
  121 |     await expect(editor.locator(':scope > p')).toHaveCount(1);
  122 |     await expect(editor.locator(':scope > p')).toHaveText(leading ? 'Xht' : 'LeX');
  123 |     await expect.poll(() => editor.locator('[data-fountain-text-path]').first().evaluate(element => {
  124 |       const rect = element.getBoundingClientRect();
  125 |       const header = document.querySelector('.site-header')?.getBoundingClientRect();
  126 |       return rect.top >= Math.max(0, header?.bottom ?? 0) && rect.bottom <= innerHeight;
  127 |     }), { message: 'After replacing a long virtual range the edited text and caret must remain visible.' }).toBe(true);
  128 |     await page.screenshot({ path: resolve(root, `${name}-edited.png`) });
  129 |     const download = async (suffix: string) => {
> 130 |       const event = page.waitForEvent('download');
      |                          ^ Error: page.waitForEvent: Test timeout of 120000ms exceeded.
  131 |       await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  132 |       const target = resolve(root, `${name}-${suffix}.md`);
  133 |       await (await event).saveAs(target);
  134 |       return { target, source: await readFile(target, 'utf8') };
  135 |     };
  136 |     const edited = await download('edited');
  137 |     expect(MarkdownImporter.parse(edited.source, schema, issueMarkdownOptions).toJSON()).toEqual(expected.toJSON());
  138 |     await page.getByRole('button', { name: 'Undo', exact: true }).click();
  139 |     expect((await download('undone')).source).toBe(source);
  140 |     await page.getByRole('button', { name: 'Redo', exact: true }).click();
  141 |     expect((await download('redone')).source).toBe(edited.source);
  142 |     await upload.setInputFiles(edited.target);
  143 |     await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  144 |     const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  145 |     await expect(reader.locator('img')).toHaveCount(0);
  146 |     await expect(reader.locator(':scope > p')).toHaveText(leading ? 'Xht' : 'LeX');
  147 |     await reader.screenshot({ path: resolve(root, `${name}-reader.png`) });
  148 |     observations.push({ name, native, originalBlocks: virtual ? 302 : 2, replacedBlocks: 1,
  149 |       loadedImageWidth: 400, completeExportedModel: true, originalSourceUndo: true, editedSourceRedo: true, reopenedReader: true });
  150 |     await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  151 |   }
  152 |   expect(errors).toEqual([]);
  153 |   await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, observations, errors }, null, 2));
  154 | }
  155 | 
```