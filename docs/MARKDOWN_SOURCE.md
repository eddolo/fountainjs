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

```ts
import {
  CoreSchemaSpec,
  MarkdownExporter,
  MarkdownImporter,
  Schema,
} from 'fountainjs-editor/core'

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
- tab-stop-aware indented code after zero to three leading spaces;
- `-`, `*`, and `+` bullet markers plus both ordered-list delimiters, with a
  marker-style change preserving the boundary between adjacent lists and only
  a `1`-starting ordered list allowed to interrupt an open paragraph; ordered
  markers use one to nine digits, preserve a zero start through Markdown and
  browser/server HTML, keep continuation markers inside that bound, and accept
  empty list items without requiring whitespace after a bare marker;
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
classifies every example: 446 currently match, 197 remain pending, and nine are
intentional default-policy/GFM divergences. A regression, unclassified case, or
newly matching case fails the gate and requires an explicit baseline review.
The harness also materializes the specification's visible tab notation before
either side is parsed, so those cases exercise real tab characters.

Passing this corpus is **not** a claim of complete CommonMark or GFM
conformance. Important remaining work includes:

- the remaining delimiter-stack emphasis cases beyond the flanking,
  rule-of-three, nesting, and overlap baseline;
- all HTML block/inline precedence and safe unknown-HTML policy;
- exact list marker, indentation, interruption, tight/loose, and lazy
  continuation rules;
- full link destination/title/reference precedence;
- additional strikethrough delimiter-stack cases;
- configurable handling for CommonMark's arbitrary URI schemes without
  weakening Fountain's default safe-URL policy;
- promotion of the remaining explicitly classified oracle cases as their
  semantics become supported;
- deeper-structure source mapping without attaching raw text to the wrong node.

Until those gates exist, documentation should say “supports these Markdown
features,” not “fully CommonMark/GFM compliant.”

The current Markdown baseline, including raw reference-label correctness,
container definitions, link precedence, full Unicode 17 case folding,
opaque-token scanning, nested image descriptions, nested emphasis,
rule-of-three arithmetic, repeated mark levels, unlike-marker overlap
precedence, exact GFM tilde-run boundaries, and unmatched-delimiter
preservation, is certified
by the complete 514-test package gate and 295-pass
Chromium/Firefox/WebKit/mobile
[CI run for `36fc481`](https://github.com/eddolo/fountainjs/actions/runs/33991664306),
plus the corresponding successful
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33991664261).

## Security and collaboration

Raw Markdown and frontmatter are untrusted input. The snapshot does not execute
content. Character references are decoded before parsed URLs pass Fountain's
protocol policy, and the final model still passes full schema validation.

The snapshot belongs to an import/export session rather than shared document
state. Collaboration synchronizes the structured Fountain document. A product
that collaboratively edits raw Markdown needs its own text-CRDT/source-mode
contract and must reparse deliberately; silently mixing a raw text authority
with Fountain's structured authority would create conflicting sources of truth.
