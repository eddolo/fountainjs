# Format boundaries

FountainJS keeps one typed document tree and treats external formats as boundaries. Presentation HTML is not the application state.

## JSON

JSON is the lossless persistence format. Nodes use stable type names, optional attributes, child content, and marks. Always import through the receiving `Schema`; unknown types and invalid attributes are rejected.

## HTML

`HTMLExporter` produces a full responsive document or a fragment. Text and attributes are escaped. Only approved protocols survive link and media serialization. Alignment, text colour, subscript, superscript, semantic hard breaks, tasks, tables, images, native audio/video with tracks, downloadable file metadata, and provider-approved embeds retain their HTML meaning.

`HTMLImporter` supports headings, paragraphs, quotes, preformatted code, ordered/bullet/task lists, images and figures, audio, video, files, approved embeds, tables, dividers, line breaks, common inline marks, and optional math, mention, and emoji nodes when their receiving schema includes the corresponding extension. Media is reconstructed through schema validation: an iframe is discarded unless the configured `MediaExtension` recognizes its canonical HTTPS provider URL and accepts every permission/sandbox attribute. Math HTML stores TeX separately from its computed accessible label, so import does not persist renderer markup or mutate JSON. Mention identity and safe links round-trip through typed data attributes. Emoji name, Unicode value, and safe fallback metadata likewise round-trip; raw Unicode emoji in ordinary imported text becomes an emoji node when that schema supports it. The importer uses `DOMParser`, so a DOM shim is required in Node.js.

Custom nodes and marks own their HTML import contract through ordered
`parseDOM` rules on `NodeSpec` / `MarkSpec`. A rule supplies a CSS `tag`
selector, optional `priority`, optional `getAttrs(element)`, and an optional
`contentElement` selector for wrapped content. Return `false` to decline a
match. Exceptions, malformed selectors, invalid attributes, and content that
does not satisfy the node's schema are contained; normal readable fallback
parsing continues. The complete imported document passes `schema.validate()`
before it is returned.

```ts
const callout = {
  group: 'block',
  content: 'block+',
  attrs: { tone: { default: 'info' } },
  parseDOM: [{
    tag: 'aside[data-callout]',
    contentElement: '[data-callout-content]',
    getAttrs: element => ({ tone: element.dataset.tone ?? 'info' }),
  }],
  toDOM: node => ['aside',
    { 'data-callout': '', 'data-tone': node.attrs.tone },
    ['div', { 'data-callout-content': '' }, 0],
  ],
}
```

The same `toDOM` contract serializes extension-defined nodes and marks.
Generic extension output is restricted to non-executable semantic HTML tags;
event handlers, `srcdoc`, URL-bearing attributes with unsafe protocols,
dangerous CSS URL/expression forms, and malformed names are removed. Built-in
provider-approved embeds use their stricter dedicated serializer. Common
external inline CSS for bold, italic, underline, strike, text colour, and
highlight is normalized into typed marks, and link title/target metadata is
preserved. HTML mark-wrapper order is presentation-only; the set, types, and
attributes of marks round-trip, while JSON remains the byte-stable source of
truth.

## Markdown

The Markdown boundary supports headings, paragraphs, recursive blockquotes,
fenced code, tight and loose nested lists, aligned pipe tables, block and inline
images, dividers, links, strong/emphasis/strike/code marks, highlight extension
syntax, and `$...$`/`$$...$$` math when `MathExtension` is present. Pipe tables
retain left/centre/right column alignment, do not split escaped pipes, and pad
short rows to the header width. Imported documents are validated against the
complete receiving schema before they are returned.

Inline destinations preserve optional titles. Full (`[text][id]`), collapsed
(`[id][]`), and shortcut (`[id]`) reference links and reference images resolve
case-insensitively. Unsafe destination protocols are never turned into links or
images. Export can emit ordinary inline links or deterministic, deduplicated
reference definitions:

```ts
const document = MarkdownImporter.parse(source, schema)
const { markdown, losses } = MarkdownExporter.exportWithReport(document, {
  linkStyle: 'reference', // default: 'inline'
  onLoss: detail => telemetry.record('markdown-projection', detail),
})
```

Every loss entry has a `kind` (`node`, `mark`, or `attribute`), the affected
type, an immutable document `path`, and a human-readable `detail`. The report
records unsupported extension nodes/marks and built-in attributes Markdown
cannot reconstruct, including non-table alignment, merged-cell geometry,
custom highlight colours, non-default image layout, and typed media metadata.
An `onLoss` callback is observational: its exception is contained and cannot
break otherwise valid serialization. `MarkdownExporter.export(...)` remains
the convenient string-only API and accepts the same options.

Mentions and emoji export as their readable text projections; the report makes
the lost mention identity/kind and emoji fallback metadata explicit because
CommonMark has no portable typed representation for either. Raw Unicode emoji
imported into an emoji-enabled schema becomes an emoji node. Audio, video,
file, and embed nodes likewise export as readable destination links plus
optional caption text and produce a loss entry; re-import therefore produces
links, not media nodes. Use validated JSON or supported extension-aware HTML
when extension type and attributes must round-trip.

Lean source uses the ordinary `code_block` with `language: "lean"`, so JSON,
HTML, Markdown fenced code, and plain text remain portable even when no Lean
provider is configured. Provider descriptors and proof results are view/runtime
state and are never serialized with the document.

Markdown cannot represent every custom schema attribute. Inspect the loss
report at publishing boundaries and use JSON when lossless round-tripping is
required.

## Plain text

`TextExporter` joins block text with configurable separators. It intentionally discards marks and structure, but preserves math as its TeX source, mentions and emoji as readable inline text, and media as `[Audio: …]`, `[Video: …]`, `[File: …]`, or `[Embed: …]` projections. It is suitable for search indexing, previews, and explicit AI context.

## Security boundary

Treat imported content and AI output as untrusted. The included AI controller only accepts replacement text, and the HTML exporter escapes document data. The default media module denies arbitrary iframes and validates playback, track, file, sandbox, and permission attributes; a custom embed resolver and every upload adapter remain trusted application code. Hosts must enforce their own storage authorization, content-type verification, malware scanning, and retention policies.
