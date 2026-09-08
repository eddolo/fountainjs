# Markdown semantics and source fidelity

FountainJS exposes two separate promises because “round-trip Markdown” can mean
two very different things:

1. **Semantic round-trip:** supported headings, marks, lists, tables, links,
   footnotes, math, and other nodes reconstruct the same Fountain document.
2. **Source preservation:** the original JavaScript string—including line
   endings, spacing, delimiter choices, reference ordering, BOM, frontmatter,
   and unknown syntax—comes back unchanged.

The ordinary `parse`/`export` APIs provide the first promise for documented
syntax. The additive source-snapshot APIs provide the second promise while the
complete parsed model remains unchanged. JSON remains the only lossless
structured persistence format.

## Raw and visual workflow

### Choosing whether bare addresses become links

Fountain recognizes GFM-style bare web and email addresses by default. Hosts can
disable that syntax extension without removing the schema's link capability:

```ts
const options = { autolinkLiterals: false }
const imported = MarkdownImporter.parseWithSource(rawMarkdown, schema, options)
```

`https://example.com`, `www.example.com`, and `writer@example.com` then remain
plain text, including inside supported marks, lists, quotes and table cells.
Explicit `[label](url)`, reference links, and safe `<https://example.com>` or
`<writer@example.com>` autolinks are unchanged. URL safety checks still apply.
The policy is passed through source capture and HTML-adapter fallback paths.
It does not control interactive typing/paste rules, disable other Markdown
extensions, preserve raw bytes, or claim complete CommonMark conformance.

Keep the same import options when reopening exported Markdown: the syntax policy
belongs to the host, not to the Markdown string or source snapshot. Portable JSON
retains the actual link marks regardless of parser settings. The headless demo's
**Turn bare URLs and email addresses into links** checkbox demonstrates the
choice alongside developer JSON/HTML inspection.

The reference gate checks the disabled policy against all 563 already-matching
CommonMark examples plus literal-address examples 608, 611 and 612. These 566
checks are a separate policy contract; the default conformance score is unchanged.

### Optional raw HTML block conversion

Raw HTML is inert literal text by default. To convert recognized HTML **blocks**
into editable schema nodes, supply the isolated HTML importer explicitly:

```ts
import { MarkdownImporter } from 'fountainjs-editor/core'
import { ServerHTMLImporter } from 'fountainjs-editor/html/server'

// `schema` is the schema already used by your application.
const imported = MarkdownImporter.parseWithSource(rawMarkdown, schema, {
  parseHTMLBlock(html, targetSchema) {
    const result = ServerHTMLImporter.parseFragmentWithReport(html, targetSchema)
    reportHTMLIssues(result.issues)
    return result.nodes
  },
  onHTMLBlockFallback(issue) {
    console.warn(issue.reason, issue.message)
  },
})
```

The adapter must be synchronous and deterministic, return a document or readonly
block-node array from the supplied schema, and own its URL/security and
conversion-loss policies. An empty array means successful conversion with no
visible blocks, for example an HTML comment. Prefer `parseFragmentWithReport`
here: whole-document `parseWithReport` intentionally adds an empty caret paragraph
when no content remains. Explicit empty HTML paragraphs are still preserved.
Fragments use the same parser limits, schema validation and loss reporting;
nonempty adapter arrays must also match the receiving schema's document content
expression. This does not resolve HTML scopes spanning multiple Markdown blocks.
The adapter may return `null` to retain literal source. Exceptions, invalid document structure,
and foreign-schema results also retain literal source and trigger the fallback
callback. A schema check is **not** a general HTML sanitizer. Importer-specific
issues should be handled inside the adapter; `onHTMLBlockFallback` only reports
an entire block that could not be projected. The server importer can flatten or
omit unsupported HTML and does not provide an exhaustive HTML fidelity report.

Lists, quotes, disclosures, and footnote bodies propagate the same option.
Markdown inside an HTML block is not interpreted. Ordinary **inline HTML** is
unchanged; this hook does not resolve the remaining inline-HTML CommonMark work.
Fountain's explicit empty-paragraph and styled-text dialects keep their existing
behavior. Raw block text reaches the adapter with normalized LF line endings and
its enclosing Markdown container prefixes removed.

Source capture may invoke the adapter again to verify independent block
provenance; keep it free of mutations/network calls and make reporting tolerant
of repeated observations. The fallback callback itself is suppressed during
those verification parses. Multi-node HTML fragments still preserve the complete
original source when unchanged, but fail closed for ambiguous per-block mapping.

**Source preservation is not sanitization:** `exportWithSource` may return the
exact original HTML, including content the adapter omitted. Never insert that
Markdown/source string as live HTML. Render the validated model through the
appropriate safe output layer and retain normal application trust boundaries.

Try the **Convert HTML blocks to rich content** checkbox in the
[headless conversion demo](https://eddolo.github.io/fountainjs/demos/node-markdown.html).

### HTML scopes across multiple blocks

A CommonMark blank line can end a raw HTML block without closing its HTML
element. Use the optional flow adapter when a container or table spans several
such blocks; individual `parseHTMLBlock` calls cannot recover that scope:

```ts
const html = new ServerHTMLImporter()
const imported = MarkdownImporter.parseWithSource(rawMarkdown, schema, {
  parseHTMLFlow(segments, targetSchema) {
    const result = html.parseFlowWithReport(segments, targetSchema)
    reportHTMLIssues(result.issues)
    return result.nodes
  },
  onHTMLFlowFallback(issue) { console.warn(issue.reason, issue.message) },
})
```

The immutable stream contains `{ kind: 'html', html }` raw blocks and
`{ kind: 'node', node }` already-parsed Fountain blocks. A flow runs only where
raw HTML exists and takes precedence over `parseHTMLBlock`; nested Markdown
containers resolve separately. The adapter is synchronous/deterministic and may
run again for source provenance (with the fallback reporter suppressed).

The server adapter uses collision-free, source-bound placeholders and verifies
that every original block survives exactly once in order. It never serializes
Fountain blocks as HTML. Added semantic/style/custom marks copy only affected
paths, retaining source, attributes and block identifiers; untouched subtrees
retain object identity. Original inline marks take precedence over inherited
HTML marks; inner HTML scopes override outer scopes of the same mark type.
Formatting uses the same validated mark rules as inline HTML, including safe
links. Block atoms without inline descendants and empty blocks without a text
carrier are not converted into arbitrary CSS-styled objects.
Input and parsed-tree limits still apply. Unsupported raw-text
scopes surrounding protected blocks are rejected with a reason, as are custom
HTML rules that consume them. Failed flows retain their inert raw HTML rather
than partially applying per-block conversion. If inline or nested HTML adapters
already ran, fallback reparses the failed container with all HTML adapters
disabled; otherwise a closing tag such as `</pre>` could disappear before a
surrounding table flow fails. Sibling containers remain independent. Other
Markdown/TeX dialect options remain enabled, without repeating their reporters.
This is not complete HTML/CSS or
CommonMark fidelity; the default 563/72/17 baseline remains separate.

The conformance command also regression-locks **579/652** exact neutral-projection
matches with **both** server HTML adapters enabled, in
`tests/fixtures/markdown/commonmark-html-projection-baseline-v1.json`.
This is separate from the default inert baseline and the 1,304 unchanged-source
checks. Run `pnpm test:markdown-conformance --html-flow-report --show-mismatches`
for source, expected/actual projections, conversion issues and fallback reasons;
add `--example=148` instead of `--show-mismatches` to inspect one case.

The other 73 outputs are **unresolved comparisons**, not 73 proven parser bugs:
they include the existing 17 intentional policy/caret differences, discarded
comments, unsupported wrappers/attributes, specialized raw-text fallback, and
limitations of the current comparator. These need source-aware comparison rules
with independent loss-sensitivity tests, not blanket flattening or removal of
whitespace/attributes.
No missing match has been waived or promoted to full HTML fidelity.

Projection version 9 recognizes attribute-free strong/emphasis/strike wrappers
around paragraphs or headings as equivalent to marks on their inline content.
It retains each block boundary, heading level and mark, and declines unknown or
attributed wrappers, mixed loose content and code/layout scopes. Example 167 now
matches because the runtime was already correct, not because a parser feature
was added. Twenty independent LF/CRLF semantic/source contracts and ten injected
losses cover collapsed, reordered, added and reformatted paragraphs, sibling
scope leaks, attributes, unknown wrappers and code replacement. Earlier code
origin, whitespace, HTML-token and table sensitivity checks remain in force.

This is not permission to lift arbitrary HTML through Markdown's inline parser.
For example, `<strong><em><p>Both</p></em></strong>` on one line is parsed as inline
HTML within a Markdown paragraph; the inline-only adapter still rejects block elements and
keeps the source literal. Two explicit nonconformance contracts retain this
fallback and exact original source. By contrast a standalone `<strong>` opening
line begins an HTML block and can use the separate block-flow adapter.

### Experimental paragraph HTML recovery

`MarkdownImportOptions.parseHTMLParagraph` is a separate, default-off boundary
for HTML that can split an ordinary Markdown paragraph into several blocks:

```ts
MarkdownImporter.parse('Before <h2>Heading</h2> After', schema, {
  parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
  onHTMLParagraphFallback: issue => report(issue.message),
})
```

The callback receives the same frozen HTML-token/original-inline-node segments
as the inline adapter, but must return a same-schema block array (or `null`). It
takes precedence over `parseHTMLInline` in ordinary paragraphs. Headings and
pipe-table cells retain the existing inline-only path. Failures restore inert
HTML for the whole paragraph without partially applying another inline adapter.
If surrounding block flow fails, recovery disables this adapter too when
restoring the original container.

`ServerHTMLImporter.parseParagraph` / `parseParagraphWithReport` use HTML parser
recovery with an implicit paragraph wrapper where required, keeping original Markdown nodes in
protected slots rather than serializing their data. They verify each original
position survives exactly once and in order, including repeated references and
mark-only copies. Unknown wrappers/attributes may be omitted with conversion
reports; unsafe URLs are rejected. Active raw-text and foreign-content scopes
still require specialized parsing and fall back explicitly. Limits apply to the
wrapper and slots as well as source bytes. No browser or fake DOM is required.

The callback's third argument is a frozen `MarkdownHTMLParagraphContext` with
`tightList: boolean`. Forward it when wrapping `parseParagraph` or
`parseParagraphWithReport`; direct method references forward it automatically.
The server adapter omits the implicit `<p>` for direct tight-list paragraphs.
Ordinary paragraphs, paragraphs in quotes and loose lists retain the wrapper.
List tightness comes from sibling source boundaries, not a search for any blank
line: blanks inside nested lists, quotes, fenced code and HTML do not loosen the
parent. Item paragraph/flow conversion waits until sibling boundaries are known;
the parser does not replay host adapters to discover tightness.

Closed, text-only `<pre>` scopes inside a single Markdown paragraph now become
code blocks. The importer supplies `softBreak: true` on space-text segments that
came from a physical Markdown soft break. The adapter restores those LF characters
only within preformatted content; normal paragraphs retain spaces. Nested emphasis
retains its text marks/attributes in JSON. CR/CRLF become HTML newlines, and exactly
one initial LF is removed when it directly follows `<pre>` (not `<pre><code>`
or a newly opened Markdown mark). Empty original text slots do not consume this
rule. A CR entity followed by a physical newline is one LF, even when the parser
protects them as separate nodes. Raw tags/comments and distinct Markdown text
runs interrupt this pairing, as they do in reference-rendered HTML.
Text copies preserve attributes and the original position provenance. The
`preformatted-html-projection` report explicitly explains these transformations
and that code export is plain text, not a reproduction of HTML formatting.
This is not verbatim/integrity mode; untouched Markdown source can still be
exported exactly through the source-retention API.

Paragraph adapters must forward the original segments, including `softBreak`
and `textRun` metadata. The server validates that a tagged soft break is a space
text node and a supplied run ID is a nonnegative safe integer. Run IDs are
import-local provenance, not stable document identities; do not store or
renumber them. Adjacent text segments with equal marks and the same run can share
CRLF normalization. Direct host-created segments with both run IDs absent are
treated as continuous; distinct supplied IDs force a boundary. Text copies,
including empty nodes after consuming an LF, retain positions and attributes.
Inline atoms (including hard-break nodes and media), nested/orphan `<pre>` tags,
unclosed or cross-paragraph preformatted scopes, scripts and foreign content
remain explicit fallbacks. Both an unsupported opening and its orphan closing
tag remain literal; they are not silently consumed. Whole-container raw-text
projection still needs a separate source-aware design.
The [whole-container boundary audit](MARKDOWN_FLOW_PROVENANCE.md) demonstrates
why finished block nodes are insufficient and records the proposed smallest
change, pending reference fixtures and implementation acceptance criteria.

### Inspect paragraph syntax from a flow adapter

The importer now supplies an optional third `MarkdownHTMLFlowContext` argument
to `parseHTMLFlow`. Existing two-argument adapters and direct invocations remain
valid. `context.readParagraphSources()` lazily returns a cached, frozen array:

```ts
MarkdownImporter.parse(markdown, schema, {
  parseHTMLFlow(segments, target, context) {
    const paragraphs = context?.readParagraphSources() ?? []
    const physicalBreaks = paragraphs.reduce((count, paragraph) => count +
      paragraph.segments.filter(part => part.kind === 'node' && part.softBreak).length, 0)
    // Host-owned diagnostics; do not automatically log or transmit document text.
    diagnostics = { paragraphs: paragraphs.length, physicalBreaks }
    return ServerHTMLImporter.parseFlow(segments, target)
  },
})
```

Each entry contains normalized paragraph `source`, current output `blocks`,
pre-conversion inline `segments`, and `tightList`. It distinguishes a physical
LF from a literal space and retains raw closing tokens before HTML adapters
consume them. One paragraph may correspond to several output blocks or none.
`blocks` retain their current object identities. Syntax segment nodes are fresh
inspection nodes, **not positional identities of those output blocks**.

Inspection reuses Fountain's own inline parser with its reference definitions
and literal-address policy; it invokes no host HTML conversion callbacks.
Syntax nodes are allocated only on first inspection. List items establish their
tight/loose context before invoking flow callbacks. Source capture may still
invoke flow adapters separately for provenance probes, as before.

This covers direct ordinary paragraphs of each container only. Nested containers
have their own context; headings, code, raw HTML blocks and generated structural
separators are not a complete rendering stream here. `source` is parser-normalized
input, not a byte-exact file slice; use `parseWithSource` for file retention. The
context is inspection/provenance groundwork: `ServerHTMLImporter.parseFlow`
still declines the unsupported cross-paragraph preformatted cases. It is not
permission to flatten original block IDs, attributes or custom atoms into text.

**Remaining limits:** those raw-text/cross-paragraph scopes, omitted HTML comments and
unknown wrapper identity are not lossless. The schema still supplies a paragraph
for empty list items, unlike the reference's empty `<li>`. Ordinary/loose paragraph
recovery can legitimately produce empty blocks from HTML's closing-tag recovery;
do not blindly trim them away. Markdown emphasis crossing a recovered block can
also lose a reference-generated empty mark wrapper; this is explicitly checked
as a remaining mismatch. Seventy-six reference/source checks and 1,304
whole-corpus source-retention checks are separate from the unchanged 563 default
and 579 block/inline-adapter baselines. Full CommonMark remains unfinished.

Try **Recover block tags inside paragraphs** in the conversion demo. The recorded
`markdown-paragraph-recovery-journey.ts` exercises conversion, paste, editing/undo,
Markdown download/reopen and desktop/mobile reader layouts.

Projection version 7 corrects reference code provenance: an observer records the
output offsets of `<pre>` tags actually emitted for Markdown code blocks, without
changing any reference HTML. Only those blocks lose the reference's canonical
final terminator during comparison. Raw authored `<pre>` text keeps every LF.
This matters even when raw HTML and fenced Markdown generate byte-identical
HTML. HTML-parser source locations bind the origin, so repeated blocks, fake
attributes and nesting cannot shift it to another block. All 652 oracle HTML
fixtures remain byte-exact. Twenty independent LF/CRLF import/source contracts
cover raw, fenced, indented, repeated and nested blocks; six injected missing
or added newlines are rejected. Example 169 now matches because Fountain was
already correct, not because the runtime was changed or whitespace was ignored.

Projection version 8 compares table groups, rows and cell block content
structurally. It equates only explicit `rowspan="1"` / `colspan="1"` with their
omission and ordinary text with its cell paragraph wrapper. Header/data identity,
all other attributes, non-unit spans, row-group identity, captions, nested tables,
explicit empty paragraphs and content/formatting remain significant. Fourteen
deliberate structural/content corruptions must be rejected. This recognizes
already-working examples 149, 160 and 190, not arbitrary HTML table fidelity.

Successful projection reports `block-html-projection` alongside specific losses.
Exact whole-source export remains available while the document is unchanged;
cross-block source mappings stay unavailable when ambiguous. Unknown wrappers
can be flattened and layout omitted, so the HTML adapter's output is not a
lossless replacement for the imported source. The public conversion demo uses
this flow adapter behind **Convert HTML blocks to rich content**.

### Optional inline HTML formatting

Inline HTML has a separate default-off boundary. Do **not** pass individual
opening/closing tags to the block importer: their scope spans intervening
Markdown nodes. Use the full inline stream instead:

```ts
const html = new ServerHTMLImporter()
const imported = MarkdownImporter.parseWithSource(rawMarkdown, schema, {
  parseHTMLInline(segments, targetSchema) {
    const result = html.parseInlineWithReport(segments, targetSchema)
    reportHTMLIssues(result.issues)
    return result.nodes
  },
  onHTMLInlineFallback(issue) {
    console.warn(issue.reason, issue.message)
  },
})
```

`MarkdownHTMLInlineSegment` is either `{ kind: 'node', node }` (the original
Fountain inline node) or `{ kind: 'html', html, marks }` (one lexically valid raw
HTML token with its local Markdown marks). Segments and the stream array are
immutable. The adapter runs once for each inline container with raw tokens,
after recursive Markdown parsing; headings, paragraphs, table cells, list/quote
content, and disclosure summaries use the same boundary. Code, escaped tags,
autolinks, and Fountain's explicit inline dialect keep their existing handling.
Image descriptions do not invoke the projection adapter.

The server implementation gives original nodes protected, collision-free slots
in a bounded parse5 fragment. It applies enclosing HTML marks to these nodes,
preserving their type, attributes, children, and existing Markdown marks. It
never serializes their content through HTML. Existing Markdown marks take
precedence over a surrounding HTML mark of the same type; repeated Markdown
marks are not removed. HTML-created atoms inherit the Markdown marks present
on their opening token. For example, `*<a href="/safe">one* two</a>` keeps both
words linked but only `one` emphasized; `*<img src="/image.png">*` keeps emphasis
on the image node.

Every protected node must survive exactly once and in its original order.
Consumed, duplicated, moved, or replaced slots cause the entire inline container
to fall back to its normal inert interpretation. Block/raw-text/foreign-content
HTML in an inline container currently requires a specialized adapter and also
falls back. A custom HTML atom cannot silently swallow Markdown children.
Original nodes outside added mark scopes retain object identity; repeated uses
of the same immutable node are distinct protected positions.

The core validates same-schema inline output and catches declined, thrown,
foreign-schema, and invalid results. It does not police a host adapter's content
policy; the protected-slot guarantee belongs to the supplied server adapter.
Fallback notifications are suppressed during source-provenance verification;
normal adapter issue reporting can still run again. Observer exceptions are not
swallowed. `parseInlineWithReport` reports a conservative projection warning:
comments, tag identity, unsupported attributes/styles, and unsafe URLs may be
discarded. Source-preserving export can return those original tokens, so the
sanitization warning above applies unchanged.

Try **Convert inline HTML formatting** independently of block conversion in the
headless demo. Neither option changes the default-policy CommonMark baseline
(563 matching / 72 pending / 17 intentional). Full raw-HTML conformance and
exhaustive loss reporting remain unfinished.

Specific conversion diagnostics now distinguish omitted HTML comments,
unmapped inline elements, and rejected built-in link/image URLs. These appear
alongside—not instead of—the conservative inline-projection warning. Only the
content candidate accepted by the schema contributes content-loss diagnostics;
a discarded speculative interpretation is not evidence of lost data. Unknown
attributes, CSS/layout, specialized elements, and other optional node families
still require broader accounting. No pending CommonMark case is promoted merely
because an optional conversion can discard the mismatching HTML.
The diagnostic increment passed the complete 899-test gate, nine cross-browser
contracts, and fourteen recorded workflows; the warning and edited-result
screenshots were visually inspected. See [the detailed evidence](SERVER_HTML.md#reports).

Verification (2026-09-07): `pnpm check` passed **891 tests in 82 files**, including
34 new inline-adapter cases, plus package, API, pure-Node/server-boundary,
conformance, build, and performance checks. Nine sequential
Chromium/Firefox/WebKit contracts passed in
`artifacts/browser-inline-html-20260907c/results/`. All thirteen recorded
Markdown/HTML workflows passed in
`artifacts/manual-inline-html-20260907c/results/`; screenshots 26 and 27 were
visually inspected. The new workflow uses native rich clipboard paste, replaces
an emphasized word, checks undo/redo, exports Markdown, and re-imports to the
same document JSON (apart from host-generated IDs). The demo consolidates
repeated warning messages without changing importer reports.

The new public API is additive; the API snapshot still covers 376 declaration
files. No dependency was added. Measured runtime totals are about 1319.2 KiB ESM
and 1101.0 KiB CommonJS, under explicitly revised 1320/1102 KiB aggregate caps.
The shared strict HTML lexer is now co-located with the existing entity decoder
by the bundler; its source map was checked and that combined chunk is measured.
All consumer entry ceilings and performance limits remain unchanged.

### Preserving rich tables in exported Markdown

Pipe tables remain the portable default, with loss reports for merged cells,
column widths, multiple/non-paragraph cell blocks, or cell-role changes.
Pipe Markdown always makes the first row column headers and later rows data
cells; it cannot preserve a headerless table or headers in later rows. Choose HTML explicitly
when the receiving Markdown reader supports it:

```ts
const exported = MarkdownExporter.exportWithReport(document, {
  tableFormat: 'html',
})
const restored = MarkdownImporter.parse(exported.markdown, schema, {
  parseHTMLBlock: ServerHTMLImporter.parse,
})
```

The option uses Fountain's existing safe HTML serializer, not arbitrary raw
HTML injection. Supported cell paragraphs, empty paragraphs, headings, lists,
quotes, code, nested tables, spans, widths, and header scope are retained.
Text/attribute newlines use numeric HTML references, keeping the table on one
physical line so a blank line inside code cannot end the Markdown HTML block.
HTML tables work inside supported lists and quotes too.

Each HTML table emits a conservative entry in `losses`: a compatible
HTML-enabled reader is required and arbitrary schema metadata is not verified
lossless through HTML. This is a compatibility/projection notice, not a claim
that every cell lost content or an exhaustive HTML loss inventory. JSON remains
the lossless storage format. Without `parseHTMLBlock`, the default importer
keeps the table HTML as editable literal text. `linkStyle` and `emptyParagraphs`
apply to ordinary Markdown rendering; content inside an HTML table follows the
HTML serializer instead. Exact, unchanged source snapshots still take priority
over canonical export options.

The demo data panels expose **Keep table structure with HTML** in the Markdown
tab and show expandable export notes. Re-import that output with **Convert HTML
blocks to rich content** enabled.

The real wrapper/paste audit exposed a one-column pipe-table import defect.
Single-column and header-only tables now remain tables, and the related
[GFM table examples 198–205](https://github.github.com/gfm/#tables-extension-)
have focused tests for short alignment delimiters, escaped pipes inside code
and emphasis, header/delimiter width checks, short/long body rows, and blank-line
or new-block termination. This is targeted table evidence, not full GFM
certification. `tests/markdown-tables-gfm.test.ts` also verifies that an escaped
literal pipe does not turn a Setext heading into a table.

The combined wrapper/table fixes passed the complete 815-test local gate and
all eleven recorded public-demo Markdown/HTML workflows under
`artifacts/manual-html-wrappers-20260907b/results/`. The new recordings cover
unfamiliar original HTML → real clipboard paste → block editing → undo/redo →
export/re-import, plus a one-column pipe table edited in the public editor.
Their conversion-warning and rendered-editor screenshots were visually
inspected. This is in addition to, not a replacement for, the earlier HTML-table
export verification below.

Verification (2026-09-07): the complete local gate passed 792 tests, package and
server-runtime checks, headless-boundary checks, semantic conformance, API,
build, and performance budgets. Three Chromium/Firefox/WebKit runs exercised
the public export choice and re-import. The recorded workflow under
`artifacts/manual-html-table-markdown-20260907b/results/` imports multiline HTML,
shows both pipe-loss notes and the HTML compatibility note, copies the actual
Markdown output, re-imports it with equal JSON, and edits the resulting rich
table. Its export-control and rendered-table screenshots were visually
inspected. Windows clipboard LF→CRLF normalization is allowed for physical
Markdown separators; code newlines encoded inside the table must still restore
exactly. This does not alter the CommonMark baseline or certify arbitrary HTML
metadata fidelity.

All nine recorded Markdown/HTML regressions also passed under
`artifacts/manual-markdown-html-export-regression-20260907a/results/`, and the
existing public headless Markdown/LaTeX/server-HTML journey passed in all three
browser engines (six targeted browser runs including the new table workflow).
The previous table-cell/Unicode increment `8582f38` passed both
[remote CI](https://github.com/eddolo/fountainjs/actions/runs/34080837721) and
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34080837727).

### Exact source snapshots

```ts
import {
  MarkdownExporter,
  MarkdownImporter,
  Schema,
} from 'fountainjs-editor/core'
import { CoreSchemaSpec } from 'fountainjs-editor'

const schema = new Schema(CoreSchemaSpec)
const imported = MarkdownImporter.parseWithSource(rawMarkdown, schema)

// Raw view can display exactly what the user supplied.
rawTextarea.value = imported.source.source

// No model change: exact original string.
const unchanged = MarkdownExporter.exportWithSource(
  imported.document,
  imported.source,
)
// unchanged.preservation === 'exact'

// A visual editor can use imported.document. After a model edit, Fountain
// retains exact frontmatter, safely mapped unchanged blocks, and intentionally
// canonicalizes changed blocks or the full body when mapping is ambiguous.
const edited = MarkdownExporter.exportWithSource(editor.state, imported.source)
// edited.preservation === 'blocks', 'mapped-blocks', 'frontmatter', or 'canonical'
```

When the user edits raw Markdown, call `parseWithSource` again. The returned
snapshot now owns that new source. A snapshot is immutable and is intentionally
not stored in the Fountain document or collaboration state.

## Frontmatter contract

Fountain recognizes frontmatter only when:

- the first line, optionally after a BOM, begins with an unindented `---`
  delimiter;
- the delimiter contains only optional trailing spaces/tabs;
- a later unindented delimiter line is `---` or `...` with optional trailing
  spaces/tabs.

The exact prefix and content are retained as strings. FountainJS does not parse,
execute, validate, merge, or expose YAML object properties. This avoids YAML
type/coercion surprises and keeps application metadata under application
control. An unclosed or indented delimiter is ordinary Markdown content.

If the document body changes, the original frontmatter prefix remains exact.
If its closing delimiter had no final line ending and the canonical body is no
longer empty, the detected source line ending is inserted between them.

## Preservation result

`MarkdownExporter.exportWithSource(...)` returns the normal immutable
`markdown` and `losses` fields plus:

| Value | Meaning |
| --- | --- |
| `exact` | The current document equals the snapshot's parsed document, so the original source string is returned exactly. |
| `blocks` | The top-level shape stayed aligned; unchanged conservatively mapped blocks and their separators are exact while changed blocks are canonical. |
| `mapped-blocks` | The top-level shape changed; identity-preserved or uniquely equal blocks keep exact source while unmatched blocks and inter-block separators are canonical. |
| `frontmatter` | The model changed; recognized frontmatter is exact and the body is canonical. |
| `canonical` | The model changed and no recognized frontmatter exists; normal canonical export is returned. |

An exact result can retain syntax Fountain does not understand because it does
not regenerate anything. It does **not** mean that unknown syntax entered the
structured model. After a visual edit, unknown syntax can survive only inside
an unchanged safely mapped block; a changed or canonicalized block retains only
features represented in the model and exporter.

## Safe block-level preservation

`parseWithSource` attempts a deliberately conservative top-level mapping. A
blank-line-delimited content region must independently parse to exactly one node,
and the complete ordered set must equal the full parsed document. Only then are
the block source, leading whitespace, separators, and trailing whitespace
captured. On export, position-aligned equal nodes reuse their exact source and
separators. When insertion, deletion, or movement changes the top-level shape,
`mapBlocks(document)` first uses preserved immutable node identity. This safely
distinguishes semantically equal original blocks through deletion and movement.
When identity is unavailable, it groups structural JSON and retains a block
only when that semantic value occurs exactly once in both documents.
Structural output uses canonical separators so whitespace is never transferred
to a different neighbor. Capture is capped at 10,000 top-level regions; larger
source still gets exact whole-document preservation while unchanged, then
canonical fallback.

Root link/image reference definitions are shared parsing context,
not document nodes. Their exact source stays in `leading` or `separatorAfter`
trivia for aligned edits. `referenceDefinitions` exposes the captured definition
regions in original order; after a structural move/deletion they are appended
once, in that order, with canonical separators. This keeps surviving references
resolvable and preserves first-definition precedence. Unused definitions are not
automatically removed. A single parsed definition map is shared across capture
checks instead of reparsing every definition for every content block. Definitions
may occupy their own region or prefix a paragraph/heading without a blank line.
Capture peels only the prefix accepted by the same reference parser, retaining
its exact physical line endings in the preceding source trivia.

Only accepted root prefixes qualify. Definition-looking text after an open
paragraph is not a prefix. Container definitions, footnotes and ambiguous
boundaries do not receive this guarantee. Rejected unsafe URL definitions remain
visible literal content under the normal importer policy, not hidden trivia.
Source preservation is not a sanitizer; raw unchanged source can contain syntax
that the model does not activate. Newly generated plain text escapes brackets so
retained definitions cannot turn literal text into unintended links.

This preserves useful author choices such as Setext headings, closing ATX
markers, deliberate spacing, and unknown literal directives in untouched
blocks. Equal duplicates retain their own source only while their original node
identity survives; repeated node identities, reconstructed equal nodes, loose
structures spanning blank lines and container reference definitions can
still force canonical output. Changed links are regenerated inline; requesting
new reference-style output falls back if it would collide with source-owned
definitions. Fountain does not use fuzzy matching or
silently attach raw source to the wrong node.

## Current semantic baseline

The importer currently covers Fountain's documented Markdown projections plus
an initial standards-oriented set of behaviors:

- one-to-six-level ATX headings with up to three leading spaces and optional
  closing hashes, including hash-only closers and standard trailing-space
  removal;
- level-one/two Setext headings over one or multiple content lines;
- indented code and variable-length backtick or tilde fences;
- variable-delimiter code spans with CommonMark whitespace normalization;
- strict HTML5 named/numeric character references and all ASCII punctuation
  escapes, excluding code spans and blocks;
- safe absolute/relative links with balanced or angle-bracket destinations,
  explicit empty links, strict title closers, bounded/escaped reference labels, and code-aware
  single- or multiline definitions with multiline labels, plus
  malformed-inline/shortcut and
  nested-link precedence with code/autolink/inline-HTML opacity;
- physical-line-aware link validation and CommonMark-exact ASCII whitespace
  separation between destinations and titles;
- locale-neutral Unicode 17 full case folding for reference labels, including
  the expanding and compatibility mappings JavaScript lowercasing omits;
- source-normalized reference matching that keeps escape/entity spelling
  significant until the resolved visible label is parsed, collapses only
  spaces/tabs/line endings, counts its bound by Unicode code point, and honors
  adjacent full/collapsed/shortcut precedence;
- safe HTTP(S), `mailto:`, XMPP, and email autolinks inside angle brackets;
- boundary-safe GFM `www.`, `http://`, and `https://` autolinks with validated
  domains and path punctuation/parenthesis/entity-suffix trimming;
- GFM bare email autolinks with local/domain character validation and
  fail-closed invalid domain tails;
- underscore or star emphasis, strong emphasis, exact one/two-tilde GFM
  strikethrough, code, and highlights;
- Unicode-aware emphasis opening flanking, double-underscore strong, and
  triple-delimiter combined strong emphasis;
- Unicode-aware closing flanking at inline-fragment boundaries, so whitespace
  before a star/underscore run cannot become an invalid emphasis closer;
- unambiguous nested emphasis plus link/code/HTML grouping precedence, with a
  semantic-span fallback for lossless adjacent marked-node boundaries;
- delimiter arithmetic for surplus star/underscore runs, repeated emphasis or
  strong levels, and earlier-span precedence across unlike overlapping marks;
- strike delimiter search that treats code, autolinks, inline HTML, and links
  as opaque while preserving continuous strike around their parsed content;
- spaces or a backslash before a newline as a hard break;
- inline/reference links and images with titles;
- plain-text image descriptions derived from nested emphasis, links, and images;
- links and emphasis around inline image atoms, preserved through canonical
  Markdown plus browser/server HTML, JSON, DOM rendering, and Yjs;
- recursive blockquotes, including up-to-three-space markers and lazy paragraph
  continuation through nested quote depths; tight/loose nested lists; and
  GFM-style tasks;
- tab-stop-aware leading indentation plus marker-relative tab stops for code and
  list containers;
- `-`, `*`, and `+` bullet markers plus both ordered-list delimiters, with a
  marker-style change preserving the boundary between adjacent lists and only
  a `1`-starting ordered list allowed to interrupt an open paragraph; ordered
  markers use one to nine digits, preserve a zero start through Markdown and
  browser/server HTML, keep continuation markers inside that bound, and accept
  empty list items without requiring whitespace after a bare marker; list items
  may begin with any valid block, including nested lists, thematic breaks, and
  indented or fenced code;
- ASCII-space/tab-only list-marker separation, leaving non-breaking spaces as
  literal document content;
- compact or spaced thematic breaks with up to three leading spaces and
  block-level precedence over list markers;
- aligned GFM pipe tables;
- extension-aware footnotes, math, details, ruby, and rich text-style HTML.

The exporter chooses a code fence longer than any matching marker run in its
content, preventing a literal triple-backtick line from closing the block.

### Literal text is not newly authored syntax

Canonical export escapes literal `~`, `=`, and `$` characters as well as ordinary
Markdown delimiters. It also protects bare URL/email triggers in text without a
link mark. For example, an unlinked `writer@example.com` becomes
`writer\@example.com` in Markdown source and still displays as the same unlinked
text when reopened. This prevents an export/re-import from silently adding
strikethrough, highlighting, a math node, or a link.

Actual code, links and math retain their structured serialization. Changed
blocks in source-preserving export receive the same protection; safely mapped
unchanged blocks keep their original source. Backslashes here are format escapes,
not additional visible document characters. Canonical Markdown is not a verbatim
byte format; use the original source snapshot while unchanged or an appropriate
plain-text/structured persistence boundary when that is the requirement.

Fifteen unit cases and the recorded issue workflow cover literal syntax through
visual edits, undo/redo, source inspection, Markdown download/reopen and reader
preview. See `tests/markdown-literal-export.test.ts` and
`tests/browser/markdown-literal-journey.ts`. This does not claim complete Markdown
interchange fidelity for every extension or arbitrary source language.

### Literal text line endings versus Markdown line breaks

Fountain text nodes may contain actual LF (`U+000A`) or CR (`U+000D`) characters.
These are different from `hard_break` nodes and from physical newlines in a
Markdown source file. Canonical export writes literal LF/CR as `&#10;`/`&#13;`,
so a following `#`, list marker, or blank line cannot create new document blocks.
Import collapses ordinary Markdown soft breaks **before** decoding entities,
preserving the referenced characters. This includes `&NewLine;` and hexadecimal
references. It does not change CommonMark's physical-line-ending normalization.

Backtick code spans cannot retain literal newlines: CommonMark normalizes them
and does not decode character references inside code. Multiline code-marked text
therefore uses Fountain's existing inert `data-fountain-text-style` envelope.
Colored/styled text and ruby base text also encode their literal line endings.
Other Markdown consumers may discard the envelope or render whitespace
differently; this is not a universal byte-exact interchange promise.

The regression suite checks literal text, code, styled/link text, nested blocks,
table cells, ruby, source-mapped edits, and distinct soft/hard breaks. Twelve
additional reference-parser comparisons inspect exact text characters rather
than normalizing them through the general semantic projection. The recorded
issue workflow additionally checks actual line geometry, editing, undo/redo,
download/reopen, and desktop/mobile reader display. These checks do not change
the existing 652-example CommonMark classifications.

## Table captions through optional HTML conversion

HTML table captions are no longer silently discarded by the browser/server
importers. Their supported content becomes editable blocks before the table;
rich marks, links, multiple paragraphs and empty paragraphs are preserved.
Nested captions remain within their containing cell. The optional Markdown
HTML-block adapter inherits this behavior, while default inert HTML is unchanged.

The current table schema has no native caption child, so the report explicitly
identifies lost caption association, placement and attributes. In particular,
this does not reproduce bottom-caption CSS or add a native caption command.
Exact-source export can retain the original HTML; canonical export preserves
the projected blocks, not the caption tag. See [the server contract](SERVER_HTML.md#table-caption-content-retention).

The recorded workflow in `artifacts/manual-table-caption-20260907a/` pastes an
actual HTML table through the OS clipboard, edits marked caption text,
undoes/redoes and exports/re-imports Markdown. The conversion warning and edited
caption/table screenshots were visually inspected. The public conversion check
also passed Chromium, Firefox and WebKit in
`artifacts/table-caption-engines-20260907a/`.

The complete local check passed 1,095 tests in 96 files, including ten caption
regression cases plus a pure-Node nested-caption case. Package/API, server and
headless runtimes, conformance and unchanged performance checks passed. Aggregate
runtime size is 1347.9 KiB ESM / 1124.2 KiB CJS; only the CJS aggregate ceiling
increased by 1 KiB. No public API, dependency or table schema changed. CommonMark
remains 563 matching / 72 pending / 17 intentional; caption recovery is not a
claim of complete conversion or native table-caption support.
The production website build also passed, retaining the existing large MathJax
reference-page chunk warning.

## Complex figures through optional HTML conversion

The browser and server HTML importers now preserve supported figure descendants
instead of extracting images and silently discarding adjacent content. A simple
media/plain-caption figure remains one node. Figures containing other paragraphs,
tables, multiple images, nested blocks or rich captions become ordered editable
blocks; `unmapped-block-wrapper` reports the lost figure grouping/attributes.
Rich caption marks and links survive as paragraph content. Unsafe or rejected
media does not consume the remaining caption. Extension-defined figure nodes
still own their subtree when their registered parse rule succeeds.

This also applies to `parseHTMLBlock: ServerHTMLImporter.parse`; hosts needing
diagnostics should use `parseWithReport` in their adapter as the conversion demo
does. Exact-source export can retain the original figure, while canonical
Markdown cannot retain all image layout. In the recorded 320 px image workflow,
HTML re-import retains the full document, but standard Markdown re-import changes
only that width to its default `100%`; the visible image-layout export note is
asserted before conversion. This is not full HTML or CommonMark conformance.

The new regression corpus covers both importers, rich captions, image rejection,
typed video figures, nested content, and source/canonical round trips. An
additional pure-Node test checks the server path without browser globals. The
public conversion contract passes in Chromium, Firefox and WebKit. A recorded
Chrome workflow pastes the original HTML via the OS clipboard, edits prose,
undoes/redoes, and reopens both HTML and Markdown; its artifact directory is
`artifacts/manual-figure-retention-20260907-all/`. All 16 recorded Markdown
workflows passed in this final run. The new figure's conversion, edited content
and explicit Markdown layout-loss screenshots were inspected.

The complete check passed 1,084 tests in 95 files, with API, packed-package,
server/headless runtime, conformance and unchanged performance checks. Figure
retention adds about 1.4 KiB ESM / 1.2 KiB CJS; only aggregate size ceilings
increase (measured totals 1347.4 / 1123.8 KiB). No dependency or public API changed.
The independent CommonMark oracle still reports 563 matching / 72 pending /
17 intentional differences, with all 72 inert-HTML and 144 generated contracts
passing. This improvement does not certify complete CommonMark conversion.
The final three-engine conversion rerun is retained under
`artifacts/figure-retention-engines-20260907-final/`. The website production build
passed with the existing large MathJax reference-page chunk warning unchanged.

## Conformance evidence and limits

[`tests/fixtures/markdown/compatibility-v1.json`](../tests/fixtures/markdown/compatibility-v1.json)
is a versioned, Fountain-authored compatibility corpus. It records the
[CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/) and
[GFM 0.29-gfm specification](https://github.github.com/gfm/) used for the
baseline. The cases are independently worded representative fixtures; they are
not a copy of either complete specification suite.

The development-only standards oracle in the
[repository conformance script](https://github.com/eddolo/fountainjs/blob/master/scripts/check-markdown-conformance.mjs)
scans all 652 CommonMark 0.31.2 examples and compares a neutral semantic projection
(block kind and nesting, text, marks, destinations, list starts, and rendered
meaning), never literal equality between CommonMark's AST and Fountain's
document schema. Fountain keeps its own parser, model, identity, extension,
security, source-preservation, and loss-reporting contracts. Reference parsers
do not enter the shipped runtime. The versioned
[semantic baseline](https://github.com/eddolo/fountainjs/blob/master/tests/fixtures/markdown/commonmark-semantic-baseline-v1.json)
classifies every example: 563 currently match, 72 remain pending, and 17 are
intentional default-policy/GFM/editor-model divergences. A regression, unclassified case, or
newly matching case fails the gate and requires an explicit baseline review.
The 72 pending examples belong to the raw-HTML work group. Every pending example
must belong to exactly one named group with proof requirements. Ten intentional
empty-document/container cases have an additional exact contract: Fountain may
add one empty caret paragraph only to an otherwise empty root, quote, or list
item. All other projected content must agree, and both original-source and
canonical round trips must pass. This closes the eight formerly pending policy
decisions without increasing the 563 semantic matches or erasing authored blanks.

### Independent inert-HTML reference contract

The pinned `commonmark@0.31.2` JavaScript reference implementation is now a
**development-only oracle**, not Fountain's parser. Its normal renderer must
first reproduce all 652 official `commonmark-spec@0.31.2` HTML outputs exactly.
Only after that check does a second reference renderer change two things:
inline raw HTML is emitted as literal text, and raw HTML blocks are emitted as
literal paragraphs with explicit line breaks. Everything else—block boundaries,
emphasis, links, references, list structure, and token recognition—comes from
the unmodified reference parser. No Fountain AST is constructed from that tree,
and the two engines' internal trees are never compared for equality.

The named `literal-html-reference-v1` contract covers all 72 pending raw-HTML
examples. Each must pass:

- neutral rendered-semantic comparison against the inert reference output;
- exact ordered raw-token comparison through Fountain's declining adapter hooks;
- retention of those literal tokens in Fountain's document text (inline LF is
  a soft space; block line boundaries remain explicit);
- unchanged parsing when adapters decline, exact original-source export, and
  canonical Markdown export/re-import into the same Fountain document.

The gate adds 144 generated cases: all seven raw-block classes in plain text,
quotes, lists, and nested list/quote containers, with zero/three-space indentation
and LF/CRLF endings; plus inline quoted attributes, crossing emphasis/link
boundaries, and malformed attribute separators. Eight deliberately wrong
semantic outputs and two whitespace-corrupted literals prove that the comparator
does not erase the losses it is intended to catch. This includes double spaces
and NBSP inside literal attributes, independently of HTML display whitespace.

The reference parser is absent from all 128 emitted runtime source maps; the
gate fails if it enters a browser/server library bundle. The dependency and its
BSD-2-Clause license remain part of the development installation. See the
[official reference implementation](https://github.com/commonmark/commonmark.js)
and [CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/).

Run `pnpm test:markdown-conformance` for enforced checks, or
`node scripts/check-markdown-conformance.mjs --html-policy-report` for detailed
policy failures. These proofs do **not** change the 563 / 72 / 17 default
classification. The remaining work is broader opt-in HTML schema projection,
specialized/raw-text structures, and complete unsupported/unsafe-content loss
policy—not evidence that the 72 current examples all have delimiter bugs.

Verification on 2026-09-07: the complete `pnpm check` passed 899 tests across
83 files and the package, runtime, API, conformance, build, and performance gates.
All 15 recorded Markdown editing workflows passed under
`artifacts/manual-inert-html-oracle-20260907b/results/`. The new nested
list/quote workflow uses real clipboard paste, edits marked text, exercises
undo/redo, and exports/reimports the document. Its before/after screenshots
were visually inspected: literal tags, entity spelling, backslash, line breaks,
and surrounding emphasis remain visible. The host's single trailing caret
paragraph is asserted explicitly, not stripped from comparisons. No runtime
engine, public API, or bundle-budget change was needed for this oracle work.

Caret-policy verification on 2026-09-07: `pnpm check` passed all 792 tests in
79 files and the package, runtime, API, conformance, build, and performance gates.
The final empty-container editing contract includes all ten official examples
and passed in Chromium, Firefox, and WebKit. The separate visible-blank-line
Enter/Backspace contract also passed in all three engines. A fresh recorded
public-demo spacing/export/re-import audit passed under
`artifacts/manual-caret-policy-20260907a/results/`; its before/after screenshots
were visually inspected and retain the blank lines and nested list code block.
No runtime, schema, API, or bundle-budget change was needed for this policy
decision. The preceding HTML-table export commit `52bcfd4` has successful
[CI](https://github.com/eddolo/fountainjs/actions/runs/34081649628) and
[site deployment](https://github.com/eddolo/fountainjs/actions/runs/34081649649).

The harness also materializes the specification's visible tab notation before
either side is parsed, so those cases exercise real tab characters.
Equivalent decoded and percent-encoded link destinations are canonicalized as
URIs so representation spelling is not mistaken for a semantic failure.

Passing this corpus is **not** a claim of complete CommonMark or GFM
conformance. Important remaining work includes:

- all HTML block/inline precedence and safe unknown-HTML policy;
- HTML-comment/list interactions;
- raw-HTML interactions with links, emphasis, escapes, and line breaks;
- additional strikethrough delimiter-stack cases;
- configurable handling for CommonMark's arbitrary URI schemes without
  weakening Fountain's default safe-URL policy;
- promotion of the remaining explicitly classified oracle cases as their
  semantics become supported;
- deeper-structure source mapping without attaching raw text to the wrong node.

Until those gates exist, documentation should say “supports these Markdown
features,” not “fully CommonMark/GFM compliant.”

The next parser milestone is a coherent raw-HTML contract, not another batch of
unrelated delimiter exceptions. Account for all seven CommonMark HTML block
classes, inline token precedence, unsupported schema elements, and default
inert handling. Any opt-in conversion must pass the same URL/style/schema
safety checks as HTML import and report losses. Script, style, processing
instruction, and arbitrary custom-tag cases must not become executable content
just to make their reference-rendered HTML match. Empty caret hosts retain their
explicit editor-model contract; blanket removal of empty paragraphs would erase
real author-created spacing.

Inline lexical recognition and type-7 complete-tag detection now share the
same DOM-free scanner in `src/core/markdown-html.ts`, following the
[CommonMark 0.31.2 raw-HTML grammar](https://spec.commonmark.org/0.31.2/#raw-html).
Malformed attributes, missing separators, and attributes on closing tags no
longer hide otherwise valid Markdown emphasis or code behind an opaque token.
Valid raw tags remain inert literal content under the default policy. Short
comments and lowercase declarations have their proper token boundaries, and
ASCII HTML whitespace is distinguished from Unicode text inside attribute
values. Type-6 block detection deliberately retains its separate prefix rule.

This lexical foundation now feeds the separate opt-in inline scope adapter
documented above. It does not itself convert HTML, and broader raw-HTML
conformance/loss reporting is still open. The `parseHTMLBlock` callback must not
be applied to isolated inline tags as if each were a complete document: doing
so would lose the scope that determines subsequent content.

The recorded lexical/editing workflow also exposed a core typing defect:
replacing a selected formatted word retained formatting only for the first
character. Range replacement now derives the following caret's marks from the
inserted leaf in both `insertText` and composition commit, while collapsed-caret
input retains explicit stored-mark choices. Tests cover emphasis, strong, code,
mixed-mark replacement, native browser word selection, and synthetic IME commit
followed by ordinary typing. Synthetic composition tests are not a claim of
physical-device IME certification.

Firefox word selection also exposed equivalent-boundary ambiguity: the start
of the selected marked run can be expressed as the preceding text run's end.
`src/core/text-replacement-selection.ts` resolves that boundary to the first
actually selected nonempty text sibling before ordinary/IME replacement. It
does not move collapsed carets, cross blocks or atoms, or move beyond the range
endpoint. A core test verifies that both equivalent range representations
produce identical replacement content and formatting.

Verification (2026-09-07): the final `pnpm check` passed 857 tests in 81 files,
plus package/runtime, API, semantic conformance, build, and performance checks.
Fifteen sequential Chromium/Firefox/WebKit contracts passed under
`artifacts/browser-lexical-mark-replacement-20260907c/results/`. All twelve
recorded Markdown/HTML workflows passed under
`artifacts/manual-html-lexical-20260907b/results/`; the conversion output and
post-edit screenshot were visually inspected, including the entire replacement
word remaining italic after typing and undo/redo. The original recordings and
failing regressions exposed the stored-mark and Firefox boundary problems;
those checks were retained with explicit assertions for the intended formatting.

No public API or dependency changed. Aggregate runtime measured 1314.1 KiB ESM
and 1096.6 KiB CommonJS, approximately 1.4/1.1 KiB above the preceding checkpoint.
Aggregate caps are now 1315/1097 KiB; individual entry and performance limits
remain unchanged. The CommonMark classification remains 563 matches, 72 pending,
and 17 intentional differences. The preceding `8ec99e0` has successful
[CI](https://github.com/eddolo/fountainjs/actions/runs/34083546807) and
[site deployment](https://github.com/eddolo/fountainjs/actions/runs/34083546803).

The optional block adapter is now implemented, including nested-container and
source-snapshot propagation, a default-off public demo control, and a recorded
HTML-block → rich editing → undo/redo → canonical Markdown → re-import workflow.
Local validation passed 768 tests in 78 files plus package, server-runtime,
headless-boundary, API, and performance gates, plus three sequential
Chromium/Firefox/WebKit demo checks. The recording and visually
inspected screenshots are under
`artifacts/manual-markdown-html-projection-20260907a/results/`.
At that block-adapter checkpoint, this did **not** close the larger raw-HTML
milestone: inline HTML token/mark projection and exhaustive
unsupported-element/conversion-loss reporting remained open. The then-current
oracle baseline was 563 matching / 80 pending / nine intentional differences.

The first raw-HTML boundary implementation now supplies all seven lexical
start/end classifiers in `src/core/markdown-html.ts`. Recognized blocks become
editable literal text and hard breaks, not executable HTML or accidentally
interpreted Markdown headings/lists. Top-level reference and footnote
extraction respect these opaque regions; the explicit details dialect stays
separate. The oracle additionally requires exact Fountain-to-Fountain canonical
round trips for all 44 official HTML-block examples, even while their rendered
HTML remains an explicitly pending semantic difference. Canonical export now
protects line-leading block syntax, authored edge whitespace, and consecutive
hard breaks. Nested list discovery now uses the same marker-relative item
collector as block parsing. Reference and footnote discovery recurse through
lists and quotes while preserving opaque HTML/fenced content. Real nested
definitions retain global lookup; definitions are consumed after container
boundaries are established instead of blanking out an item's first lines.
HTML inside lists/quotes cannot acquire outdented lazy paragraph content.
Opt-in block projection is available through the adapter above; full inline
projection and exhaustive HTML conversion-loss reporting remain pending.

The recorded incident-runbook workflow additionally exposed a browser/server
HTML import bug: both inserted a blank paragraph before valid list-first code,
headings, or nested lists. They now supply a paragraph only for an empty item;
explicit author-created blank paragraphs are retained. The recorded regression
imports via the public headless demo, pastes HTML into the Go-service demo,
edits a nested paragraph, undoes/redoes, and exports/reimports Markdown.
`tests/server-html-parity.test.ts` checks both importers directly.

### Empty paragraphs and caret hosts

The HTML-block adapter also preserves block boundaries inside unfamiliar
wrappers (for example, a custom element around two paragraphs and a list).
Previously both browser and server HTML import silently flattened those
descendants into one paragraph. The wrapper itself still has no equivalent
schema node unless registered, so server import reports
`unmapped-block-wrapper`; both public HTML conversion paths display the note.
Unchanged source snapshots still return the original wrapper source exactly,
while canonical Markdown exports the projected document, not the discarded
custom-element identity. That wrapper change alone did not implement inline HTML or change
the 563 matching / 72 pending / 17 intentional CommonMark classification.

Blank Markdown source lines are separators, not an unambiguous count of empty
paragraph blocks. Fountain's canonical export now preserves each empty
paragraph with an inert dialect marker:

```html
<p data-fountain-empty="text"></p>
```

`text` preserves the editor's empty text-caret child; `block` preserves a
childless paragraph. The importer recognizes only these exact standalone
forms (with up to three leading spaces and optional trailing spaces/tabs),
without evaluating HTML. Extra attributes or nonempty content do not qualify.
Inside code or another opaque HTML block the marker remains literal text.
Leading, consecutive, trailing, and nested blanks survive, including an empty
first paragraph followed by code inside a list. Empty pipe-table cells already
have a structural slot and keep ordinary table syntax.

This is a Fountain dialect, not a new CommonMark guarantee. A third-party
Markdown renderer must permit HTML to interpret these as paragraph elements;
its own CSS determines their visible height. Hosts that require marker-free
Markdown can explicitly accept the spacing loss:

```ts
const { markdown, losses } = MarkdownExporter.exportWithReport(doc, {
  emptyParagraphs: 'omit',
});
```

Each omitted paragraph is reported with its document path. Following code or
other blocks remain inside their list. There is no heuristic that deletes a
blank paragraph merely because it might be an automatically generated caret
host: once present in the document, default export preserves it. Existing
source snapshots still return unchanged original source exactly; the option
applies when a block is rendered canonically. Multiple redundant empty text
children are canonicalized with a loss report; arbitrary attributes/marks
remain subject to the existing format loss policy. JSON remains lossless
structured persistence. General safe raw-HTML projection is still pending.

Empty supported formatting runs use the existing inert styled-text envelope
instead of ambiguous delimiter-only strings such as `****` or empty backticks.
The envelope preserves nested/adjacent empty mark runs, including formatted
empty links; browser and server HTML import also retain empty formatting tags.
Typing into the corresponding blank inherits its marks. An explicit
`emptyParagraphs: 'omit'` request reports a styled blank's removal, but an empty
link is retained because its destination carries meaning. Unsupported custom
marks remain subject to the normal loss report.

The empty-formatting batch passed the complete 752-test gate and six targeted
Chromium/Firefox/WebKit contracts. A recorded public-demo conversion → rich
paste → type → undo → Markdown reimport audit passed under
`artifacts/manual-markdown-empty-marks-20260907a/results/`; the screenshot of
new text inheriting the saved bold style was visually inspected. This does
not change the CommonMark baseline or enable general raw-HTML execution.

The browser view gives childless text blocks a view-only placeholder without
changing JSON during render. Pointer or collapsed native-caret selection can
target the empty block, and typing fills it while retaining its node type and
attributes. This applies to paragraph, heading, and code blocks that accept
text; atom NodeViews do not receive invented caret content.

Verification on 2026-09-07: the complete `pnpm check` gate passed 733 tests.
Nine targeted Chromium/Firefox/WebKit contracts passed, including actual
typing, Backspace, Enter, and undo in imported empty containers. All five
recorded public-demo Markdown audits passed under
`artifacts/manual-markdown-empty-20260907b/results/`. The authored-spacing
workflow creates trailing blanks with Enter, preserves blanks before/after a
list's code block, exports/reimports Markdown, and pastes the result into a
fresh editor; its before/after JSON and paragraph counts agree, and the
rendered screenshots were visually inspected. The CommonMark baseline stays
at 563 matching, 80 pending, and nine intentional differences.

Nested-container verification on 2026-09-07: `pnpm check` passed all 717 tests,
package/headless/server-runtime contracts, semantic conformance, and build and
performance budgets. Two targeted browser contracts passed in Chromium,
Firefox, and WebKit (six runs), including typing and undo in a pasted list-first
code block. The recorded public-demo audit passed with video and screenshots
under `artifacts/manual-markdown-containers-20260907c/results/`; its edited
runbook screenshot was visually inspected. This is local evidence, not a claim
of complete CommonMark compliance or an npm release.

The eight formerly pending empty-container examples have exact-source and canonical
round-trip tests plus real Chromium/Firefox/WebKit typing, Backspace, Enter,
and undo coverage. These tests preserve the editable caret hosts; they do not
count those examples as new matches or erase author-created empty paragraphs.

The earlier Markdown baseline, including raw reference-label correctness,
container definitions, link precedence, full Unicode 17 case folding,
opaque-token scanning, nested image descriptions, nested emphasis,
rule-of-three arithmetic, repeated mark levels, unlike-marker overlap
precedence, exact GFM tilde-run boundaries, and unmatched-delimiter
preservation, was certified
by the complete 564-test package gate and green Chromium/Firefox/WebKit/mobile
[CI run for `0a7aef6`](https://github.com/eddolo/fountainjs/actions/runs/34004963074),
plus the corresponding successful
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34004963046).

The current baseline regression-locks 563 examples. List items now
use the actual marker width and tab-stop-aware padding, collect their physical
lines before parsing inline constructs, and retain lazy nested quote/list
continuations. Canonical export indents by the rendered marker width, separates
nested ordered lists starting above one, alternates markers for distinct
adjacent lists, and preserves every blank code line. An EOF line terminator no
longer becomes extra content inside an unclosed fence. The semantic oracle
removes only the reference HTML renderer's code terminator, not Fountain text.

`tests/manual/markdown-list-audit.spec.ts` records a numbered deployment
runbook through the public headless demo, standard rich clipboard paste into
the Go-service editor demo, nested editing, Enter, undo/redo, and Markdown
export/reimport. The check compares content after excluding host-generated
node IDs, which Markdown does not carry. The importer/exporter regression suite
also covers 128 marker-width/indent/padding combinations.

Empty link labels now preserve their link mark, destination, and title through
canonical Markdown export (official examples 484 and 487). Browser and server
HTML import also retain safe empty anchors and group top-level text/inline
markup around structural blocks instead of dropping surrounding text. Missing
and unsafe `href` attributes do not become active link marks.

## Escapes across Markdown layers

GFM table escaping runs before inline parsing: an immediately backslash-escaped
pipe stays in its cell even after another backslash. The table layer removes
only the final protecting backslash. This differs from the usual inline escape
parity rule; a code span must retain the other backslashes verbatim. Escaped
literal tildes likewise must not extend the adjacent strikethrough delimiter run.
`tests/markdown-combination-retention.test.ts` covers 420 text/mark/container
round trips and targeted boundary cases. Ten checked-in GitHub Markdown API
responses provide a GFM semantic reference (`github-escape-interactions-v1.json`),
compared through Fountain's server HTML importer rather than literal foreign-AST
equality. This is a targeted GFM check, not a full GFM/CommonMark certification.

## Security and collaboration

Raw Markdown and frontmatter are untrusted input. The snapshot does not execute
content. Unknown inline HTML remains readable literal text by default; its
attribute backslashes and entity spelling are not decoded as Markdown.
Character references are decoded before parsed URLs pass Fountain's
protocol policy, and the final model still passes full schema validation.

The separate opt-in inline adapter projects supported HTML scopes into the
model. Exact-source export can still recover omitted original tokens; never
render source-preserving Markdown as unsanitized live HTML.

The snapshot belongs to an import/export session rather than shared document
state. Collaboration synchronizes the structured Fountain document. A product
that collaboratively edits raw Markdown needs its own text-CRDT/source-mode
contract and must reparse deliberately; silently mixing a raw text authority
with Fountain's structured authority would create conflicting sources of truth.
