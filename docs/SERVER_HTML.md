# Server-native HTML conversion

## Registered inert wrappers and saved empty paragraphs

Unreleased, 2026-10-06: the separate `fountainjs-editor/html/inert` entry supplies
`createInertHTMLBlockExtension({ tags })` for explicitly owned unknown wrappers.
It uses existing schema parse/serialize rules and retains supported block
children plus bounded inert attributes/tokens, never original HTML execution,
handlers or layout. `appendInertHTMLBlockParagraph(editor, path)` makes authoring
inside a preserved empty wrapper explicit and undoable. It is DOM-free; the host
view restores the caret with `view.focus()`. See
[the complete source/security/reader contract](HTML_INERT_SOURCE.md#registered-block-wrappers).

Canonical saved empty paragraphs now have explicit Markdown source context and
use the existing offset-bound protected block slots during document-wide recovery.
The previous unsupported-source fallback is reproduced and fixed; implicit
container caret fillers retain their old behavior. Packed ESM/CJS and actual
Node/workerd fixtures include wrapper authoring, history, native/canonical
reopening and a trailing empty paragraph. Native JSON remains exact; adjacent
unmarked text leaves can still canonicalize in HTML/Markdown. A follow-up now
preserves genuinely childless paragraph shape with `data-fountain-empty="block"`
in fragment and document HTML, including nested Markdown HTML carriers. Both
importers require a source element with no child nodes before restoring that
shape; forged markers never suppress text/media/comments/whitespace/elements.
Ordinary empty paragraphs keep their normal caret leaf.
Follow-up final gate: `artifacts/html-empty-paragraph-complete-gate-verified-20261006.log`
passes 2,618 tests / 196 files, packed ESM/CJS and pure Node/workerd fixtures.
The recorded pointer/keyboard and visual evidence is in
`artifacts/html-empty-paragraph-visual-verification-20261006.json`.
Previous block gate: `artifacts/html-inert-block-complete-gate-final-20261006.log`.

## Link destination policy

Unreleased, 2026-10-06: supported TAB/LF/CR destination data is percent-encoded
only after validating its browser-compacted spelling. Unsafe schemes/network
paths, ambiguous HTTP authorities, other controls and schema-over-limit expansion
remain unlinked. With the supplied link schema, optional `link.attrs.htmlHref`
retains bounded inert source intent alongside encoded typed data. Rendering uses
that source only if it still reproduces stored `href`, preserving HTML browser
navigation separately from literal Markdown links. `normalized-link-url`
describes this projection. A custom schema without that optional attribute gets
an explicit warning that original navigation behavior is not retained.
Messages never echo the potentially private URL. `invalid-rule-result` reports
a normalized destination rejected by the declared schema.

Native literal backslashes render encoded outside ambiguous HTTP authorities.
A bounded, safe `data-fountain-link-href` carrier restores original model data
only when its rendering equals the visible href exactly. Invalid carriers are
ignored with a source-free `invalid-rule-result` issue. External raw HTML links
with backslashes retain source-bound HTML navigation where the schema supports
it. `data-fountain-html-href` is separately validated against visible href;
both carrier kinds present together, unsafe/stale values or oversized metadata
are ignored and reported. Manual URL editing clears HTML-origin metadata.
The shared persisted URL safety gate is not weakened. Browser and pure-server
import agree on the complete native document.

This private carrier is not an extension installation or executable behavior.
See [the exact fidelity limits and corrected oracle](MARKDOWN_DOCUMENT_FLOW.md#link-destination-integrity-and-oracle-correction).

Unreleased: optional `sourceTokens: true` exposes immutable tag-boundary tokens
to portable schema rules. It is off by default, distinguishes direct HTML from
reconstructed Markdown input, and exposes no file offsets. The isolated
`fountainjs-editor/html/inert` factory can retain explicitly registered unknown
inline tags as safe data plus editable children, never their original behavior
or layout. See [the contract and public workshop](HTML_INERT_SOURCE.md).

That entry also provides a separate, explicit script/style/textarea source
factory. These become literal code data in safe carriers, not live HTML.
`code: true`, `text*` rules keep Unicode text without emoji conversion while
retaining representable display marks. HTML normalization and head/body
placement still apply; source capture does not erase those distinctions.

The optional Markdown whole-document source route now preserves syntax-derived
block images and dividers inside supported HTML sections/lists/quotes. Original
nodes and complete attributes remain protected by source offsets and visit
order; no image URL or metadata is reconstructed from a temporary HTML tag.
Unrepresentable image links/formatting, preformatted flattening and unsupported
block syntax refuse the entire conversion instead of silently losing data.
Compiled ESM/CommonJS and real workerd exercise full canonical/native reopening
without a DOM shim. See [the source-flow contract](MARKDOWN_DOCUMENT_FLOW.md#protected-markdown-block-atoms-2026-10-05).

Pristine pipe tables also survive this optional source route. Parser-derived
cell syntax, document references and alignment validate the original complete
subtree; protected source offsets keep it outside HTML re-parsing. Supported
outer marks can apply to cell text. Flattening/active contexts and changed
projections still refuse conversion. This is not CommonMark-table support or
pixel-equivalent layout. See [the table contract](MARKDOWN_DOCUMENT_FLOW.md#protected-markdown-tables-2026-10-05).

With explicit `HTMLFlowExtension` opt-in, anonymous inline runs can be retained
as `html_flow` instead of an invented paragraph. Authored `<p>` elements remain
paragraphs; cell paragraph attributes remain authoritative. Normal HTML whitespace
applies to the flow's DOM view, and native HTML emits its inline content. The
Markdown canonical carrier accepts only its identifying attribute and the
strict inert `data-fountain-empty-text="true"` marker for a cleared unmarked
caret leaf. That leaf and a genuinely childless flow remain distinct on canonical
reopening. The marker is not an ordinary paragraph normalization rule, and
completely empty native HTML is a reader projection, not a model backup.
Without this schema,
the prior paragraph fallback and `formatted-whitespace-block` report are unchanged.
Supported imports are still subject to the existing schema and resource checks.
See [the contract](MARKDOWN_DOCUMENT_FLOW.md#optional-anonymous-inline-flow-2026-10-05-unreleased).

`HTMLCommentExtension` is an explicit schema opt-in for inert comment source data.
Supported comments survive browser/server HTML conversion as `html_comment`
inline atoms. Editor badges are author controls; exported HTML contains native
comments. Unsupported comment data or containing projections still receive the
located, category-bounded `discarded-html-comment` report, in the existing tree-
diagnostic phase. Hidden comments are not private; remove sensitive data before
sharing. See [the Markdown contract](MARKDOWN_DOCUMENT_FLOW.md#optional-inert-html-comments-2026-10-05-unreleased)
for safe serialization limits, canonical envelopes and the separate 611/652 profile.

Standalone Fountain HTML exports retain physical `pageSettings` in a validated,
inert `data-fountain-page-settings` attribute on the document body. Browser
`HTMLImporter.parse` and `ServerHTMLImporter.parse` restore the supported point
values, including explicit zero and negative top/bottom margins. This does not
apply page CSS, reproduce native pagination or retain arbitrary root metadata.
Only body metadata is accepted; nested blocks/head attributes are ignored.
`document: false` exports and fragment/clipboard imports omit document settings.
The server reports `invalid-page-settings` for malformed, invalid or oversized
(over 2,048 characters) values without removing visible text. Document-shell
omission reports still cover unrelated head/styles/attributes. Use Fountain JSON
when the complete Fountain document model must be retained.

`fountainjs-editor/html/server` converts untrusted HTML into the same validated
Fountain document model in plain Node.js. It does not read `window`, `document`,
`DOMParser`, `HTMLElement`, selection, layout, clipboard, or other browser APIs,
and it does not require jsdom or another fake DOM.

The core schema now includes [definition-list term/description nodes](DEFINITION_LISTS.md).
Valid `dl` entries retain their structural boundaries, nested content and order;
grouping-wrapper removal remains an explicit report rather than a lossless claim.

For mixed Markdown/HTML, `parseFlow` retains protected block identities.
The separate experimental `parseParagraphFlow` / `parseParagraphFlowWithReport`
methods explicitly reproject pristine text-only paragraph source across HTML
boundaries. They require the Markdown callback context and refuse custom block
data, changed content and unsupported structural nodes. See the
[contract, losses and demo option](MARKDOWN_SOURCE.md#explicit-paragraph-source-flow-recovery)
before choosing that mode; it is not a lossless substitute for `parseFlow`.
`parseTextBlockFlow` / `parseTextBlockFlowWithReport` extend explicit source
projection to pristine headings and fenced/indented code. Recursive source
context also supports list/quote nesting, preserves inline objects outside
preformatted text, and verifies whole task subtrees. Custom Markdown block
metadata and projections that would flatten protected data still decline. See the
[text-block policy](MARKDOWN_SOURCE.md#explicit-text-block-source-flow-recovery)
for generated newlines, identity changes and remaining fidelity gaps.

Registered HTML wrappers use the supplied schema's `parseHTML` and `toDOM`
rules; they need not be flattened just because the default schema has no matching
node. Source recovery now commits hard-break visit evidence only from accepted
content-shape/rule candidates. Rejected speculative projections cannot make a
valid custom section falsely fail the duplicate-break guard. Actual missing or
reordered source nodes/breaks still fail. See the
[registered-wrapper example](MARKDOWN_SOURCE.md#register-html-wrappers-your-application-owns).

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

`parse` / `parseWithReport` parse a **complete HTML document** and project its
body, matching the browser importer's detached `DOMParser` contract. A full
`HTMLExporter.export(doc)` page can therefore reopen without its `<title>` or
head stylesheet becoming an editable paragraph. The parser handles implied
head/body boundaries, comments and HTML recovery rather than stripping tags
with regular expressions. Detached document parsing uses scripting-disabled
`noscript` interpretation. This does not execute scripts or fetch resources.

`document-shell-omitted` reports discarded head elements, document-shell
attributes or non-body framesets. Page metadata, stylesheets, document-level
language/direction and original layout are not retained. Doctype omission in
ordinary pasted snippets is not reported as an error. Whole-input tree limits
still apply, including ignored head content and the parser's implicit html/head/
body nodes. Use JSON for persistence, not HTML for full source retention.

`parseFragment` / `parseFragmentWithReport` deliberately keep their existing
fragment interpretation for Markdown adapters; they are not full-page readers.
The distinction follows parse5's [document parser](https://parse5.js.org/functions/parse5.parse.html)
and [scripting option](https://parse5.js.org/interfaces/parse5.ParserOptions.html).

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

For a Markdown paragraph containing block tags, the separate experimental
`parseParagraph(segments, schema, context?)` / `parseParagraphWithReport` methods can
return multiple blocks. Connect them to `parseHTMLParagraph`, not
`parseHTMLInline`. Original inline nodes remain protected through HTML paragraph
recovery. The same limits and schema/URL policies apply. Forward the paragraph
context for tight-list wrappers and segment `softBreak`/`textRun` metadata for closed,
text-only preformatted scopes. Those scopes restore physical LF, apply HTML
newline rules across continuous text runs, respect raw/Markdown tag boundaries,
and report plain-text code export semantics. Text attributes/marks
remain in the model; atoms and cross-paragraph/active raw-text scopes still fall
back explicitly. See the
[paragraph recovery contract](MARKDOWN_SOURCE.md#experimental-paragraph-html-recovery).

Supported inline formatting now survives block boundaries in both importers:
for example, `<strong><p>One</p><p>Two</p></strong>` keeps both paragraphs bold.
The same mark rules cover block styles, list items, table row groups, rows and
cells. A nearer explicit supported color/style value wins over an outer mark
of the same type, and formatting does not leak into unrelated siblings.
Native block attributes and structure remain in the Fountain model; no HTML
serialization/reparse is used to transfer marks onto protected Markdown nodes.

This is semantic formatting inheritance, not a browser CSS engine. External
stylesheets, arbitrary layout, selector cascades, and CSS reset values such as
`font-weight:normal` inside a bold scope are not fully modeled. Conversion-loss
reports and the existing raw-HTML fallback contracts still apply. Built-in
typography rules use one portable rule object for both `parseHTML` and `parseDOM`;
the server does not retry that identical rule as a DOM-only callback. Distinct
browser-only rules continue to be reported rather than executed.

Regression coverage: `tests/html-block-mark-inheritance.test.ts`, pure-Node
cases in `tests/server-html.test.ts`, and the real-editor
`tests/browser/html-block-format-journey.ts`. The latter compares rendered
formatting before import, after paste, after editing/undo, and after Markdown
download/reopen in a separate reader. It tests an HTML clipboard payload, not
OS clipboard permissions or arbitrary external-editor interoperability.

The server importer reconstructs the same supported semantic outcomes as the
browser importer:

- paragraphs, headings, alignment, quotes, code, dividers, and hard breaks;
- strong, emphasis, underline, strike, code, subscript, superscript, links,
  foreground/background colour, font family, font size, and line height;
- ordered, bullet, nested, and task lists;
- rowspan/colspan tables and bounded column widths;
- `rowspan="0"` resolved to an explicit span over the remaining rows of its
  source row group, including nested tables and spans starting partway through
  a group; the browser importer uses the same integer/counting helpers;
- multi-block table/header cells, nested tables, and footer-row content;
- safe block/inline images, audio, video, tracks, files, and provider-validated
  embeds when the receiving schema includes those nodes;
- math source, mentions, emoji metadata, ruby annotations, details, page
  breaks, footnotes, page templates, fields, and portable widgets;
- extension nodes and marks that declare a platform-neutral `parseHTML` rule.

Direction retention has two distinct scopes. The supplied schemas now retain
structural `dir` on lists/items, task lists/items, quotes, definition lists and
entries, tables/rows/cells. Children inherit the retained context without
copied direction attributes; explicit child overrides remain independent when
an author changes the parent. Shared `auto` contexts are retained rather than
guessed separately for every paragraph. Unsupported wrappers can still project
fixed direction, but flattened automatic contexts are not reconstructed.

Older/custom schemas without structural direction still get the explicit
`block-html-projection` warning; retained paragraph direction alone is not
proof of preserved markers, column ordering or decorations. Accepted custom
`parseHTML` rules remain authoritative. The browser importer has no report API;
the conversion lab uses this server adapter and shows its warnings.

Recorded desktop checks compare a separate native source, real conversion-lab
editing and the actual downloaded HTML in a separate reader. Logical quote
decoration and table column flow are now retained. Physical horizontal
cell-range keys and resize gestures use the table's direction, including a
merged cell with an independent LTR text override. Source order is never
reversed in the document. Broader bidi/inline isolation, native mobile typing,
direction-aware insertion/reordering controls and native Word fidelity remain
separate outstanding work, not implied by this fixture.
See [W3C's structural direction guidance](https://www.w3.org/International/questions/qa-html-dir.en.html).

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

## Table span import contract

Both importers order rows using the [native table row collection contract](https://html.spec.whatwg.org/multipage/tables.html#dom-table-rows):
header rows first, body/direct rows next, footer rows last, preserving order
within each category. This prevents an early footer or late header in incoming
markup from appearing in the wrong position after paste. The server reports
when that order differs from source order. This is structural/default table
ordering, not computed-CSS fidelity or retention of repeating print sections.
If a Markdown HTML flow would have to reorder protected Markdown blocks to
achieve it, that flow still declines with its original content retained.

The [HTML zero-rowspan rule](https://html.spec.whatwg.org/multipage/tables.html#attr-tdth-rowspan)
is resolved against the source row group before its rows enter Fountain's flat
table model. Missing/invalid attributes default to one; integer prefixes follow
HTML parsing rules, not JavaScript numeric syntax. Nested-table rows never
contribute to a parent table's span. Counting is linear in the number of rows.

`parseWithReport` reports zero-span expansion as `block-html-projection`: it is
a snapshot converted to an explicit span, not a retained live row-group rule.
The existing schema limit remains 100 rows/columns per cell span. Values above
that limit are clamped and now explicitly reported as potential geometry loss.
Row-group identity, header/footer layout behavior and unsupported attributes are
not generally preserved merely because the span is correct. This does not claim
arbitrary HTML table fidelity.

## Ordered-list numbering contract

Browser and server import share HTML signed-integer-prefix parsing for `ol`
starts, within the native reflected signed 32-bit range. This follows the
[HTML integer rules](https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#rules-for-parsing-integers),
not JavaScript numeric syntax: `3e2` starts at 3, `0x10` at 0, and ASCII
whitespace plus `+0tail` at 0. Missing, invalid and out-of-range values use 1;
arbitrarily long numeric attributes cannot inject Infinity into schema validation.

The supplied list schema supports ascending, non-negative decimal starts.
Negative starts normalize to 1. `parseWithReport` explicitly warns when negative
starts, `reversed`, non-decimal `type`, or direct `li[value]` numbering is not
retained. These remain capability gaps, not lossless conversions. Nested lists
are checked independently; arbitrary CSS counters are outside this contract.
An explicit adapter can supply a richer schema/projection through extension
rules. HTML export/reimport preserves supported starts; lifting or converting
part of a zero-based list keeps the remaining slices' original numbers.

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

`parseFlow` / `parseFlowWithReport` accept interleaved raw HTML blocks and
already-parsed Fountain block objects. They resolve HTML containers across
Markdown blank-line boundaries without serializing the original blocks as HTML.
`parseFlow` is available as a static convenience; instance methods share the
importer's configured limits. Protected blocks must survive exactly once in
order, allowing immutable copies of paths receiving inherited marks. Original
inline marks win over surrounding HTML; nested HTML scopes use the innermost
mark of each type. Source, attributes and node IDs remain intact. Unsupported
raw-text scopes and consuming custom rules are
refused, not silently approximated. See [Markdown flow conversion](MARKDOWN_SOURCE.md#html-scopes-across-multiple-blocks).

For content inserted into an existing document, use `parseFragment` or
`parseFragmentWithReport` (static or instance methods). These return a readonly
array of validated block nodes rather than a top-level document. Without the
optional comment schema, a comment-only fragment returns no nodes and reports
the omitted comment; it does not manufacture
an editable blank paragraph. Explicit empty paragraphs remain present. Input
bounds, URL policy and conversion-loss categories are shared with whole-document
import. `parse` / `parseWithReport` retain their existing empty-document caret
paragraph and root-schema validation.

```ts
const { nodes, issues } = ServerHTMLImporter.parseFragmentWithReport(source, schema)
// Insert using the receiving editor's normal schema-validated transaction.
// An empty array is a successful empty projection, not a conversion failure.
```

Use `parseWithReport` when a conversion pipeline must account for parser
recovery, browser-only extension rules, or failed custom-rule projections:

```ts
const { document, issues } = ServerHTMLImporter.parseWithReport(source, schema)

for (const issue of issues) {
  console.warn(issue.code, issue.message, issue.selector)
}
```

Issue codes are:

- `block-html-projection`: optional stream-level HTML projection completed;
  unsupported grouping, attributes/layout and comments may be lost. This is an
  explicit conversion warning, not a complete inventory of every difference;

- `html-parse-error`: the standards parser recovered from malformed source;
- `invalid-selector`: an extension supplied an invalid selector;
- `unsupported-dom-rule`: a matching extension rule required a real
  `HTMLElement` callback and did not provide `parseHTML`;
- `invalid-rule-result`: a matching custom rule threw, returned a non-plain
  attribute value, could not find its declared content element, or could not
  produce a schema-valid node/mark. Other rules and readable fallback content
  are still tried. An explicit `false` is an intentional decline and is not
  reported as an error; `null`/`undefined` retain their default-attribute meaning;
- `unmapped-block-wrapper`: a block wrapper without a supported schema projection was discarded while
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

Standard block tags are not exempt from loss reporting. In the default schema,
an unrepresented `div`, `section`, `article`, `aside`, `main`, `nav`, `header`,
`footer`, `address`, `fieldset` or `dl` reports wrapper removal just like an
unknown custom tag. The parser knowing a tag is block-level does not mean it
retains that wrapper. Typography can still survive as marks while the wrapper
itself is lost. A successfully registered container rule is not reported as a
removed wrapper; rejected speculative content shapes do not create false losses.

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
