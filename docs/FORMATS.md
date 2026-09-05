# Format boundaries

FountainJS keeps one typed document tree and treats external formats as boundaries. Presentation HTML is not the application state.

## JSON

JSON is the lossless persistence format. Nodes use stable type names, optional attributes, child content, and marks. Always import through the receiving `Schema`; unknown types and invalid attributes are rejected.

## HTML

`HTMLExporter` produces a full responsive document or a fragment. Text and attributes are escaped. Only approved protocols survive link and media serialization. Alignment, foreground/background colour, font family, font size, line height, subscript, superscript, semantic hard breaks, tasks, tables, images, native audio/video with tracks, downloadable file metadata, and provider-approved embeds retain their HTML meaning.

`HTMLImporter` supports headings, paragraphs, quotes, preformatted code, ordered/bullet/task lists, images and figures, audio, video, files, approved embeds, tables, dividers, line breaks, common inline marks, and optional math, mention, and emoji nodes when their receiving schema includes the corresponding extension. Media is reconstructed through schema validation: an iframe is discarded unless the configured `MediaExtension` recognizes its canonical HTTPS provider URL and accepts every permission/sandbox attribute. Math HTML stores TeX separately from its computed accessible label, so import does not persist renderer markup or mutate JSON. Mention identity and safe links round-trip through typed data attributes. Emoji name, Unicode value, and safe fallback metadata likewise round-trip; raw Unicode emoji in ordinary imported text becomes an emoji node when that schema supports it. This root importer uses the browser's `DOMParser`.

Pure Node.js uses the isolated `fountainjs-editor/html/server` entry. Its
`ServerHTMLImporter` reconstructs the same supported semantic tree without
`window`, `document`, `DOMParser`, jsdom, or another fake DOM. It adds bounded
input/tree policies plus diagnostics for parser recovery, invalid selectors,
and extension callbacks that genuinely require `HTMLElement`. The optional
parser/selector payload does not enter the root or browser bundles. See
[SERVER_HTML.md](SERVER_HTML.md).

Custom nodes and marks own their cross-runtime HTML import contract through
ordered `parseHTML` rules on `NodeSpec` / `MarkSpec`. A rule supplies a CSS `tag`
selector, optional `priority`, optional `getAttrs(element)`, and an optional
`contentElement` selector for wrapped content. Return `false` to decline a
match. Exceptions, malformed selectors, invalid attributes, and content that
does not satisfy the node's schema are contained; normal readable fallback
parsing continues. The complete imported document passes `schema.validate()`
before it is returned. `HTMLParseElement` deliberately exposes attributes,
dataset, normalized inline style, text, and tag name—not layout, events,
selection, or live DOM identity. Existing browser-only `parseDOM` rules remain
supported by `HTMLImporter`; the server importer reports a matching
`getAttrs(HTMLElement)` callback instead of impersonating the DOM.

```ts
const callout = {
  group: 'block',
  content: 'block+',
  attrs: { tone: { default: 'info' } },
  parseHTML: [{
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
external inline CSS for bold, italic, underline, strike, foreground and
background colour, font family, font size, and line height is normalized into
typed marks, and link title/target metadata is preserved. Style values pass the
same bounded validators used by commands and JSON import. HTML mark-wrapper
order is presentation-only; the set, types, and attributes of marks round-trip,
while JSON remains the byte-stable source of truth.

## Markdown

The Markdown boundary supports headings, paragraphs, recursive blockquotes,
fenced code, variable-delimiter code spans with standard whitespace
normalization, tight and loose nested lists, aligned pipe tables, block and
inline images, dividers, links, strong/emphasis/strike/code marks, highlight
extension syntax, `$...$`/`$$...$$` math when `MathExtension` is present, and
standard `[^id]` references plus indented multi-block definitions when
`PagesExtension` is present. Footnote IDs remain stable while visible numbers
are derived from first-reference order. Pipe tables
retain left/centre/right column alignment, do not split escaped pipes, and pad
short rows to the header width. Imported documents are validated against the
complete receiving schema before they are returned.

Semicolon-terminated HTML5 named and numeric character references decode in
text, link destinations and titles, reference labels, and code-fence info
strings. They remain literal inside inline and block code. Backslash escapes
cover every ASCII punctuation character and take precedence over reference
decoding, so `\&copy;` remains the literal text `&copy;`. URL protocols are
validated after decoding, and canonical export escapes a literal reference-like
sequence so reparsing cannot silently change its meaning.

Links accept safe absolute, root/hash/dot-relative, path-relative, and
query-relative destinations. Bare destinations retain balanced parentheses;
angle destinations may contain parentheses; title delimiters must close
without an unescaped matching delimiter; and reference labels are bounded to
999 source characters. Reference definitions inside fenced or indented code,
or in the middle of an ordinary paragraph, remain literal content rather than
silently changing links elsewhere in the document. Executable and protocol-
relative destinations remain blocked.

The default background highlight uses `==highlight==`. Foreground/background
colour, custom highlight values, font family, font size, and line height use a
deterministic `<span data-fountain-text-style="true">` form when ordinary
Markdown cannot express them. FountainJS parses that small generated subset in
both browsers and headless Node.js, preserves supported semantic marks nested
inside it, and validates every recovered style or link before it enters the
document. Other Markdown consumers still receive readable inline HTML.

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
non-default image layout, and typed media metadata.
An `onLoss` callback is observational: its exception is contained and cannot
break otherwise valid serialization. `MarkdownExporter.export(...)` remains
the convenient string-only API and accepts the same options.

For a raw/visual workflow, `MarkdownImporter.parseWithSource(...)` separates a
strict leading `---` frontmatter block from the document body without parsing
or executing YAML. It records the exact source, original line endings, and
frontmatter prefix in an immutable `MarkdownSourceSnapshot`.
`MarkdownExporter.exportWithSource(...)` returns the original source string
exactly while the parsed document is unchanged. After a visual edit it
retains recognized frontmatter exactly and exports the changed body in
canonical Markdown. The returned `preservation` value is `exact`,
`blocks`, `mapped-blocks`, `frontmatter`, or `canonical`, so a host never has
to infer what happened. `blocks` means position-aligned unchanged regions and
their separators remained exact. `mapped-blocks` means uniquely equal regions
survived insertion, deletion, or movement with canonical inter-block spacing.

```ts
const imported = MarkdownImporter.parseWithSource(rawMarkdown, schema)

// Exact until the parsed model changes.
const unchanged = MarkdownExporter.exportWithSource(
  imported.document,
  imported.source,
)

// After a visual edit, safe unchanged blocks and frontmatter stay exact.
const edited = MarkdownExporter.exportWithSource(
  editor.state,
  imported.source,
)
```

Source-block capture requires blank-line-delimited regions to independently
parse one-to-one to the complete top-level document. Ambiguous structures,
cross-block references, duplicate equal blocks, and changed reference
definitions remain canonical rather than being assigned by guesswork. Unique
blocks can be mapped through insertion, deletion, and movement. Capture is
bounded to 10,000 top-level regions. Unknown syntax inside a changed or
unmatched block is not retained. A source editor must reparse its new text to
establish a new snapshot. JSON remains the lossless structured persistence
format. The detailed contract, initial
standards-oriented corpus, and explicit non-conformance list are in
[MARKDOWN_SOURCE.md](MARKDOWN_SOURCE.md).

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
