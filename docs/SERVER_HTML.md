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
- safe block/inline images, audio, video, tracks, files, and provider-validated
  embeds when the receiving schema includes those nodes;
- math source, mentions, emoji metadata, ruby annotations, details, page
  breaks, footnotes, page templates, fields, and portable widgets;
- extension nodes and marks that declare a platform-neutral `parseHTML` rule.

Every candidate still goes through normal attribute validators, whole-node
invariants, content expressions, and final `schema.validate()`. Unsupported or
executable markup is never retained as a hidden HTML blob. Readable descendants
fall back to ordinary Fountain content where possible.

HTML is an interoperability boundary, not the lossless persistence format.
Use validated Fountain JSON when arbitrary extension state, comments, tracked
changes, or application metadata must survive exactly.

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
recovery or browser-only extension rules:

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
  `HTMLElement` callback and did not provide `parseHTML`.

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
browser/server semantic parity uses a shared fixture corpus. The implementation
has no Node built-in imports and is designed to remain compatible with Bun,
Deno, and standards-based worker runtimes, but those runtimes are not claimed
as certified until dedicated CI jobs execute the packed entry in each one.

The existing root `HTMLImporter` remains the browser implementation. Keeping the
server parser isolated avoids adding its parser payload to web editors and avoids
a synchronous breaking change. A product should choose the entry that matches
where conversion actually runs.
