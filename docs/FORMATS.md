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
text, link destinations and titles, visible link labels, and code-fence info
strings. Reference identifiers are the deliberate exception: matching uses
normalized source spelling before inline parsing, so `foo\!` is distinct from
`foo!` and `foo&amp;` is distinct from `foo&`. Character references remain
literal inside inline and block code. Backslash escapes
cover every ASCII punctuation character and take precedence over reference
decoding, so `\&copy;` remains the literal text `&copy;`. URL protocols are
validated after decoding, and canonical export escapes a literal reference-like
sequence so reparsing cannot silently change its meaning.

Links accept safe absolute, root/hash/dot-relative, path-relative, and
query-relative destinations. Bare destinations retain balanced parentheses;
angle destinations may contain parentheses; title delimiters must close
without an unescaped matching delimiter; and reference labels are bounded to
999 Unicode code points. Reference definitions inside fenced or indented code,
or in the middle of an ordinary paragraph, remain literal content rather than
silently changing links elsewhere in the document. Executable and protocol-
relative destinations remain blocked.

A reference label may span nonblank physical lines before `]:`; its internal
whitespace is normalized for matching, while unescaped nested brackets make
the candidate literal. The destination may continue on the next nonblank line,
and its optional quoted or parenthesized title may continue over further
nonblank lines. Escaped `[` and `]` characters are accepted in labels,
definition matching is
case-insensitive using locale-neutral Unicode 17 full case folding, and the
first valid definition wins. This includes expanding and compatibility folds
such as `ẞ`/`SS`, Greek final sigma, micro sign, and presentation ligatures;
the small generated exception table is pinned to the official Unicode data
rather than delegated to the host locale. A blank line always ends the
definition candidate, so title-looking prose after it is not consumed.
Backslash escapes and character references remain significant while matching;
after a reference resolves, its visible label is parsed as normal inline text.
Only spaces, tabs, and line endings are stripped or collapsed for identifier
matching; other Unicode space characters remain significant and can form a
non-empty label. Adjacent bracket groups honor full/collapsed-reference
precedence, and a shortcut reference is not recognized when a link label
immediately follows it—even when that following label has no definition.
The complete label/destination/title scan is bounded to 32 physical lines per candidate.
Definitions inside one or more blockquote levels are discovered without
letting fenced code or ordinary paragraph continuations inside that quote leak
into the global reference map.

Link recognition follows the documented CommonMark precedence for two subtle
cases: malformed inline destination syntax leaves the closing label available
for a matching shortcut reference, and an inner link suppresses an enclosing
link rather than producing nested anchors. Code spans are opaque during this
check, so link-looking code remains ordinary linked label text. Brackets inside
code spans, URI/email autolinks, and valid inline HTML constructs cannot close
the surrounding label or start a hidden reference link. Unknown inline HTML is
retained as inert readable text rather than interpreted or executed. Fountain's
safe-URL policy still wins after syntax recognition; an empty or blocked inline
destination cannot silently select a reference with the same label. An explicit
empty destination is represented as an empty link and round-trips as `[]()`;
blocked protocols remain literal. The empty exception is link-specific: images,
media, actions, and other URL-bearing attributes still require a destination.
Physical line endings remain visible while inline syntax is parsed, so neither
bare nor angle-bracket link destinations can become valid merely because the
visible Fountain document projects a soft break to a space. Only CommonMark's
ASCII spaces, tabs, and line endings separate a destination from its title;
Unicode whitespace such as a non-breaking space remains part of the destination.
Image descriptions may contain ordinary inline formatting, links, and nested
images. Import projects their plain textual content into `alt`, so Markdown
punctuation and nested destinations do not leak into accessibility metadata;
canonical export then emits that safe plain description.

GFM bare web autolinks recognize `www.`, `http://`, and `https://` only at an
allowed text boundary and only with a valid multi-segment domain. Trailing
punctuation, excess closing parentheses, entity-looking suffixes, and `<` are
kept outside the link according to the GFM path rules. A `www.` link receives
an `http://` destination, and every result still passes Fountain's safe-URL
policy. Bare email autolinks accept GFM's local-part characters and require a
multi-segment domain whose final character is alphanumeric; invalid plus,
hyphen, underscore, or escaped tails fail closed instead of linking a prefix.
Angle-bracket protocol autolinks support HTTP(S), `mailto:`, and `xmpp:` while
preserving the original visible protocol spelling. Fountain intentionally does
not make CommonMark's arbitrary or invented schemes clickable: the shared
safe-URL policy wins after syntax recognition, so `javascript:` and unknown
protocols remain inert literal text.

The default background highlight uses `==highlight==`. Foreground/background
colour, custom highlight values, font family, font size, and line height use a
deterministic `<span data-fountain-text-style="true">` form when ordinary
Markdown cannot express them. FountainJS parses that small generated subset in
both browsers and headless Node.js, preserves supported semantic marks nested
inside it, and validates every recovered style or link before it enters the
document. Other Markdown consumers still receive readable inline HTML.

GFM strikethrough accepts matching runs of either one or two tildes. A blank
line ends the candidate span, and a run of three or more tildes stays literal,
matching the GFM 0.29 extension examples. Canonical export uses the broadly
interoperable two-tilde form. Code spans, autolinks, inline HTML, and links bind
more tightly during delimiter search; when a continuous strike crosses those
node boundaries, lossless semantic HTML preserves the exact mark order.

Emphasis supports star and underscore delimiters, double-underscore strong,
and triple-delimiter combined strong emphasis. Unicode-aware opening flanking
keeps intraword underscores and runs followed by whitespace literal. Canonical
emphasis export uses stars so an emphasized segment between word characters
does not turn into a forbidden intraword underscore on re-import. Full
delimiter-stack conformance remains outside the currently claimed subset.
The supported subset does apply CommonMark's rule-of-three arithmetic to
ambiguous delimiter runs, including compact nested forms such as
`*foo**bar**baz*`, and gives the earlier span precedence when unlike emphasis
markers overlap—even when the competing same-marker opener is inside a nested
unlike strong span. Ordinary strong/emphasis nesting is supported, and links,
code, autolinks, and inline HTML group more tightly during delimiter search. If a
continuous mark is split across adjacent Fountain text nodes, or includes
edge whitespace that independent Markdown delimiters cannot preserve safely,
canonical export uses the same inert `data-fountain-text-style` span used by
lossless text styles. Reference-style links remain reference-style around that
span, and Fountain re-imports the exact mark order.
Uneven opening and closing runs consume only the delimiter characters required
for the chosen mark. Surplus stars or underscores remain literal outside the
formatted span, including when canonical export must escape an adjacent marker.
Delimiter characters shared by nested marks are assigned in parse order, so
compact forms can create repeated emphasis or arbitrarily nested strong marks.
When nested identical marks have no unambiguous Markdown serialization,
canonical export uses the inert semantic span and re-imports every mark level.
Nesting can continue through soft line breaks and link labels. If an outer mark
wraps a link that itself contains another mark, semantic export keeps the link
at its original position in the mark stack; only an outermost link can retain
the requested inline/reference Markdown form around a fallback span.

Inline destinations preserve optional titles. Full (`[text][id]`), collapsed
(`[id][]`), and shortcut (`[id]`) reference links and reference images resolve
case-insensitively. Unsafe destination protocols are never turned into links or
images. An explicit HTML `<a href="">` also remains a link, while an anchor
without an `href` is ordinary inline content. Export can emit ordinary inline links or deterministic, deduplicated
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

## Clipboard formats

The DOM editor does not confuse persistence with interoperability. Copy/cut
writes an exact, versioned Fountain document flavor for another compatible
Fountain schema, semantic HTML for an unrelated rich editor, and readable text
for terminals, textareas, and other text-only destinations. The clipboard text
projection additionally represents lists, quotes, and table boundaries because
human paste readability has different requirements from search indexing.

The exact flavor is accepted only after the receiving schema reconstructs and
validates it. A missing custom extension or rejected attribute falls back to the
HTML/text flavors. Context-sensitive document invariants still run after paste;
for example, an installed stable-ID extension may repair an ID duplicated inside
the receiving document. HTML is best-effort across destination applications: a target
may deliberately strip styles, media, attributes, or unsupported tags. Comment
threads, collaboration awareness, versions, upload tasks, and host-owned records
are outside all document clipboard formats. Use application-level export/import
when those objects must travel together.

## Security boundary

Treat imported content and AI output as untrusted. The included AI controller only accepts replacement text, and the HTML exporter escapes document data. The default media module denies arbitrary iframes and validates playback, track, file, sandbox, and permission attributes; a custom embed resolver and every upload adapter remain trusted application code. Hosts must enforce their own storage authorization, content-type verification, malware scanning, and retention policies.
