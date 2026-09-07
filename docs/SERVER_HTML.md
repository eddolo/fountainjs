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
  become an equivalent custom Fountain node. This is one aggregate note per
  import, not a node-by-node loss inventory; it contains no source payload.

Rule diagnostics are immutable and deduplicated by code, contribution, selector,
and reason, rather than repeated for every affected HTML element. They identify
the extension contribution without copying thrown exception text or stacks into
the report. A later rule may recover the same content, so a diagnostic is not
necessarily a lost node. Conversely, an empty report is **not** proof of lossless
HTML conversion: unsupported tags, attributes, CSS/layout, and some filtered
content still require broader conversion-loss accounting.

The public headless demo shows these messages for both Server HTML input and
opt-in Markdown HTML-block conversion. A count alone is not the explanation.

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
