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
// retains exact frontmatter and intentionally canonicalizes the body.
const edited = MarkdownExporter.exportWithSource(editor.state, imported.source)
// edited.preservation === 'frontmatter' or 'canonical'
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
| `frontmatter` | The model changed; recognized frontmatter is exact and the body is canonical. |
| `canonical` | The model changed and no recognized frontmatter exists; normal canonical export is returned. |

An exact result can retain syntax Fountain does not understand because it does
not regenerate anything. It does **not** mean that unknown syntax entered the
structured model. After a visual edit, only features represented in the model
and exporter can survive.

## Current semantic baseline

The importer currently covers Fountain's documented Markdown projections plus
an initial standards-oriented set of behaviors:

- one-to-six-level ATX headings with up to three leading spaces and optional
  closing hashes;
- level-one/two Setext headings;
- indented code and variable-length backtick or tilde fences;
- safe URI and email autolinks inside angle brackets;
- underscore or star emphasis, strong emphasis, strike, code, and highlights;
- spaces or a backslash before a newline as a hard break;
- inline/reference links and images with titles;
- recursive blockquotes, tight/loose nested lists, and GFM-style tasks;
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

Passing this corpus is **not** a claim of complete CommonMark or GFM
conformance. Important remaining work includes:

- delimiter-stack-accurate emphasis and code spans;
- full entity/reference decoding rules;
- all HTML block/inline precedence and safe unknown-HTML policy;
- exact list marker, indentation, interruption, tight/loose, and lazy
  continuation rules;
- full link destination/title/reference precedence;
- GFM extended autolinks and strikethrough edge cases;
- a larger versioned subset tied to explicit specification examples;
- block-level source spans that can retain untouched source around a visually
  edited block.

Until those gates exist, documentation should say “supports these Markdown
features,” not “fully CommonMark/GFM compliant.”

## Security and collaboration

Raw Markdown and frontmatter are untrusted input. The snapshot does not execute
content. Parsed URLs still pass Fountain's protocol policy, and the final model
still passes full schema validation.

The snapshot belongs to an import/export session rather than shared document
state. Collaboration synchronizes the structured Fountain document. A product
that collaboratively edits raw Markdown needs its own text-CRDT/source-mode
contract and must reparse deliberately; silently mixing a raw text authority
with Fountain's structured authority would create conflicting sources of truth.
