# Server-native HTML conversion

`fountainjs-editor/html/server` converts untrusted HTML into the same validated
Fountain document model in plain Node.js. It does not read `window`, `document`,
`DOMParser`, `HTMLElement`, selection, layout, clipboard, or other browser APIs,
and it does not require jsdom or another fake DOM.

```ts
import { CoreSchemaSpec, HTMLExporter, Schema } from 'fountainjs-editor'
import { ServerHTMLImporter } from 'fountainjs-editor/html/server'

const schema = new Schema(CoreSchemaSpec)
const document = ServerHTMLImporter.parse('<h1>Hello</h1><p><strong>Server</strong> conversion.</p>', schema)

const json = document.toJSON()
const html = HTMLExporter.export(document, { document: false })
```

The entry is separately bundled in ESM and CommonJS. Its standards-oriented
HTML parser and selector engine are contained in that optional entry; importing
the editor root, React, Web Component, Yjs, or DOM view does not load them.

## What is preserved

For Markdown inline content, use the separate `parseInline(segments, schema)`
method (static or instance), or instance `parseInlineWithReport` for
`{ nodes, issues }`. Connect this to `MarkdownImportOptions.parseHTMLInline`.
It applies HTML scopes to protected original Fountain nodes rather than
serializing their content into HTML. If HTML recovery cannot preserve every
original node exactly once and in order, it throws; the Markdown importer then
retains its inert source interpretation and reports the fallback. Raw-text,
block, and foreign-content HTML inside an inline container currently require a
specialized adapter. Existing resource limits apply to the fragment including
protected slots. See the [inline adapter contract](MARKDOWN_SOURCE.md#optional-inline-html-formatting)
for local marks, source capture, default-off policy, and explicit loss warnings.

## Block HTML projection

The server importer reconstructs the same supported semantic outcomes as the
browser importer:

- paragraphs, headings, alignment, quotes, code, dividers, and hard breaks;
- strong, emphasis, underline, strike, code, subscript, superscript, links,
  foreground/background colour, font family, font size, and line height;
- ordered, bullet, nested, and task lists;
- rowspan/colspan tables and bounded column widths;
- multi-block table/header cells, nested tables, and footer-row content;
- safe block/inline images, audio, video, tracks, files, and provider-validated
  embeds when the receiving schema includes those nodes;
- math source, mentions, emoji metadata, ruby annotations, details, page
  breaks, footnotes, page templates, fields, and portable widgets;
- extension nodes and marks that declare a platform-neutral `parseHTML` rule.

Unmapped wrappers containing block descendants no longer flatten those
descendants into one paragraph. Both server import and browser paste retain
headings, separate paragraphs, lists, and tables through nested unfamiliar
wrappers, including inside quotes, list items, and table cells. Inline-only
wrappers stay inline. Explicit inline/block node rules still own their subtree;
an atomic preview is not unpacked merely because its HTML contains a paragraph.
This is structural fallback, not support for the original custom element's
application behavior, form submission, CSS, or attributes.

Every candidate still goes through normal attribute validators, whole-node
invariants, content expressions, and final `schema.validate()`. Unsupported or
executable markup is never retained as a hidden HTML blob. Readable descendants
fall back to ordinary Fountain content where possible.

HTML is an interoperability boundary, not the lossless persistence format.
Use validated Fountain JSON when arbitrary extension state, comments, tracked
changes, or application metadata must survive exactly.

Table-cell fidelity verification (2026-09-07): `pnpm check` passed 783 tests
plus package, headless/runtime, conformance, API, and performance gates. Six
Chromium/Firefox/WebKit checks cover structured-cell paste/Enter and exact
NBSP/narrow-NBSP/BOM retention. All eight recorded Markdown/HTML workflows
passed under `artifacts/manual-table-markdown-regression-20260907a/results/`.
The table workflow types and undoes/redoes inside a cell, creates a new
paragraph, copies the whole document through the actual browser clipboard,
reimports in the server-HTML demo, and pastes back into the live editor with
equal document JSON (apart from host-generated IDs). Rendered screenshots were
visually inspected, including the nested table and footer row.

## Portable extension rules

Use `parseHTML` when attribute extraction only needs tag name, text, attributes,
`data-*`, or inline style values:

```ts
const callout = {
  group: 'block',
  content: 'block+',
  attrs: { tone: { default: 'info' } },
  parseHTML: [{
    tag: 'aside[data-callout]',
    contentElement: ':scope > [data-callout-content]',
    getAttrs: element => ({ tone: element.dataset.tone ?? 'info' }),
  }],
  toDOM: node => ['aside',
    { 'data-callout': '', 'data-tone': node.attrs.tone },
    ['div', { 'data-callout-content': '' }, 0],
  ],
}
```

`HTMLParseElement` intentionally exposes only:

- `tagName` and `textContent`;
- `getAttribute(name)` and `hasAttribute(name)`;
- a read-only `dataset` map;
- a read-only normalized inline `style` map.

It has no layout, events, selection, mutation, or live DOM identity. The browser
`HTMLImporter` reads `parseHTML` too, so a portable extension normally needs one
rule definition. Existing `parseDOM` rules remain supported by the browser
importer for backward compatibility and for extensions that genuinely require
an `HTMLElement`.

The server importer can use a browser rule with no callback because its selector
and default attributes are declarative. If a matching `parseDOM` rule has a
browser-only `getAttrs(HTMLElement)`, it is skipped and reported rather than
being called with a partial DOM impersonation.

## Reports

Use `parseWithReport` when a conversion pipeline must account for parser
recovery, browser-only extension rules, or failed custom-rule projections:

```ts
const { document, issues } = ServerHTMLImporter.parseWithReport(source, schema)

for (const issue of issues) {
  console.warn(issue.code, issue.message, issue.selector)
}
```

Issue codes are:

- `html-parse-error`: the standards parser recovered from malformed source;
- `invalid-selector`: an extension supplied an invalid selector;
- `unsupported-dom-rule`: a matching extension rule required a real
  `HTMLElement` callback and did not provide `parseHTML`;
- `invalid-rule-result`: a matching custom rule threw, returned a non-plain
  attribute value, could not find its declared content element, or could not
  produce a schema-valid node/mark. Other rules and readable fallback content
  are still tried. An explicit `false` is an intentional decline and is not
  reported as an error; `null`/`undefined` retain their default-attribute meaning;
- `unmapped-block-wrapper`: an unrecognized block wrapper was discarded while
  importing its descendants. Its identity, attributes, and behavior did not
  become an equivalent custom Fountain node. Figure and table-caption projections
  give specific reasons in the same category. Notes aggregate by reason, not by
  source element; this is not a node-by-node inventory and contains no source payload;
- `unmapped-inline-element`: inline HTML without an accepted node/format mapping
  was removed while retaining its readable descendants. This includes empty
  custom media tags and formatting missing from the receiving schema;
- `discarded-html-comment`: parsed HTML comment nodes were omitted. This also
  covers constructs the HTML parser represents as bogus comments;
- `rejected-url`: the built-in link/image projection omitted an unsafe link URL
  or an image with a missing/unsafe source URL. Link text remains readable.
  The two messages identify link versus image loss without reproducing URLs;
- `inline-html-projection`: the opt-in Markdown inline adapter projected raw
  tokens into schema content. Its conservative compatibility note is separate
  from the specific losses above and is not a lossless-conversion assertion.

Rule diagnostics are immutable and deduplicated by code, contribution, selector,
and reason, rather than repeated for every affected HTML element. They identify
the extension contribution without copying thrown exception text or stacks into
the report. A later rule may recover the same content, so a diagnostic is not
necessarily a lost node. Conversely, an empty report is **not** proof of lossless
HTML conversion: unsupported tags, attributes, CSS/layout, and some filtered
content still require broader conversion-loss accounting.

Content candidates are evaluated lazily. An extension may accept block content
after rejecting an inline interpretation (or vice versa); diagnostics from
discarded content candidates are not reported as losses in the accepted
document. Actual losses inside the accepted candidate still propagate.
Comment, unknown-inline, and rejected-URL messages are aggregated by category,
so thousands of repeated elements do not produce thousands of diagnostic rows.
They never include source comment bodies, attribute values, or rejected URLs.

Applications can use these categories to decline conversion instead of accepting
the readable-content projection. For example, a `parseHTMLInline` callback may
call `parseInlineWithReport`, inspect `issues`, and return `null` if it sees
`unmapped-inline-element` or `rejected-url`. Markdown then retains the normal
inert interpretation and invokes `onHTMLInlineFallback`. The generic
`inline-html-projection` note alone does not identify a specific lost node, and
an empty set of the specific categories is not a lossless guarantee.

The public headless demo shows these messages for both Server HTML input and
opt-in Markdown HTML-block/inline conversion. A count alone is not the explanation.

Loss-report verification (2026-09-07): `pnpm check` passed **899 tests in 83
files**, including eight new pure-Node loss/accepted-branch cases and the
existing browser/server projection contracts. Nine sequential
Chromium/Firefox/WebKit checks passed in
`artifacts/browser-html-loss-report-20260907a/results/`. All fourteen recorded
workflows passed in `artifacts/manual-html-loss-report-20260907a/results/`;
screenshots 28 and 29 were visually inspected. The new workflow reviews specific
warnings, pastes the retained safe HTML through the native clipboard, edits it,
and verifies undo/redo. Registered extension content is not mislabeled as an
unmapped element, and 1,000 repetitions produce four aggregate loss messages,
not thousands of diagnostic rows.

The new reporting adds about 0.9 KiB ESM / 0.7 KiB CommonJS; measured aggregate
runtime is 1320.1/1101.7 KiB. The ESM aggregate cap is explicitly 1321 KiB; the
1102 KiB CommonJS cap, consumer-entry caps, and performance limits are unchanged.
No dependency or document-schema change was introduced. Remaining HTML losses
and raw-HTML conformance are still open, and no npm release is implied.

Wrapper/table verification (2026-09-07): the complete local gate passed 815
tests in 80 files, including pure-Node wrapper/depth checks, browser/server
projection parity, authoritative custom nodes, source snapshots, and GFM table
regressions. All eleven recorded Markdown/HTML workflows passed under
`artifacts/manual-html-wrappers-20260907b/results/`; the warning, edited wrapper
content, and one-column table/export screenshots were visually inspected.
The recording pastes the original unfamiliar HTML through the native clipboard,
not only HTML already normalized by the server importer. A pipe table with
nonstandard cell roles requires the explicit HTML-table option for exact
structural re-import; the loss note now explains that difference.

Aggregate bundled runtime measured 1312.7 KiB ESM / 1095.5 KiB CommonJS, about
0.8/0.7 KiB above the preceding checkpoint. The aggregate caps increased by
1 KiB each (1313/1096); individual entry and performance limits did not change,
and no dependency was added. This is local verification, not an npm release or
complete CommonMark/GFM conformance.

The final sequential Chromium/Firefox/WebKit run passed all nine targeted
contracts: unfamiliar-wrapper paste/editing, structured table-cell paste, and
the public Markdown/LaTeX/server-HTML pipeline. Evidence is under
`artifacts/browser-html-wrappers-final-20260907a/results/`.

The custom-rule diagnostic increment is covered by eight new Node-only
regressions (776 tests in the complete local gate). The combined change also
passed all seven recorded Markdown import/edit/paste/undo/export workflows;
videos, traces, and screenshots are under
`artifacts/manual-markdown-combined-20260907a/results/`. Representative rendered
empty-formatting and authored-spacing screenshots were visually inspected.

Parser recovery does not mean a recovered tree is trusted. The recovered result
must still satisfy the receiving Fountain schema or the import throws.

## Resource limits

Parsing is bounded before and after tree construction. Defaults are intentionally
conservative for request/worker use:

| Limit | Default | Hard maximum |
| --- | ---: | ---: |
| UTF-8 input | 1 MiB | 8 MiB |
| parsed nodes | 50,000 | 250,000 |
| nesting depth | 128 | 256 |
| attributes on one element | 100 | 256 |
| one attribute value | 64 KiB | 1 MiB |
| recorded parser errors | 25 | 100 |

```ts
const importer = new ServerHTMLImporter({
  maxInputBytes: 2 * 1024 * 1024,
  maxNodes: 100_000,
})

const document = importer.parse(source, schema)
```

An invalid limit throws `RangeError`; exceeded content throws
`HTMLImportLimitError` with the affected `limit` property. Limits are not a
substitute for HTTP body limits, worker timeouts, authentication, or request
rate controls.

The enforced production benchmark parses 10,000 representative paragraphs
(about 1.1 MiB and 60,000 source nodes) with an explicitly raised 2 MiB/100,000
node policy. The current development baseline is recorded in
[PERFORMANCE.md](PERFORMANCE.md); CI enforces absolute p95, near-linear growth,
and retained-document heap ceilings.

## Table caption content retention

The current table schema accepts rows, not a native caption child. Imported HTML
`caption` content is therefore retained as editable blocks immediately before
its table. Rich text, links, multiple paragraphs and authored empty paragraphs
survive; nested-table captions stay within their surrounding cell. A caption is
still retained when its table has no rows. Only direct captions are collected,
so a nested table's caption is not duplicated outside its cell.

The server report emits `unmapped-block-wrapper` with a caption-specific message:
caption association, placement and attributes were not preserved. This is not
native table-caption support and does not reproduce CSS `caption-side: bottom`.
It repairs silent content loss without altering table row indexing or schema.
The browser importer applies the same content projection on paste. Markdown's
optional HTML adapter retains original source independently of that projection;
canonical export preserves the resulting blocks, not the original caption tag.

## Figure content retention

A figure becomes a single media node only when it contains exactly one matching
direct media child, at most one plain-text caption, and no other significant
content. This preserves the existing simple image/audio/video/file/embed shape.
A canonical file preview with the same URL and generated alt label is recognized
as part of its attachment; a different image is retained as separate content.
Additional paragraphs, multiple images, tables, code, nested wrappers and rich
captions instead pass through ordinary block import in source order. If a media
URL is rejected, its caption is still processed rather than discarded with it.
Registered custom node rules remain authoritative over their own figure subtree.

`parseWithReport` emits `unmapped-block-wrapper` when this fallback loses the
figure grouping or wrapper attributes. Rich caption marks and links remain
editable paragraph content, not a flattened caption string. This is supported
content retention, not a lossless arbitrary-HTML contract. The browser importer
uses the same policy, including when HTML is pasted into an editor; Markdown
hosts can opt into it through `parseHTMLBlock`.

## Security and trust boundary

The importer is not a general HTML sanitizer that returns HTML. It projects
recognized semantics into a typed Fountain tree. Script/style execution, event
handlers, arbitrary iframes, unsafe URL protocols, unknown attributes, and
presentation-only DOM are not persisted by that model projection. The ordinary
`HTMLExporter` applies its own output restrictions when serializing the result.

Hosts still own upload scanning, remote fetch policy, embed provider policy,
document authorization, request size/time limits, and storage validation.

## Runtime status

Pure Node.js ESM and CommonJS execution is a permanent packed-package gate, and
browser/server semantic parity uses a shared fixture corpus. A second emitted-
bundle smoke test runs without browser globals in Node, Bun, and Deno. The same
conversion is bundled into an ES-module Worker and dispatched inside Cloudflare
`workerd` through Miniflare, so Worker compatibility is exercised by the real
runtime rather than inferred from a browser-like Node test. CI and the npm
release workflow repeat these checks. The implementation imports no Node
built-ins; only the test harness uses Node to start `workerd`.

The existing root `HTMLImporter` remains the browser implementation. Keeping the
server parser isolated avoids adding its parser payload to web editors and avoids
a synchronous breaking change. A product should choose the entry that matches
where conversion actually runs.
