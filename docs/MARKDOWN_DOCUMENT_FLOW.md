# Whole-document Markdown HTML conversion

Experimental, Unreleased source work, 2026-09-08. This is an optional import
policy, not a new document engine, a different AST, or full CommonMark mode.

## Why a document boundary is needed

Converting each paragraph separately closes its HTML scope at the paragraph
boundary. For example, a raw opening `<a>` or `<b>` in one paragraph can affect
later paragraphs in the HTML that a CommonMark renderer produces. An inline
adapter alone cannot represent that document-wide behavior.

`parseHTMLDocument` lets one root adapter see the complete supported syntax
stream before any local HTML conversion. It reuses the existing protected-node,
source-projection and safe server-import infrastructure. Fountain's native
schema remains unchanged; no CommonMark AST is used as its storage format.

```ts
import { MarkdownImporter, MarkdownExporter } from 'fountainjs-editor/core';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

const imported = MarkdownImporter.parseWithSource(markdown, editor.state.schema, {
  parseHTMLDocument(segments, schema, context) {
    const result = new ServerHTMLImporter()
      .parseTextBlockFlowWithReport(segments, schema, context);
    showConversionDetails(result.issues);
    return result.nodes;
  },
  onHTMLFlowFallback: issue => showFallback(issue),
});
const saved = MarkdownExporter.exportWithSource(imported.document, imported.source);
```

For callers not needing conversion details, the callback can be
`parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow`.
`HTMLContainerExtension` is still separately required to retain supported
section wrappers and attributes. It is not automatically installed by this API.

## Contract and precedence

- All HTML options remain off by default.
- `parseHTMLDocument` takes precedence over `parseHTMLFlow`, `parseHTMLBlock`,
  `parseHTMLParagraph` and `parseHTMLInline`. Those callbacks do not run first.
- Nested lists and quotes capture their pristine syntax. Only the root invokes
  the document adapter; no child conversion is committed separately.
- The callback receives frozen flow segments and lazy recursive source context.
  It runs when supported source blocks contain actual HTML tokens. HTML-looking
  code literals and ordinary Markdown do not activate it.
- Source support covers the existing paragraph/heading/code/list/quote/task
  projection. Unsupported blocks remain explicit. HTML only inside a block with
  no supported source representation (for example a pipe-table cell) does not
  independently activate the callback. This is not a universal rendering stream.
- Return same-schema block nodes, an empty array, or `null`. Invalid results,
  exceptions and refusals retain the entire inert document, not a mixture of
  converted children and unconverted parents. `onHTMLFlowFallback` reports the
  refusal. Exceptions from that reporting callback propagate to the host.
- The supplied server adapter checks protected inline nodes, source provenance,
  tasks, metadata and limits. It refuses unsupported structural projections and
  active raw-text contexts such as script/style/iframe instead of executing them.
  Other unsupported HTML may be projected with explicit loss reports. A custom
  adapter still owns its own conversion and sanitization policy.

## Source retention is not layout fidelity

`parseWithSource` still preserves the exact original JavaScript string while the
complete document is unchanged, including LF/CRLF and frontmatter. An edit uses
canonical Markdown (with frontmatter where applicable), not independently reused
source blocks: an HTML scope may originate in a different paragraph, so splicing
the old source blocks could corrupt it. Undo restores exact source reuse when
the original document is restored. Use the editor's schema for parsing; snapshots
are attached to their original model/schema, not arbitrary reconstructed types.

HTML reconstruction can create whitespace-only formatted content between or
after paragraphs. Fountain currently represents such content as a paragraph to
keep the marks and link data. The server reports `formatted-whitespace-block`.
**That paragraph can add editable/reader spacing that the reference HTML does
not have. This layout gap is still open.** The recorded audit explicitly compares
two reference paragraphs against three Fountain paragraphs for a cross-paragraph
link. It does not hide the extra node or call the layouts identical.

Other remaining limitations include comments, arbitrary/unknown HTML identities
and attributes, active HTML behavior, unsupported tables/custom blocks in source
projection, and the documented URL, empty-caret and literal-autolink policies.
The existing identity-preserving flow API remains available when changing block
identity/grouping is unacceptable.

## Evidence and public example

In the [conversion demo](https://eddolo.github.io/fountainjs/demos/node-markdown.html),
choose **Convert HTML across the complete document**. The four local HTML options
are disabled while it is selected, and their saved settings return when it is
turned off. JSON/HTML output and actual conversion warnings remain inspectable.

The separate baseline `tests/fixtures/markdown/commonmark-document-flow-v1.json`
requires **599/652** reference-semantic matches with this callback and optional
container schema, for both LF and CRLF. All 652 cases also undergo independent
exact-source checks, totaling 1,304. The unchanged neutral comparator compares
HTML meaning, not native AST equality, and its existing corruption sensitivity
and runtime-dependency checks remain active. Reference HTML is never executed to
improve a score. This combined profile does not replace the default 563/652,
identity-preserving 579/652, or older source-recovery 580/652 baselines.

`tests/markdown-document-flow.test.ts` covers cross-paragraph links, nested
structure, adapter precedence, code literals, edit/undo/source reuse, invalid
results, full fallback, metadata rejection and explicit layout reporting.
The compiled Node/workerd fixture also exercises a link across paragraphs.

`tests/browser/markdown-document-journey.ts` exercises the public option,
disabled local controls and safe fallback, then edits a real editor, saves
canonical Markdown and undoes back to exact source. Static sandboxed reader
frames compare Fountain output to HTML generated by the development-only
CommonMark reference parser. The manual counterpart records the journey.

Verification on 2026-09-08: the complete check passed 1,730 tests across 133
files, plus compiled-runtime, API, package, reference and build-budget checks.
Nine focused browser checks passed across Chromium, Firefox and WebKit. The
recorded Chromium journey and its editor/source/reader screenshots were reviewed
visually. The sample's readers have similar visible spacing with the supplied
plain CSS; its extra whitespace paragraph is more apparent in the editable view.
This is evidence for the stated behavior, not certification of identical layout.

The previous online browser run also exposed an ambiguous glossary-export status
selector after the section workshop added a second status region. That assertion
now targets the export status. The conversation journey waits for the second
reply to finish before clearing history. These six checks passed across the three
desktop engines; the full remote suite remains a separate publication gate.
