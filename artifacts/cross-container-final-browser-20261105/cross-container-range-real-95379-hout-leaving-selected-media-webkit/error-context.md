# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cross-container-range-real.spec.ts >> replaces native selections across quote and list ancestors without leaving selected media
- Location: tests\manual\cross-container-range-real.spec.ts:4:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('textbox', { name: 'Issue description editor', exact: true }).locator('[data-fountain-text-path]').filter({ hasText: /^Left$/ })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('textbox', { name: 'Issue description editor', exact: true }).locator('[data-fountain-text-path]').filter({ hasText: /^Left$/ })

```

```yaml
- main:
  - link "F FountainJS":
    - /url: ./
  - navigation "Primary navigation":
    - link "Home":
      - /url: ./
    - link "10 demos":
      - /url: ./demos.html
    - link "Workflows":
      - /url: ./workflows.html
    - link "Developers":
      - /url: ./developers.html
  - link "How this is built ↓":
    - /url: "#integration"
  - navigation "Breadcrumb":
    - list:
      - listitem:
        - link "Home":
          - /url: ./
      - listitem:
        - link "Workflow lab":
          - /url: ./workflows.html
      - listitem: GitLab-style issue editor (unofficial)
    - link "Back to workflow lab":
      - /url: ./workflows.html
  - heading "A bug report, from draft to review." [level=1]
  - paragraph: Write visually, inspect the Markdown, and preview what a reader sees. This is a FountainJS implementation of an issue-writing workflow, not a GitLab integration or a full GitLab Flavored Markdown implementation.
  - text: Issue title
  - textbox "Issue title": Room switch leaves stale content
  - region "Issue description":
    - navigation "Description mode":
      - button "Visual editor" [pressed]
      - button "Markdown source"
      - button "Reader preview"
    - toolbar "Formatting and rich content":
      - group "History and search":
        - button "Undo"
        - button "Redo" [disabled]
        - button "Find and replace"
      - group "Block types":
        - button "Paragraph"
        - button "H1 — Heading 1"
        - button "H2 — Heading 2"
        - button "H3 — Heading 3"
      - group "Text formatting":
        - button "Bold"
        - button "Italic"
        - button "Strikethrough"
        - button "Inline code"
        - button "Add or edit link"
        - button "Remove link" [disabled]
      - group "Insert rich content":
        - button "Insert definition list"
        - button "Quote selected blocks"
        - button "Bullet list"
        - button "123 — Numbered list"
        - button "Task list"
        - button "Lift list item" [disabled]
        - button "Indent list item" [disabled]
        - button "Code block and language"
        - button "Insert table"
        - button "Insert image from URL"
        - button "Upload image"
        - button "Divider"
        - button "Line break"
    - textbox "Issue description editor":
      - paragraph: Before.
      - paragraph: <blockquote dir="ltr"><p>Left</p><img src="https://example.test/selected.svg" alt="Selected figure"></blockquote>
      - paragraph: <blockquote dir="rtl"><img src="https://example.test/selected.svg" alt="Selected figure"><p>Right</p><p>Tail</p></blockquote>
      - paragraph: After.
  - text: Table export
  - combobox "Table export":
    - option "Markdown pipes · widest compatibility" [selected]
    - option "HTML tables · preserve cell structure"
  - paragraph: HTML tables retain supported cell roles, spans and rich content when reopened here. Other readers must support HTML tables. This choice affects regenerated tables; untouched source stays unchanged. In source mode, download saves your raw text as written.
  - button "Download Markdown draft"
  - button "Open Markdown draft"
  - status: Opened different-quote-direction.md locally. The title belongs to the host form and is not part of Markdown.
  - complementary "Fountain diagnostics":
    - heading "Fountain diagnostics" [level=2]
    - button "Check Markdown export"
    - paragraph: Check the current draft before sharing. Opening source or downloading also checks it; editing stays separate.
    - term: Engine
    - definition: FountainJS · React surface
    - term: Document blocks
    - definition: 4 top-level blocks
    - term: Source preservation
    - definition: Not checked for this draft
    - term: Export warnings
    - definition: Not checked for this draft
    - term: Images
    - definition: Local raster uploads · imported image URLs may load remotely
    - term: Collaboration / pagination
    - definition: Not enabled in this workflow
    - term: Viewport rendering
    - definition: Enabled above 250 top-level blocks
    - term: Server runtimes
    - definition: Not measured by this page
    - group: What does preservation mean?
    - heading "Try the source-fidelity check" [level=3]
    - list:
      - listitem: Open Markdown source and find the tilde code fence and double underscores.
      - listitem: Return to Visual editor. Edit only the first paragraph.
      - listitem: Switch back. Check that the untouched source is still there.
      - listitem: Download, reopen, and preview your draft.
  - heading "Build this into your product" [level=2]
  - paragraph:
    - text: The host owns the title, file controls and submission. Fountain owns the description model, history, selection and formatting. Switching modes uses
    - code: parseWithSource
    - text: ","
    - code: exportWithSource
    - text: and a document-replacement transaction. The preview creates a separate read-only editor; read-only UI is not access control.
  - paragraph: Images here use a bounded local file adapter. A real issue tracker supplies its own authenticated upload service, permissions and API submission. Drafts are not automatically persisted. External links and images in imported content may make network requests; this is not an offline sandbox.
  - paragraph:
    - link "Developer guide ↗":
      - /url: ./developers.html
    - text: ·
    - link "Workflow API walkthrough ↗":
      - /url: https://github.com/eddolo/fountainjs/blob/master/docs/ISSUE_EDITOR_DEMO.md
    - text: ·
    - link "Demo source ↗":
      - /url: https://github.com/eddolo/fountainjs/blob/master/examples/react-app/src/IssueEditor.tsx
```

# Test source

```ts
  1   | import { expect, type Page, type TestInfo } from '@playwright/test';
  2   | import { mkdir, readFile, writeFile } from 'node:fs/promises';
  3   | import { resolve } from 'node:path';
  4   | import { MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
  5   | import { issueMarkdownOptions } from '../../examples/react-app/src/issue-markdown-policy';
  6   | 
  7   | export async function runCrossContainerRangeJourney(page: Page, info: TestInfo): Promise<void> {
  8   |   const root = info.outputPath('cross-container-range-journey');
  9   |   await mkdir(root, { recursive: true });
  10  |   const figure = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="80"><rect width="480" height="80" fill="#dceeff"/><text x="20" y="48" font-size="24">Selected figure</text></svg>';
  11  |   await page.route('https://example.test/selected.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: figure }));
  12  |   const errors: string[] = [];
  13  |   page.on('pageerror', error => errors.push(error.message));
  14  |   await page.goto('/issue-editor.html');
  15  |   const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  16  |   const upload = page.getByLabel('Open Markdown draft file', { exact: true });
  17  |   const schema = new Schema(StarterKit.schema), observations = [];
  18  |   const image = '![Selected figure](https://example.test/selected.svg)';
  19  |   const cases = [
  20  |     { name: 'quote-to-paragraph', source: `Before.\n\n> Left\n>\n> ${image}\n\n${image}\n\nRight\n\nAfter.\n`,
  21  |       expected: 'Before.\n\n> LeXht\n\nAfter.\n' },
  22  |     { name: 'paragraph-to-quote', source: `Before.\n\nLeft\n\n${image}\n\n> ${image}\n>\n> Right\n>\n> Tail\n\nAfter.\n`,
  23  |       expected: 'Before.\n\nLeXht\n\n> Tail\n\nAfter.\n' },
  24  |     { name: 'list-items', source: `Before.\n\n- Left\n\n  ${image}\n\n- ${image}\n\n  Right\n\n  Tail\n\n- Last\n\nAfter.\n`,
  25  |       expected: 'Before.\n\n- LeXht\n\n  Tail\n\n- Last\n\nAfter.\n' },
  26  |     { name: 'different-quote-direction', source: 'Before.\n\n<blockquote dir="ltr"><p>Left</p><img src="https://example.test/selected.svg" alt="Selected figure"></blockquote>\n\n'
  27  |       + '<blockquote dir="rtl"><img src="https://example.test/selected.svg" alt="Selected figure"><p>Right</p><p>Tail</p></blockquote>\n\nAfter.\n',
  28  |       expected: 'Before.\n\n<blockquote dir="ltr"><p>LeXht</p></blockquote>\n\n<blockquote dir="rtl"><p>Tail</p></blockquote>\n\nAfter.\n' },
  29  |   ];
  30  |   for (const item of cases.flatMap(item => [{ ...item, backward: false }, { ...item, name: `${item.name}-backward`, backward: true }])) {
  31  |     await writeFile(resolve(root, `${item.name}-original.md`), item.source);
  32  |     const expected = MarkdownImporter.parse(item.expected, schema, issueMarkdownOptions);
  33  |     await upload.setInputFiles({ name: `${item.name}.md`, mimeType: 'text/markdown', buffer: Buffer.from(item.source) });
  34  |     const left = editor.locator('[data-fountain-text-path]').filter({ hasText: /^Left$/ });
  35  |     const right = editor.locator('[data-fountain-text-path]').filter({ hasText: /^Right$/ });
> 36  |     await expect(left).toBeVisible();
      |                        ^ Error: expect(locator).toBeVisible() failed
  37  |     await expect(right).toBeVisible();
  38  |     await expect(editor.locator('img')).toHaveCount(2);
  39  |     const point = async (element: typeof left, offset: number) => {
  40  |       await element.scrollIntoViewIfNeeded();
  41  |       return element.evaluate((wrapper, position) => {
  42  |         const range = document.createRange();
  43  |         range.setStart(wrapper.firstChild!, position); range.collapse(true);
  44  |         const rect = range.getBoundingClientRect();
  45  |         return { x: rect.x + .1, y: rect.y + rect.height / 2 };
  46  |       }, offset);
  47  |     };
  48  |     const a = await point(item.backward ? right : left, item.backward ? 3 : 2);
  49  |     await page.mouse.click(a.x, a.y);
  50  |     const b = await point(item.backward ? left : right, item.backward ? 2 : 3);
  51  |     await page.keyboard.down('Shift');
  52  |     try { await page.mouse.click(b.x, b.y); } finally { await page.keyboard.up('Shift'); }
  53  |     const endpoints = { anchor: await (item.backward ? right : left).getAttribute('data-fountain-text-path'), anchorOffset: item.backward ? 3 : 2,
  54  |       focus: await (item.backward ? left : right).getAttribute('data-fountain-text-path'), focusOffset: item.backward ? 2 : 3 };
  55  |     await expect.poll(() => page.evaluate(() => {
  56  |       const selection = getSelection();
  57  |       const path = (node: Node | null | undefined) => (node instanceof Element ? node : node?.parentElement)
  58  |         ?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null;
  59  |       return { anchor: path(selection?.anchorNode), anchorOffset: selection?.anchorOffset,
  60  |         focus: path(selection?.focusNode), focusOffset: selection?.focusOffset };
  61  |     })).toEqual(endpoints);
  62  |     await editor.screenshot({ path: resolve(root, `${item.name}-selection.png`) });
  63  |     await page.keyboard.type('X');
  64  |     await expect(editor.locator('img')).toHaveCount(0);
  65  |     await expect(editor.locator('p').filter({ hasText: /^LeXht$/ })).toHaveCount(1);
  66  |     await expect(editor.locator(':scope > p').first()).toHaveText('Before.');
  67  |     await expect(editor.locator(':scope > p').last()).toHaveText('After.');
  68  |     if (item.name.startsWith('different-quote-direction')) {
  69  |       await expect(editor.locator('blockquote').first()).toHaveAttribute('dir', 'ltr');
  70  |       await expect(editor.locator('blockquote').last()).toHaveAttribute('dir', 'rtl');
  71  |       await expect(editor.locator('blockquote').last()).toHaveText('Tail');
  72  |     }
  73  |     await expect.poll(() => page.evaluate(() => {
  74  |       const selection = getSelection();
  75  |       return { collapsed: selection?.isCollapsed, text: selection?.anchorNode?.textContent, offset: selection?.anchorOffset };
  76  |     })).toEqual({ collapsed: true, text: 'LeX', offset: 3 });
  77  |     await editor.screenshot({ path: resolve(root, `${item.name}-replaced.png`) });
  78  |     const download = async (suffix: string) => {
  79  |       const event = page.waitForEvent('download');
  80  |       await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  81  |       const target = resolve(root, `${item.name}-${suffix}.md`);
  82  |       await (await event).saveAs(target);
  83  |       return { target, source: await readFile(target, 'utf8') };
  84  |     };
  85  |     const changed = await download('edited');
  86  |     expect(MarkdownImporter.parse(changed.source, schema, issueMarkdownOptions).toJSON()).toEqual(expected.toJSON());
  87  |     await page.getByRole('button', { name: 'Undo', exact: true }).click();
  88  |     await expect(editor.locator('img')).toHaveCount(2);
  89  |     expect((await download('undone')).source).toBe(item.source);
  90  |     await page.getByRole('button', { name: 'Redo', exact: true }).click();
  91  |     expect((await download('redone')).source).toBe(changed.source);
  92  |     await upload.setInputFiles(changed.target);
  93  |     await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  94  |     const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  95  |     await expect(reader.locator('img')).toHaveCount(0);
  96  |     await expect(reader.locator('p').filter({ hasText: /^LeXht$/ })).toHaveCount(1);
  97  |     await expect(reader.locator(':scope > p').last()).toHaveText('After.');
  98  |     await reader.screenshot({ path: resolve(root, `${item.name}-reader.png`) });
  99  |     observations.push({ name: item.name, nativeShiftClick: endpoints, nativeCaretAfterTyping: { text: 'LeX', offset: 3 },
  100 |       selectedImagesRemoved: 2, completeReopenedExpectedModel: true, exactOriginalSourceOnUndo: true, exactEditedSourceOnRedo: true });
  101 |     await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  102 |   }
  103 |   expect(errors).toEqual([]);
  104 |   await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, observations, errors }, null, 2));
  105 | }
  106 | 
```