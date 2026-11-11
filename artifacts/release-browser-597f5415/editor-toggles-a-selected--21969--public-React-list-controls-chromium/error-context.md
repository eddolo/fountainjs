# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editor.spec.ts >> toggles a selected block through the public React list controls
- Location: tests\browser\editor.spec.ts:6196:1

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Bullet list' }) resolved to 2 elements:
    1) <button type="button" title="Bullet list" aria-pressed="false" aria-label="Bullet list" class="fountain-toolbar__button" data-fountain-toolbar-action="bullet-list">…</button> aka getByRole('button', { name: 'Bullet list', description: 'Bullet list' })
    2) <button>Toggle bullet list</button> aka getByRole('button', { name: 'Toggle bullet list' })

Call log:
  - waiting for getByRole('button', { name: 'Bullet list' })

```

# Page snapshot

```yaml
- main [ref=f1e3]:
  - generic [ref=f1e4]:
    - link "F FountainJS home" [ref=f1e5] [cursor=pointer]:
      - /url: "#top"
      - generic [ref=f1e6]: F
      - text: FountainJS
    - navigation "Primary navigation" [ref=f1e7]:
      - link "Home" [ref=f1e8] [cursor=pointer]:
        - /url: "#top"
      - link "What it is" [ref=f1e11] [cursor=pointer]:
        - /url: "#what"
      - link "Open source" [ref=f1e12] [cursor=pointer]:
        - /url: "#open-source"
      - link "Live demo" [ref=f1e13] [cursor=pointer]:
        - /url: "#playground"
      - link "Collaboration" [ref=f1e14] [cursor=pointer]:
        - /url: "#collaboration"
      - link "Review" [ref=f1e15] [cursor=pointer]:
        - /url: "#review"
      - link "Versions" [ref=f1e16] [cursor=pointer]:
        - /url: "#versions"
      - link "10 demos" [ref=f1e17] [cursor=pointer]:
        - /url: ./demos.html
        - generic [ref=f1e19]: ↗
      - link "Developers" [ref=f1e20] [cursor=pointer]:
        - /url: ./developers.html
        - generic [ref=f1e22]: ↗
    - link "npm i fountainjs-editor" [ref=f1e23] [cursor=pointer]:
      - /url: https://www.npmjs.com/package/fountainjs-editor
  - generic [ref=f1e24]:
    - generic [ref=f1e25]: Open source · MIT · early beta
    - heading "Build a rich-text editor. Use any framework. Extend every layer." [level=1] [ref=f1e27]:
      - generic [ref=f1e28]: Build a rich-text editor.
      - generic [ref=f1e29]: Use any framework.
      - emphasis [ref=f1e30]: Extend every layer.
    - paragraph [ref=f1e31]: FountainJS is a TypeScript library for adding a full-featured editor to a website or web app. It already includes rich text, images, tables, comments, tracked changes, collaboration, and version history. Use it with React, Vue, Svelte, Angular, plain JavaScript, or a Web Component; store the document JSON on any backend.
    - generic [ref=f1e32]:
      - link "Edit the live demo ↓" [ref=f1e33] [cursor=pointer]:
        - /url: "#playground"
      - link "Install from npm" [ref=f1e34] [cursor=pointer]:
        - /url: https://www.npmjs.com/package/fountainjs-editor
    - generic [ref=f1e35]:
      - generic [ref=f1e36]: ✦One npm package
      - generic [ref=f1e37]: ✦React, Vue, Svelte, Angular
      - generic [ref=f1e38]: ✦Portable JSON
      - generic [ref=f1e39]: ✦No required cloud
      - generic [ref=f1e40]: ✦MIT licensed
  - generic [ref=f1e41]:
    - generic [ref=f1e42]:
      - text: PLAIN ENGLISH
      - heading "It is code you add to your app—not another writing app." [level=2] [ref=f1e43]
    - generic [ref=f1e44]:
      - paragraph [ref=f1e45]: Your users get a familiar document editor. Your developers get the library, source code, and extension points needed to fit it into a real product.
      - paragraph [ref=f1e46]: FountainJS runs in the browser. Choose the plain DOM API, Web Component, or React components; Vue, Svelte, Angular, and other frameworks can use the same Web Component or DOM API. Documents are portable JSON, so a backend written in Python, Go, Ruby, PHP, Java, or another language can store and process them.
      - generic [ref=f1e47]:
        - article [ref=f1e48]:
          - text: "01"
          - heading "Working features included" [level=3] [ref=f1e49]
          - paragraph [ref=f1e50]: Start with normal writing, media, tables, export, collaboration, comments, change review, and versions instead of rebuilding basics.
        - article [ref=f1e51]:
          - text: "02"
          - heading "Use your current stack" [level=3] [ref=f1e52]
          - paragraph [ref=f1e53]: Embed it in React or use the DOM/Web Component interfaces from Vue, Svelte, Angular, plain JavaScript, and other frontend tools.
        - article [ref=f1e54]:
          - text: "03"
          - heading "Change what your product needs" [level=3] [ref=f1e55]
          - paragraph [ref=f1e56]: Add a block, command, format, toolbar, storage provider, or service without maintaining a fork of the editor.
  - generic [ref=f1e57]:
    - generic [ref=f1e58]:
      - generic [ref=f1e59]: WHAT OPEN SOURCE MEANS HERE
      - heading "The editor belongs in your product—not behind ours." [level=2] [ref=f1e60]
      - paragraph [ref=f1e61]: “Open source” describes what you can inspect, own, change, and run. It does not pretend that databases, servers, storage, or third-party models cost nothing.
    - generic [ref=f1e62]:
      - article [ref=f1e63]:
        - generic [ref=f1e64]: "01"
        - heading "Public source and MIT terms" [level=3] [ref=f1e65]
        - paragraph [ref=f1e66]: The engine, optional modules, types, tests, and documentation are public. The MIT license allows commercial use, modification, forks, redistribution, and private product code.
      - article [ref=f1e67]:
        - generic [ref=f1e68]: "02"
        - heading "No Fountain feature paywall" [level=3] [ref=f1e69]
        - paragraph [ref=f1e70]: A capability only counts in this project when it ships through the public package. There is no private extension registry, paid editor tier, or license key that unlocks document features.
      - article [ref=f1e71]:
        - generic [ref=f1e72]: "03"
        - heading "No required Fountain cloud" [level=3] [ref=f1e73]
        - paragraph [ref=f1e74]: Use the editor locally and connect your own database, files, authentication, collaboration transport, conversion service, or AI provider through replaceable interfaces.
      - article [ref=f1e75]:
        - generic [ref=f1e76]: "04"
        - heading "You choose infrastructure costs" [level=3] [ref=f1e77]
        - paragraph [ref=f1e78]: Your hosting or chosen third-party services may charge you. Those are application decisions, not hidden requirements imposed by FountainJS; local and self-hosted implementations remain valid.
    - paragraph [ref=f1e79]:
      - strong [ref=f1e80]: "Practical test:"
      - text: you can install the package, inspect every counted capability, run it without a Fountain account, replace external providers, and continue from a fork if this project disappears.
  - generic [ref=f1e81]:
    - generic [ref=f1e82]:
      - generic [ref=f1e83]: IN THE PACKAGE TODAY
      - heading "The features people expect from a serious editor." [level=2] [ref=f1e84]
      - paragraph [ref=f1e85]: These capabilities work now and ship in the public npm package. Import only the modules you need.
    - generic [ref=f1e86]:
      - article [ref=f1e87]:
        - generic [ref=f1e88]: "01"
        - heading "Rich writing" [level=3] [ref=f1e89]
        - paragraph [ref=f1e90]: Multi-paragraph and cross-block selection, headings, alignment, links, foreground/background colour, font family, font size, line height, marks, mentions, emoji, smart typography, live counts, slash commands, find/replace, undo/redo, paste, and IME input.
      - article [ref=f1e91]:
        - generic [ref=f1e92]: "02"
        - heading "Structured blocks" [level=3] [ref=f1e93]
        - paragraph [ref=f1e94]: Bullet and numbered lists, task lists, code blocks, dividers, collapsible details, nested document structures, tables, and custom block types.
      - article [ref=f1e95]:
        - generic [ref=f1e96]: "03"
        - heading "Production images" [level=3] [ref=f1e97]
        - paragraph [ref=f1e98]: Use block or inline images, editable captions, alt text, alignment, responsive sources, replacement, and accessible resizing. Upload tasks map through edits and expose progress, cancel, retry, and errors while storage remains yours.
      - article [ref=f1e99]:
        - generic [ref=f1e100]: "04"
        - heading "Portable formats" [level=3] [ref=f1e101]
        - paragraph [ref=f1e102]: Lossless JSON plus Markdown, safe HTML, and plain-text boundaries for storage, APIs, publishing pipelines, search, and any backend language.
      - article [ref=f1e103]:
        - generic [ref=f1e104]: "05"
        - heading "Any interface" [level=3] [ref=f1e105]
        - paragraph [ref=f1e106]: Use plain DOM, the standards-based Web Component, React bindings, or create another framework adapter over the same editor and immutable state.
      - article [ref=f1e107]:
        - generic [ref=f1e108]: "06"
        - heading "Open extension contract" [level=3] [ref=f1e109]
        - paragraph [ref=f1e110]: Add nodes, marks, commands, plugins, formats, UI, collaboration providers, analytics, AI, or application services without forking the core.
      - article [ref=f1e111]:
        - generic [ref=f1e112]: "07"
        - heading "Collaboration and review" [level=3] [ref=f1e113]
        - paragraph [ref=f1e114]: Optional Yjs synchronization, relative presence, author-local undo, threaded comments, and tracked changes with portable metadata and explicit decisions.
      - article [ref=f1e115]:
        - generic [ref=f1e116]: "08"
        - heading "Named version history" [level=3] [ref=f1e117]
        - paragraph [ref=f1e118]: Save manual or automatic versions, preview exact content, compare text, structure, formatting, and attributes, then restore with a backup of current work.
  - generic [ref=f1e119]:
    - generic [ref=f1e120]:
      - generic [ref=f1e121]: HOW MODULARITY WORKS
      - heading "Start with a working editor. Change only what you need." [level=2] [ref=f1e122]
    - list [ref=f1e123]:
      - listitem [ref=f1e124]:
        - generic [ref=f1e125]: "1"
        - strong [ref=f1e126]: Install it
        - generic [ref=f1e127]: Start with the supplied editor and a document that already supports common rich content.
      - listitem [ref=f1e128]:
        - generic [ref=f1e129]: "2"
        - strong [ref=f1e130]: Choose features
        - generic [ref=f1e131]: Import collaboration, comments, tracked changes, versions, AI, or other optional modules only when you use them.
      - listitem [ref=f1e132]:
        - generic [ref=f1e133]: "3"
        - strong [ref=f1e134]: Customize behavior
        - generic [ref=f1e135]: Add your own content blocks, commands, keyboard rules, formats, or product services through the same extension API.
      - listitem [ref=f1e136]:
        - generic [ref=f1e137]: "4"
        - strong [ref=f1e138]: Connect your interface
        - generic [ref=f1e139]: Use React components, the Web Component, plain DOM controls, or build a small adapter for another framework.
      - listitem [ref=f1e140]:
        - generic [ref=f1e141]: "5"
        - strong [ref=f1e142]: Store it anywhere
        - generic [ref=f1e143]: Keep portable JSON in your database and connect your own media, authentication, collaboration, or AI providers.
  - generic [ref=f1e144]:
    - generic [ref=f1e145]:
      - generic [ref=f1e146]:
        - text: LIVE PLAYGROUND
        - heading "Try the actual package in your browser." [level=2] [ref=f1e147]
      - paragraph [ref=f1e148]: 132 words · 9 blocks · local demo adapter
    - generic [ref=f1e149]:
      - text: "Try it: select text and open"
      - strong [ref=f1e150]: Text styles
      - text: to change its family, size, line height, foreground, and background. Select the ABC123xyz integrity sample to expose its hidden character. Insert a collapsible section, or click the reading above
      - strong [ref=f1e151]: 東京
      - text: "to edit its ruby annotation. Hover or tap a block for move controls. Start an empty line with / for commands; type @a, #re, or :rock for suggestions. Typography converts --, ..., arrows, fractions, and quotes as you type."
    - generic [ref=f1e152]:
      - complementary [ref=f1e153]:
        - navigation "Document outline" [ref=f1e154]:
          - generic [ref=f1e155]: Outline
          - button "Try FountainJS in this document." [ref=f1e156] [cursor=pointer]
          - button "What you can test here" [ref=f1e157] [cursor=pointer]
        - generic [ref=f1e158]: Markdown shortcuts## heading · - list · > quote
      - generic [ref=f1e159]:
        - generic "Insert rich content" [ref=f1e160]:
          - generic [ref=f1e161]: Insert
          - button "❝ Quote" [ref=f1e162] [cursor=pointer]
          - button "☑ Tasks" [ref=f1e163] [cursor=pointer]
          - button "▦ Table" [ref=f1e164] [cursor=pointer]
          - button "▸ Details" [ref=f1e165] [cursor=pointer]
          - button "あ Ruby" [ref=f1e166] [cursor=pointer]
          - button "✦ Callout" [ref=f1e167] [cursor=pointer]
          - button "Use compact toolbar" [ref=f1e168] [cursor=pointer]
        - generic [ref=f1e169]:
          - toolbar "Formatting and rich content" [ref=f1e171]:
            - group "History and search" [ref=f1e172]:
              - button "Undo" [disabled] [ref=f1e173]
              - button "Redo" [disabled] [ref=f1e174]
              - button "Find and replace" [ref=f1e175] [cursor=pointer]
              - button "Clipboard history (Ctrl/Command+Alt+V)" [ref=f1e176] [cursor=pointer]
            - group "Block types" [ref=f1e177]:
              - button "Paragraph" [ref=f1e178] [cursor=pointer]
              - button "H1 — Heading 1" [ref=f1e179] [cursor=pointer]:
                - img:
                  - generic: H1
              - button "H2 — Heading 2" [ref=f1e180] [cursor=pointer]:
                - img:
                  - generic: H2
              - button "H3 — Heading 3" [ref=f1e181] [cursor=pointer]:
                - img:
                  - generic: H3
            - group "Text formatting" [ref=f1e182]:
              - button "Bold" [ref=f1e183] [cursor=pointer]
              - button "Italic" [ref=f1e184] [cursor=pointer]
              - button "Underline" [ref=f1e185] [cursor=pointer]
              - button "Strikethrough" [ref=f1e186] [cursor=pointer]
              - button "Inline code" [ref=f1e187] [cursor=pointer]
              - button "Highlight text and choose colour" [ref=f1e188] [cursor=pointer]
              - button "2 — Subscript" [ref=f1e189] [cursor=pointer]:
                - img:
                  - generic: "2"
              - button "2 — Superscript" [ref=f1e190] [cursor=pointer]:
                - img:
                  - generic: "2"
              - button "Add or edit link" [ref=f1e191] [cursor=pointer]
              - button "Remove link" [disabled] [ref=f1e192]
              - generic "Text color" [ref=f1e193] [cursor=pointer]:
                - textbox "Text color" [ref=f1e194]: "#171923"
              - button "Remove text color" [disabled] [ref=f1e195]
              - button "A — Text styles" [ref=f1e196] [cursor=pointer]:
                - img:
                  - generic: A
            - group "Alignment" [ref=f1e197]:
              - button "Align left" [ref=f1e198] [cursor=pointer]
              - button "Align center" [ref=f1e199] [cursor=pointer]
              - button "Align right" [ref=f1e200] [cursor=pointer]
              - button "Justify" [ref=f1e201] [cursor=pointer]
            - group "Insert rich content" [ref=f1e202]:
              - button "Insert definition list" [ref=f1e203] [cursor=pointer]
              - button "Quote selected blocks" [ref=f1e204] [cursor=pointer]
              - button "Bullet list" [ref=f1e205] [cursor=pointer]
              - button "123 — Numbered list" [ref=f1e206] [cursor=pointer]:
                - img:
                  - generic: "1"
                  - generic: "2"
                  - generic: "3"
              - button "Task list" [ref=f1e207] [cursor=pointer]
              - button "Lift list item" [disabled] [ref=f1e208]
              - button "Indent list item" [disabled] [ref=f1e209]
              - button "Code block and language" [ref=f1e210] [cursor=pointer]
              - button "Insert table" [ref=f1e211] [cursor=pointer]
              - button "Insert image from URL" [ref=f1e212] [cursor=pointer]
              - button "Upload image" [ref=f1e213] [cursor=pointer]
              - button "Insert audio, video, file, or embed" [ref=f1e214] [cursor=pointer]
              - button "Upload audio, video, or file" [ref=f1e215] [cursor=pointer]
              - button "Divider" [ref=f1e216] [cursor=pointer]
              - button "Line break" [ref=f1e217] [cursor=pointer]
          - generic [ref=f1e218]:
            - textbox "Rich text editor" [active] [ref=f1e219]:
              - heading "Try FountainJS in this document." [level=1] [ref=f1e220]
              - paragraph [ref=f1e221]:
                - text: Select text, type across paragraphs, and use the toolbar. This is the
                - strong [ref=f1e223]: real npm package
                - text: ", not a picture or a scripted mock-up."
              - heading "What you can test here" [level=2] [ref=f1e224]
              - paragraph [ref=f1e225]: Insert lists, tables, images, media, callouts, and collapsible sections. Then switch between Markdown, HTML, and JSON output on the right.
              - paragraph [ref=f1e226]:
                - text: "Ruby pronunciation is document data:"
                - generic [ref=f1e227]:
                  - strong [ref=f1e230]: 東京
                  - button "Edit pronunciation “とうきょう” for “東京”" [ref=f1e231] [cursor=pointer]: とうきょう
                - text: . Click or focus the reading above the word to edit it.
              - blockquote [ref=f1e232]:
                - paragraph [ref=f1e233]: The editor stores your document as portable JSON on the backend you choose.
              - group [ref=f1e234]:
                - generic "Open this collapsible section" [ref=f1e235] [cursor=pointer]
              - region "typescript code" [ref=f1e236]:
                - text: typescript
                - code [ref=f1e237]:
                  - generic [ref=f1e238]: "const kit = composeExtensions([ CoreExtension, history, callout, myIntegration ]); const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });"
              - paragraph [ref=f1e239]: "Integrity sample: ABC123xyz contains one deliberately invisible zero-width space. Select the value and inspect it."
            - toolbar "Paragraph block controls" [ref=f1e240]:
              - button "Drag Paragraph block" [ref=f1e241]
              - button "Move Paragraph block before" [ref=f1e244] [cursor=pointer]
              - button "Move Paragraph block after" [ref=f1e247] [cursor=pointer]
        - toolbar "Selection actions" [ref=f1e250]:
          - button "Bold selection" [ref=f1e251] [cursor=pointer]: B
          - button "Italic selection" [ref=f1e252] [cursor=pointer]: I
          - button "Underline selection" [ref=f1e253] [cursor=pointer]: U
          - button "Highlight selection" [ref=f1e254] [cursor=pointer]: Highlight
        - status [ref=f1e255]:
          - generic [ref=f1e256]: 877 / 5000 characters
          - generic [ref=f1e257]: 132 words
      - complementary [ref=f1e258]:
        - generic [ref=f1e259]:
          - generic [ref=f1e260]: COMPOSED FOR THIS DEMO
          - generic [ref=f1e261]:
            - code [ref=f1e262]: fountain-core
            - code [ref=f1e263]: integrity
            - code [ref=f1e264]: stable-node-ids
            - code [ref=f1e265]: table-of-contents
            - code [ref=f1e266]: media
            - code [ref=f1e267]: mention
            - code [ref=f1e268]: emoji
            - code [ref=f1e269]: character-count
            - code [ref=f1e270]: typography
            - code [ref=f1e271]: slash-command
            - code [ref=f1e272]: bubble-menu
            - code [ref=f1e273]: floating-menu
            - code [ref=f1e274]: history
            - code [ref=f1e275]: markdown-shortcuts
            - code [ref=f1e276]: syntax-highlight
            - code [ref=f1e277]: table-editing
            - code [ref=f1e278]: trailing-editable-block
            - code [ref=f1e279]: clipboard-history
            - code [ref=f1e280]: details
            - code [ref=f1e281]: ruby
            - code [ref=f1e282]: callout
            - code [ref=f1e283]: ai-review
        - region "Text integrity" [ref=f1e284]:
          - generic [ref=f1e285]:
            - generic [ref=f1e286]:
              - text: VERBATIM & UNICODE
              - heading "Text integrity" [level=2] [ref=f1e287]
            - generic [ref=f1e288]:
              - button "Show invisibles" [ref=f1e289] [cursor=pointer]
              - 'button "Verbatim input: off" [ref=f1e290] [cursor=pointer]'
          - paragraph [ref=f1e291]: Verbatim input is off. Fountain’s normal input extensions may transform typed text.
          - paragraph [ref=f1e292]: Select text inside one paragraph or text block to inspect its exact Unicode and UTF-8 content.
        - generic [ref=f1e293]:
          - generic [ref=f1e294]:
            - strong [ref=f1e295]: Live document output
            - button "Copy" [ref=f1e296] [cursor=pointer]
          - generic [ref=f1e297]:
            - button "markdown" [ref=f1e298] [cursor=pointer]
            - button "html" [ref=f1e299] [cursor=pointer]
            - button "json" [ref=f1e300] [cursor=pointer]
          - code [ref=f1e302]: "# Try FountainJS in this document. Select text, type across paragraphs, and use the toolbar. This is the **real npm package**, not a picture or a scripted mock-up. ## What you can test here Insert lists, tables, images, media, callouts, and collapsible sections. Then switch between Markdown, HTML, and JSON output on the right. Ruby pronunciation is document data: <ruby data-fountain-ruby=\"true\"><rb><strong>東京</strong></rb><rp>(</rp><rt>とうきょう</rt><rp>)</rp></ruby>. Click or focus the reading above the word to edit it. > The editor stores your document as portable JSON on the backend you choose. <details> <summary>Open this collapsible section</summary> Its summary and body are editable document content, not a pasted widget. </details> ```typescript const kit = composeExtensions([ CoreExtension, history, callout, myIntegration ]); const editor = createEditor({ schema: kit.schema, plugins: kit.plugins }); ``` Integrity sample: ABC123xyz contains one deliberately invisible zero-width space. Select the value and inspect it."
        - group [ref=f1e303]:
          - generic "Optional AI review examples" [ref=f1e304] [cursor=pointer]
          - option "Challenge an assumption" [selected]
          - option "Explain the current idea"
          - option "Image" [selected]
  - generic [ref=f1e305]:
    - generic [ref=f1e306]:
      - generic [ref=f1e307]:
        - text: REAL-TIME COLLABORATION
        - heading "Two editors. One convergent document." [level=2] [ref=f1e308]
      - generic [ref=f1e309]:
        - paragraph [ref=f1e310]: This preview uses the unreleased default Yjs adapter with two in-memory peers. Each room has its own document. Type or select on either side and watch the other follow.
        - paragraph [ref=f1e311]:
          - strong [ref=f1e312]: No FountainJS server or account is required.
          - text: Transport, authentication, room access, and persistence stay replaceable.
    - generic [ref=f1e313]:
      - generic [ref=f1e314]: "Try it: edit both documents, select a phrase to reveal the peer cursor, then use each author’s undo."
      - generic [ref=f1e315]:
        - strong [ref=f1e316]: "Room: Launch"
        - button "Switch both editors to Planning room" [ref=f1e317] [cursor=pointer]
        - button "Pause document sync" [ref=f1e318] [cursor=pointer]
      - generic [ref=f1e319]: Try an offline merge. Pause sync, type inside a paragraph as Ada, then format or split the same paragraph as Grace. Resume to see both changes.
    - generic [ref=f1e320]:
      - article [ref=f1e321]:
        - generic [ref=f1e322]:
          - generic [ref=f1e323]: Ada
          - code [ref=f1e325]: connected
        - textbox "Ada collaborative editor" [ref=f1e328]:
          - heading "Shared launch note" [level=2] [ref=f1e329]
          - paragraph [ref=f1e330]:
            - generic [ref=f1e331]:
              - generic "Comment thread by Grace" [ref=f1e332]: Edit either side
              - text: . Text, blocks, selections, and undo remain author-aware.
          - complementary [ref=f1e333]:
            - strong [ref=f1e334]: Shared launch settings
            - generic [ref=f1e335]: 2 columns · comfortable
        - group "Ada formatting" [ref=f1e336]:
          - button "Toggle Ada quote" [ref=f1e337] [cursor=pointer]: Toggle quote
        - generic [ref=f1e338]:
          - generic [ref=f1e339]: 91 characters · 1 peer · 1 threads
          - generic [ref=f1e340]:
            - button "Undo Ada" [disabled] [ref=f1e341]
            - button "Redo" [disabled] [ref=f1e342]
      - article [ref=f1e343]:
        - generic [ref=f1e344]:
          - generic [ref=f1e345]: Grace
          - code [ref=f1e347]: connected
        - textbox "Grace collaborative editor" [ref=f1e350]:
          - heading "Shared launch note" [level=2] [ref=f1e351]
          - paragraph [ref=f1e352]:
            - generic [ref=f1e353]: Edit either side. Text, blocks, selections, and undo remain author-aware.
          - complementary [ref=f1e354]:
            - strong [ref=f1e355]: Shared launch settings
            - generic [ref=f1e356]: 2 columns · comfortable
        - group "Grace formatting" [ref=f1e357]:
          - button "Toggle quote" [ref=f1e358] [cursor=pointer]
          - button "Toggle bullet list" [ref=f1e359] [cursor=pointer]
          - button "Toggle numbered list" [ref=f1e360] [cursor=pointer]
          - button "Toggle task list" [ref=f1e361] [cursor=pointer]
          - button "Toggle bold" [ref=f1e362] [cursor=pointer]
        - generic [ref=f1e363]:
          - generic [ref=f1e364]: 91 characters · 1 peer · 1 threads
          - generic [ref=f1e365]:
            - button "Undo Grace" [disabled] [ref=f1e366]
            - button "Redo" [disabled] [ref=f1e367]
    - region "Granular collaborative settings" [ref=f1e368]:
      - generic [ref=f1e369]:
        - text: NESTED CRDT ATTRIBUTES
        - heading "Change separate fields. Keep both changes." [level=3] [ref=f1e370]
        - paragraph [ref=f1e371]:
          - text: These controls edit the original settings card for this room. Its
          - code [ref=f1e372]: config
          - text: attribute is mirrored into nested Y.Map and Y.Array values, so peers can edit different settings at the same time.
      - article [ref=f1e373]:
        - strong [ref=f1e374]: Ada’s controls
        - generic [ref=f1e375]: 2 columns · 1 filters
        - generic [ref=f1e376]:
          - button "Add a column" [ref=f1e377] [cursor=pointer]
          - button "Add owner filter" [ref=f1e378] [cursor=pointer]
      - article [ref=f1e379]:
        - strong [ref=f1e380]: Grace’s controls
        - generic [ref=f1e381]: Comfortable · 1 filters
        - generic [ref=f1e382]:
          - button "Toggle density" [ref=f1e383] [cursor=pointer]
          - button "Add priority filter" [ref=f1e384] [cursor=pointer]
    - generic [ref=f1e385]:
      - generic [ref=f1e386]:
        - text: THREADED COMMENTS
        - heading "Discussion is portable too." [level=3] [ref=f1e387]
        - paragraph [ref=f1e388]: The document, comment store, and interface are separate modules. Each room shares its threads between both editors; select content to add an inline or block thread, reply, react, resolve, archive, or reattach an orphan.
        - paragraph [ref=f1e389]: The included in-memory adapter powers this page. Production apps replace it with REST, a database, a CRDT, or another authenticated store—and enforce permissions there.
      - complementary "Shared review" [ref=f1e390]:
        - generic [ref=f1e391]:
          - generic [ref=f1e392]:
            - heading "Shared review" [level=2] [ref=f1e393]
            - generic [ref=f1e394]: 1 thread · connected
          - button "New comment" [ref=f1e395] [cursor=pointer]
        - region "Thread by Grace" [ref=f1e397]:
          - button "inline Edit either side" [ref=f1e398] [cursor=pointer]:
            - generic [ref=f1e399]: inline
            - generic [ref=f1e400]: Edit either side
          - generic [ref=f1e401]: Open
          - article [ref=f1e403]:
            - generic [ref=f1e404]:
              - strong [ref=f1e405]: Grace
              - time [ref=f1e406]: 11/11/2026, 1:47:12 PM
            - paragraph [ref=f1e407]: Could we make the provider boundary even clearer?
            - generic [ref=f1e408]:
              - button "React 👍 to comment by Grace" [ref=f1e409] [cursor=pointer]: 👍
              - button "React ✅ to comment by Grace" [ref=f1e410] [cursor=pointer]: ✅
          - button "Resolve" [ref=f1e412] [cursor=pointer]
    - generic [ref=f1e413]:
      - code [ref=f1e414]: fountainjs-editor/yjs
      - generic [ref=f1e415]: CRDT document + nested attributes + relative positions + local-origin undo
      - code [ref=f1e416]: fountainjs-editor/comments
      - generic [ref=f1e417]: Mapped anchors + storage operations + permissions
      - generic [ref=f1e418]: +Your provider
      - generic [ref=f1e419]: +Your auth and storage
  - generic [ref=f1e420]:
    - generic [ref=f1e421]:
      - generic [ref=f1e422]:
        - text: TRACKED CHANGES
        - heading "Edit freely. Decide explicitly." [level=2] [ref=f1e423]: Edit freely.Decide explicitly.
      - generic [ref=f1e424]:
        - paragraph [ref=f1e425]: This is the real optional tracking module. Suggested text, formatting, attributes, atoms, tables, and structural edits keep their author and can be accepted or rejected individually, by range, by author, or in batches.
        - paragraph [ref=f1e426]:
          - strong [ref=f1e427]: "Try it now:"
          - text: type or delete in the document, select a review card, filter the list, and make a decision. The complete text stays inspectable.
    - generic [ref=f1e428]:
      - article [ref=f1e429]:
        - generic [ref=f1e430]:
          - generic [ref=f1e431]: Review document
          - code [ref=f1e432]: portable FountainJSON
        - textbox "Tracked changes demo editor" [ref=f1e435]:
          - heading "attributeChange suggestion by Ada Lovelace" [level=2] [ref=f1e436]: A review workflow people can trust
          - paragraph [ref=f1e437]:
            - text: Every
            - generic "replace suggestion by Ada Lovelace" [ref=f1e439]:
              - deletion [ref=f1e440]: product
            - generic "replace suggestion by Ada Lovelace" [ref=f1e442]:
              - insertion [ref=f1e443]: team
            - text: deserves editing tools that reveal intent clearly.
          - paragraph [ref=f1e444]: Try typing, replacing, formatting, or deleting anything in this document.
          - blockquote "structure suggestion by Grace Hopper" [ref=f1e445]:
            - paragraph [ref=f1e446]: Portable suggestions travel with the document; the host still owns access control.
      - complementary [ref=f1e447]:
        - region "Review suggestions" [ref=f1e448]:
          - generic [ref=f1e449]:
            - generic [ref=f1e450]:
              - heading "Review suggestions" [level=2] [ref=f1e451]
              - paragraph [ref=f1e452]: 3 open suggestions
            - generic [ref=f1e453]:
              - checkbox "Track my edits" [checked] [ref=f1e454]
              - text: Track my edits
          - generic [ref=f1e455]:
            - generic [ref=f1e456]:
              - text: Change type
              - combobox "Change type" [ref=f1e457]:
                - option "All types" [selected]
                - option "Insertion"
                - option "Deletion"
                - option "Replacement"
                - option "Formatting"
                - option "Attributes"
                - option "Structure"
            - generic [ref=f1e458]:
              - text: Author
              - combobox "Author" [ref=f1e459]:
                - option "All authors" [selected]
                - option "Ada Lovelace"
                - option "Grace Hopper"
          - generic [ref=f1e460]:
            - button "Accept shown" [ref=f1e461] [cursor=pointer]
            - button "Reject shown" [ref=f1e462] [cursor=pointer]
          - list [ref=f1e463]:
            - listitem [ref=f1e464]:
              - button "Attributes Ada Lovelace 11/11/2026, 1:47:12 PM" [ref=f1e465] [cursor=pointer]:
                - generic [ref=f1e466]: Attributes
                - generic "Ada Lovelace" [ref=f1e467]
                - time [ref=f1e468]: 11/11/2026, 1:47:12 PM
              - paragraph [ref=f1e469]: "{\"level\":2,\"align\":\"left\"} → {\"level\":2,\"align\":\"center\"}"
              - paragraph [ref=f1e470]:
                - strong [ref=f1e471]: "Reason:"
                - text: Center the review heading
              - generic [ref=f1e472]:
                - button "Accept" [ref=f1e473] [cursor=pointer]
                - button "Reject" [ref=f1e474] [cursor=pointer]
            - listitem [ref=f1e475]:
              - button "Replacement Ada Lovelace 11/11/2026, 1:47:12 PM" [ref=f1e476] [cursor=pointer]:
                - generic [ref=f1e477]: Replacement
                - generic "Ada Lovelace" [ref=f1e478]
                - time [ref=f1e479]: 11/11/2026, 1:47:12 PM
              - paragraph [ref=f1e480]: product → team
              - paragraph [ref=f1e481]:
                - strong [ref=f1e482]: "Reason:"
                - text: Make the audience more specific
              - generic [ref=f1e483]:
                - button "Accept" [ref=f1e484] [cursor=pointer]
                - button "Reject" [ref=f1e485] [cursor=pointer]
            - listitem [ref=f1e486]:
              - button "Structure Grace Hopper 11/11/2026, 1:47:12 PM" [ref=f1e487] [cursor=pointer]:
                - generic [ref=f1e488]: Structure
                - generic "Grace Hopper" [ref=f1e489]
                - time [ref=f1e490]: 11/11/2026, 1:47:12 PM
              - paragraph [ref=f1e491]: "Added: Portable suggestions travel with the document; the host still owns access control."
              - paragraph [ref=f1e492]:
                - strong [ref=f1e493]: "Reason:"
                - text: Add the architecture boundary
              - generic [ref=f1e494]:
                - button "Accept" [ref=f1e495] [cursor=pointer]
                - button "Reject" [ref=f1e496] [cursor=pointer]
    - generic [ref=f1e497]:
      - code [ref=f1e498]: fountainjs-editor/tracked-changes
      - generic [ref=f1e499]: Framework-neutral state + decisions
      - code [ref=f1e500]: fountainjs-editor/react/tracked-changes
      - generic [ref=f1e501]: Optional review panel
      - generic [ref=f1e502]: +Yjs-compatible
      - generic [ref=f1e503]: +No hosted service required
  - generic [ref=f1e504]:
    - generic [ref=f1e505]:
      - generic [ref=f1e506]:
        - text: VERSION HISTORY
        - heading "Save a draft. Keep working. Restore safely." [level=2] [ref=f1e507]: Save a draft.Keep working.Restore safely.
      - generic [ref=f1e508]:
        - paragraph [ref=f1e509]: Name important document states, compare any two versions, preview the exact saved JSON, and restore an older draft.
        - paragraph [ref=f1e510]:
          - strong [ref=f1e511]: "Try it:"
          - text: edit the document, compare a saved version with the current text, preview it, or press Restore twice to confirm. FountainJS saves the current work as a backup before replacing it.
    - generic [ref=f1e512]:
      - article [ref=f1e513]:
        - generic [ref=f1e514]:
          - generic [ref=f1e515]: Current document
          - code [ref=f1e516]: edit this text
        - textbox "Version history demo editor" [ref=f1e519]:
          - heading "Launch brief" [level=2] [ref=f1e520]
          - paragraph [ref=f1e521]: The current working draft explains the launch, audience, and release decision in plain language.
          - paragraph [ref=f1e522]: The final checklist is included for everyone.
      - complementary [ref=f1e523]:
        - region "Saved versions" [ref=f1e524]:
          - generic [ref=f1e526]:
            - heading "Saved versions" [level=2] [ref=f1e527]
            - paragraph [ref=f1e528]: 2 loaded · Unsaved changes · idle
          - generic [ref=f1e529]:
            - generic [ref=f1e530]:
              - generic [ref=f1e531]: Version name (optional)
              - textbox "Version name (optional)" [ref=f1e532]:
                - /placeholder: For example, Client review draft
            - button "Save current version" [ref=f1e533] [cursor=pointer]
          - group "Compare any two states" [ref=f1e534]:
            - generic [ref=f1e536]:
              - text: From
              - combobox "From" [ref=f1e537]:
                - option "Team review with the complete descriptive name visible" [selected]
                - option "First complete draft — nothing hidden after an ellipsis"
            - generic [ref=f1e538]:
              - text: To
              - combobox "To" [ref=f1e539]:
                - option "Current document" [selected]
                - option "Team review with the complete descriptive name visible"
                - option "First complete draft — nothing hidden after an ellipsis"
            - button "Compare" [ref=f1e540] [cursor=pointer]
          - generic [ref=f1e541]:
            - article [ref=f1e542]:
              - generic [ref=f1e543]:
                - generic [ref=f1e544]:
                  - heading "Team review with the complete descriptive name visible" [level=3] [ref=f1e545]
                  - paragraph [ref=f1e546]: manual · Revision 2
                - time [ref=f1e547]: 11/11/2026, 1:47:12 PM
              - paragraph [ref=f1e548]: Saved by You
              - generic [ref=f1e549]:
                - button "Preview" [ref=f1e550] [cursor=pointer]
                - button "Compare to current" [ref=f1e551] [cursor=pointer]
                - button "Restore" [ref=f1e552] [cursor=pointer]
                - button "Delete" [ref=f1e553] [cursor=pointer]
            - article [ref=f1e554]:
              - generic [ref=f1e555]:
                - generic [ref=f1e556]:
                  - heading "First complete draft — nothing hidden after an ellipsis" [level=3] [ref=f1e557]
                  - paragraph [ref=f1e558]: manual · Revision 1
                - time [ref=f1e559]: 11/11/2026, 1:47:12 PM
              - paragraph [ref=f1e560]: Saved by You
              - generic [ref=f1e561]:
                - button "Preview" [ref=f1e562] [cursor=pointer]
                - button "Compare to current" [ref=f1e563] [cursor=pointer]
                - button "Restore" [ref=f1e564] [cursor=pointer]
                - button "Delete" [ref=f1e565] [cursor=pointer]
    - generic [ref=f1e566]:
      - code [ref=f1e567]: fountainjs-editor/versions
      - generic [ref=f1e568]: Public MIT module
      - generic [ref=f1e569]: +Your storage provider
      - generic [ref=f1e570]: +Exact comparison
      - generic [ref=f1e571]: +Backup-first restore
  - generic [ref=f1e572]:
    - generic [ref=f1e573]:
      - generic [ref=f1e574]: HONEST COMPARISON
      - heading "FountainJS versus the complete ProseMirror + Tiptap stack." [level=2] [ref=f1e575]
      - paragraph [ref=f1e576]: "ProseMirror supplies Tiptap’s engine; Tiptap supplies the higher-level developer and product layer. FountainJS independently builds both responsibilities into one open-source project: its own engine plus native editing, review, collaboration, format, and UI modules. The older stack still has much greater production history and ecosystem scale."
    - table "Rich text editor comparison" [ref=f1e577]:
      - row [ref=f1e578] [cursor=pointer]:
        - cell "ProseMirror + Tiptap" [ref=f1e579]
        - cell "Battle-tested ProseMirror engine plus Tiptap’s mature product and developer layer." [ref=f1e580]
        - cell "Low-level schema, transactions, plugins, and DOM view with extensions, framework bindings, UI, and optional services above them." [ref=f1e581]
        - cell "Choose the combined stack for its production history, ecosystem depth, hosted services, and commercial support." [ref=f1e582]
        - generic [ref=f1e583]: ↗
      - row [ref=f1e584] [cursor=pointer]:
        - cell "Plate" [ref=f1e585]
        - cell "Powerful React/Slate framework with composable plugins and polished examples." [ref=f1e586]
        - cell "React-first components and composable Slate plugins." [ref=f1e587]
        - cell "Choose it for a React-first stack and a broad ready-made feature set." [ref=f1e588]
        - generic [ref=f1e589]: ↗
      - row [ref=f1e590] [cursor=pointer]:
        - cell "BlockNote" [ref=f1e591]
        - cell "Excellent out-of-the-box React block editor experience." [ref=f1e592]
        - cell "React-first block editor; advanced usage can mount the editor without React." [ref=f1e593]
        - cell "Choose it when a Notion-like block UI is the priority." [ref=f1e594]
        - generic [ref=f1e595]: ↗
      - row [ref=f1e596] [cursor=pointer]:
        - cell "FountainJS" [ref=f1e597]
        - cell "Early-beta TypeScript editor library with working DOM, Web Component, and React interfaces." [ref=f1e598]
        - cell "Ready-made editing, review, collaboration, and versioning modules with one public extension API." [ref=f1e599]
        - cell "Choose it when you want the capabilities in one public MIT package and control over framework, storage, and services." [ref=f1e600]
        - generic [ref=f1e601]: ↗
    - generic [ref=f1e602]:
      - article [ref=f1e603]:
        - text: FountainJS is a fit when…
        - paragraph [ref=f1e604]: You need a capable editor across multiple frontend surfaces, want extensions to stay host-controlled, and prefer portable JSON, open interfaces, and MIT licensing.
      - article [ref=f1e605]:
        - text: Choose a mature alternative when…
        - paragraph [ref=f1e606]: You need a much larger extension market, years of physical-device deployment evidence, or commercial support today.
    - paragraph [ref=f1e607]:
      - link "Read the one-to-one full-stack comparison →" [ref=f1e608] [cursor=pointer]:
        - /url: https://github.com/eddolo/fountainjs/blob/master/docs/PROSEMIRROR_COMPARISON.md
  - generic [ref=f1e609]:
    - generic [ref=f1e610]:
      - text: THE EXTENSION CONTRACT
      - heading "Add anything. Replace any layer you own." [level=2] [ref=f1e611]
    - code [ref=f1e614]: "const callout = defineExtension({ name: 'callout', nodes: { callout: calloutSpec }, commands: { toggleCallout }, formats: { myFormat }, services: { analytics } }) const kit = composeExtensions([ CoreExtension, history, callout ])"
    - list [ref=f1e615]:
      - listitem [ref=f1e616]:
        - generic [ref=f1e617]: DOM first
        - generic [ref=f1e618]: The core editor and view do not import React or another UI framework.
      - listitem [ref=f1e619]:
        - generic [ref=f1e620]: Web standard
        - generic [ref=f1e621]: Register <fountain-editor> once and consume it from any Custom-Element-capable framework.
      - listitem [ref=f1e622]:
        - generic [ref=f1e623]: Open modules
        - generic [ref=f1e624]: Nodes, marks, plugins, commands, formats, and services share one composition contract.
      - listitem [ref=f1e625]:
        - generic [ref=f1e626]: Optional AI
        - generic [ref=f1e627]: The review controller and MCP adapter are example modules—not dependencies or the product identity.
  - generic [ref=f1e628]:
    - paragraph [ref=f1e629]: npm install fountainjs-editor
    - heading "Build the editor your product needs. Nothing more. Nothing locked in." [level=2] [ref=f1e630]:
      - generic [ref=f1e631]: Build the editor your product needs.
      - generic [ref=f1e632]: Nothing more. Nothing locked in.
    - generic [ref=f1e633]:
      - link "Explore 10 working demos →" [ref=f1e634] [cursor=pointer]:
        - /url: ./demos.html
      - link "Read the developer guide →" [ref=f1e635] [cursor=pointer]:
        - /url: ./developers.html
      - link "GitHub ↗" [ref=f1e636] [cursor=pointer]:
        - /url: https://github.com/eddolo/fountainjs
  - generic [ref=f1e637]:
    - generic [ref=f1e638]: FountainJS · Built by Paolo Cappuccini
    - generic [ref=f1e639]: MIT · TypeScript · Open source
```

# Test source

```ts
  6104 |   const original = JSON.parse(await json.textContent() ?? '');
  6105 |   await editor.locator('[data-fountain-node="paragraph"]').first().click();
  6106 |   await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  6107 |   const selected = await page.evaluate(() => document.getSelection()?.toString());
  6108 |   expect(selected?.length).toBeGreaterThan(0);
  6109 |   const color = page.locator('[data-fountain-toolbar-action="text-color"] input');
  6110 |   await color.focus();
  6111 |   await color.fill('#234567');
  6112 |   await expect(color).toBeFocused();
  6113 |   await expect.poll(async () => JSON.parse(await json.textContent() ?? '').content
  6114 |     .some((node: any) => node.type === 'paragraph' && node.content?.some((leaf: any) =>
  6115 |       leaf.marks?.some((mark: any) => mark.type === 'text_color' && mark.attrs.color === '#234567')))).toBe(true);
  6116 |   await page.locator('.demo-surface').screenshot({ path: info.outputPath('native-colour-mapped-selection.png') });
  6117 |   await expect(color).toBeFocused();
  6118 |   // A user returns by clicking the document. Raw HTMLElement.focus() is not
  6119 |   // the public EditorView.focus() API, which restores the model selection.
  6120 |   await editor.locator('[data-fountain-node="paragraph"]').first().click();
  6121 |   await expect(editor).toBeFocused();
  6122 |   await page.keyboard.press('ControlOrMeta+z');
  6123 |   await expect.poll(async () => JSON.parse(await json.textContent() ?? '')).toEqual(original);
  6124 | });
  6125 | 
  6126 | test('keeps table configuration labels legible on pointer hover', async ({ page }, info) => {
  6127 |   await page.goto('/demos/react-article.html');
  6128 |   const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  6129 |   await expect(page.locator('.demo-output pre')).toContainText('"type": "doc"');
  6130 |   await editor.locator('[data-fountain-node="paragraph"]').first().click();
  6131 |   await page.locator('button[data-fountain-toolbar-action="insert-table"]').click();
  6132 |   await page.locator('form.is-table').getByRole('button', { name: 'Insert', exact: true }).click();
  6133 |   await editor.locator('th,td').first().click();
  6134 |   await page.locator('button[data-fountain-toolbar-action="table-menu"]').click();
  6135 |   const form = page.locator('form.is-table-tools');
  6136 |   const original = JSON.parse(await page.locator('.demo-output pre').textContent() ?? '');
  6137 |   for (const width of [1280, 390]) {
  6138 |     await page.setViewportSize({ width, height: width === 390 ? 844 : 720 });
  6139 |     const button = form.getByRole('button', { name: 'Make/unmake header row', exact: true });
  6140 |     await button.hover();
  6141 |     await button.evaluate(async element => {
  6142 |       await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  6143 |       await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  6144 |     });
  6145 |     const appearance = await button.evaluate(element => {
  6146 |       const style = getComputedStyle(element);
  6147 |       const luminance = (color: string) => {
  6148 |         const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
  6149 |           const channel = Number(value) / 255;
  6150 |           return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  6151 |         });
  6152 |         return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  6153 |       };
  6154 |       const foreground = luminance(style.color); const background = luminance(style.backgroundColor);
  6155 |       return { color: style.color, background: style.backgroundColor, opacity: style.opacity,
  6156 |         contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) };
  6157 |     });
  6158 |     await form.screenshot({ path: info.outputPath(`table-hover-${width}.png`) });
  6159 |     expect(appearance.opacity).toBe('1');
  6160 |     expect(appearance.contrast, JSON.stringify(appearance)).toBeGreaterThanOrEqual(4.5);
  6161 |     expect(JSON.parse(await page.locator('.demo-output pre').textContent() ?? '')).toEqual(original);
  6162 |   }
  6163 | });
  6164 | 
  6165 | test('creates and edits a link through the public React toolbar', async ({ page }) => {
  6166 |   await page.goto('/');
  6167 |   const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  6168 |   const firstParagraph = editor.locator('[data-fountain-node="paragraph"]').first();
  6169 |   const linkButton = page.getByRole('button', { name: 'Add or edit link' });
  6170 |   await firstParagraph.click();
  6171 |   await page.keyboard.press('Home');
  6172 |   await page.keyboard.press('Shift+End');
  6173 |   await linkButton.click();
  6174 |   await page.getByLabel('Link URL').fill('www.example.com');
  6175 |   await page.getByLabel('Link title').fill('Example website');
  6176 |   await page.getByLabel('Link destination').selectOption('_self');
  6177 |   await page.getByRole('button', { name: 'Apply link' }).click();
  6178 | 
  6179 |   const link = editor.getByRole('link').first();
  6180 |   await expect(link).toHaveAttribute('href', 'https://www.example.com');
  6181 |   await expect(link).toHaveAttribute('title', 'Example website');
  6182 |   await expect(link).toHaveAttribute('target', '_self');
  6183 | 
  6184 |   await link.click();
  6185 |   await linkButton.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  6186 |   await linkButton.click();
  6187 |   await expect(page.getByLabel('Link URL')).toHaveValue('https://www.example.com');
  6188 |   await expect(page.getByRole('link', { name: 'Open current link' })).toHaveAttribute('href', 'https://www.example.com');
  6189 |   await page.getByLabel('Link URL').fill('/internal');
  6190 |   await page.getByRole('button', { name: 'Save link' }).click();
  6191 |   await expect(link).toHaveAttribute('href', '/internal');
  6192 |   await page.getByRole('button', { name: 'Remove link' }).click();
  6193 |   await expect(editor.getByRole('link')).toHaveCount(0);
  6194 | });
  6195 | 
  6196 | test('toggles a selected block through the public React list controls', async ({ page }) => {
  6197 |   await page.goto('/');
  6198 |   const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  6199 |   const paragraph = editor.locator('[data-fountain-node="paragraph"]').first();
  6200 |   const text = await paragraph.textContent();
  6201 |   await paragraph.click();
  6202 |   await page.keyboard.press('Home');
  6203 |   await page.keyboard.press('Shift+End');
> 6204 |   await page.getByRole('button', { name: 'Bullet list' }).click();
       |                                                           ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Bullet list' }) resolved to 2 elements:
  6205 |   await expect(editor.locator('ul > li').first()).toHaveText(text ?? '');
  6206 |   await page.getByRole('button', { name: 'Bullet list' }).click();
  6207 |   await expect(editor.locator('ul > li').filter({ hasText: text ?? '' })).toHaveCount(0);
  6208 |   await expect(editor.locator('[data-fountain-node="paragraph"]').filter({ hasText: text ?? '' })).toHaveCount(1);
  6209 | });
  6210 | 
  6211 | test('edits code language and line numbers through the public React toolbar', async ({ page }) => {
  6212 |   await page.goto('/');
  6213 |   const block = page.locator('pre.fjs-code-block');
  6214 |   await expect(block).toBeVisible();
  6215 |   await expect(block).toHaveAttribute('data-language', 'typescript');
  6216 |   await expect(block.locator('.fjs-token--keyword').first()).toHaveText('const');
  6217 |   await block.click();
  6218 |   await page.getByRole('button', { name: 'Code block and language' }).click();
  6219 | 
  6220 |   const language = page.getByLabel('Code language');
  6221 |   await expect(language).toHaveValue('typescript');
  6222 |   await language.fill('js');
  6223 |   await page.getByLabel('Show code line numbers').uncheck();
  6224 |   await page.getByRole('button', { name: 'Apply' }).click();
  6225 | 
  6226 |   await expect(block).toHaveAttribute('data-language', 'javascript');
  6227 |   await expect(block).not.toHaveAttribute('data-fountain-code-lines');
  6228 | });
  6229 | 
  6230 | test('opens the searchable clipboard-history picker in the public React toolbar', async ({ page }, info) => {
  6231 |   await page.goto('/');
  6232 |   const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  6233 |   const paragraph = editor.locator('[data-fountain-node="paragraph"]').first();
  6234 |   await paragraph.evaluate((element) => {
  6235 |     const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  6236 |     const leaves: Text[] = [];
  6237 |     for (let current = walker.nextNode(); current; current = walker.nextNode()) leaves.push(current as Text);
  6238 |     const range = document.createRange();
  6239 |     range.setStart(leaves[0], 0);
  6240 |     range.setEnd(leaves.at(-1)!, leaves.at(-1)!.data.length);
  6241 |     const selection = getSelection();
  6242 |     selection?.removeAllRanges();
  6243 |     selection?.addRange(range);
  6244 |     document.dispatchEvent(new Event('selectionchange'));
  6245 |   });
  6246 |   await page.keyboard.press('ControlOrMeta+c');
  6247 |   const trigger = page.getByRole('button', { name: /Clipboard history/ });
  6248 |   await expect(trigger).toBeEnabled();
  6249 |   await trigger.focus();
  6250 |   await trigger.press('Enter');
  6251 | 
  6252 |   const picker = page.getByRole('dialog', { name: 'Clipboard history' });
  6253 |   const search = picker.getByLabel('Search clipboard history');
  6254 |   await expect(search).toBeFocused();
  6255 |   await search.press('Escape');
  6256 |   await expect(picker).toHaveCount(0);
  6257 |   await expect(trigger).toBeFocused();
  6258 | 
  6259 |   await editor.focus();
  6260 |   await paragraph.evaluate((element) => {
  6261 |     const range = document.createRange();
  6262 |     range.selectNodeContents(element);
  6263 |     range.collapse(false);
  6264 |     const selection = getSelection();
  6265 |     selection?.removeAllRanges();
  6266 |     selection?.addRange(range);
  6267 |     document.dispatchEvent(new Event('selectionchange'));
  6268 |   });
  6269 |   const original = await paragraph.textContent();
  6270 |   await page.keyboard.press('ControlOrMeta+Alt+v');
  6271 |   await expect(search).toBeFocused();
  6272 |   await expect(picker.getByText('Copied in this editor · stored in memory')).toBeVisible();
  6273 |   await expect(picker.locator('summary')).toContainText('the real npm package, not a picture');
  6274 |   await expect(picker.locator('summary')).toHaveAttribute('title', /the real npm package, not a picture/);
  6275 |   await search.fill('no match for this query');
  6276 |   await search.press('Enter');
  6277 |   await expect(search).toBeFocused();
  6278 |   await search.fill('real npm package');
  6279 |   await expect(picker.locator('[role="listitem"]')).toHaveCount(1);
  6280 |   await search.press('Enter');
  6281 |   await expect(picker).toHaveCount(0);
  6282 |   await expect(editor).toBeFocused();
  6283 |   await expect(paragraph).toHaveText(`${original}${original}`);
  6284 | 
  6285 |   const heading = editor.getByRole('heading', { name: 'Try FountainJS in this document.' });
  6286 |   await heading.evaluate((element) => {
  6287 |     const range = document.createRange();
  6288 |     range.selectNodeContents(element);
  6289 |     const selection = getSelection();
  6290 |     selection?.removeAllRanges();
  6291 |     selection?.addRange(range);
  6292 |     document.dispatchEvent(new Event('selectionchange'));
  6293 |   });
  6294 |   await page.keyboard.press('ControlOrMeta+c');
  6295 |   await trigger.press('Enter');
  6296 |   await expect(picker.getByRole('listitem')).toHaveCount(2);
  6297 |   await search.fill('Try FountainJS in this document');
  6298 |   const status = picker.getByRole('status');
  6299 |   await expect(status).toHaveText('1 matching copy');
  6300 |   await expect(status.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  6301 |   await picker.getByRole('button', { name: /Remove Try FountainJS/ }).press('Enter');
  6302 |   await expect(status).toHaveText('No matching copied text.');
  6303 |   await expect(search).toBeFocused();
  6304 |   await expect(search).toHaveValue('Try FountainJS in this document');
```