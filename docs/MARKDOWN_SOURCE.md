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

### Optional raw HTML block conversion

Raw HTML is inert literal text by default. To convert recognized HTML **blocks**
into editable schema nodes, supply the isolated HTML importer explicitly:

```ts
import { MarkdownImporter } from 'fountainjs-editor/core'
import { ServerHTMLImporter } from 'fountainjs-editor/html/server'

// `schema` is the schema already used by your application.
const imported = MarkdownImporter.parseWithSource(rawMarkdown, schema, {
  parseHTMLBlock(html, targetSchema) {
    const result = ServerHTMLImporter.parseWithReport(html, targetSchema)
    reportHTMLIssues(result.issues)
    return result.document
  },
  onHTMLBlockFallback(issue) {
    console.warn(issue.reason, issue.message)
  },
})
```

The adapter must be synchronous and deterministic, return a document from the
supplied schema, and own its URL/security and conversion-loss policies. It may
return `null` to retain literal source. Exceptions, invalid document structure,
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
blank-line-delimited source region must independently parse to exactly one node,
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

This preserves useful author choices such as Setext headings, closing ATX
markers, deliberate spacing, and unknown literal directives in untouched
blocks. Equal duplicates retain their own source only while their original node
identity survives; duplicated references, reconstructed equal nodes, loose
structures spanning blank lines, cross-block reference definitions, and changed
reference-style links remain canonical. Fountain does not use fuzzy matching or
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

The optional block adapter is now implemented, including nested-container and
source-snapshot propagation, a default-off public demo control, and a recorded
HTML-block → rich editing → undo/redo → canonical Markdown → re-import workflow.
Local validation passed 768 tests in 78 files plus package, server-runtime,
headless-boundary, API, and performance gates, plus three sequential
Chromium/Firefox/WebKit demo checks. The recording and visually
inspected screenshots are under
`artifacts/manual-markdown-html-projection-20260907a/results/`.
This does **not** close the larger raw-HTML milestone: inline HTML token/mark
projection and exhaustive unsupported-element/conversion-loss reporting remain
open. The default-policy oracle baseline is still 563 matching / 80 pending /
nine intentional differences.

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
custom-element identity. This does not implement general inline HTML or change
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

## Security and collaboration

Raw Markdown and frontmatter are untrusted input. The snapshot does not execute
content. Unknown inline HTML currently remains readable literal text; its
attribute backslashes and entity spelling are not decoded as Markdown.
Character references are decoded before parsed URLs pass Fountain's
protocol policy, and the final model still passes full schema validation.

The snapshot belongs to an import/export session rather than shared document
state. Collaboration synchronizes the structured Fountain document. A product
that collaboratively edits raw Markdown needs its own text-CRDT/source-mode
contract and must reparse deliberately; silently mixing a raw text authority
with Fountain's structured authority would create conflicting sources of truth.
