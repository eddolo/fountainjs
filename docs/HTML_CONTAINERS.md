# Optional HTML section containers

Unreleased source change, 2026-09-08. `HTMLContainerExtension` preserves supported
HTML wrapper structure during import instead of flattening every section into
its child paragraphs. It is optional: installing Fountain or StarterKit does not
activate it or change Markdown's inert-HTML default.

```ts
import { HTMLContainerExtension, composeExtensions, Schema,
  MarkdownImporter, MarkdownExporter } from 'fountainjs-editor/core';
import { StarterKit } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

const kit = composeExtensions([...StarterKit.extensions, HTMLContainerExtension]);
const schema = new Schema(kit.schema);
const imported = MarkdownImporter.parseWithSource(source, schema, {
  parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow,
  parseHTMLInline: ServerHTMLImporter.parseInline,
});
const exact = MarkdownExporter.exportWithSource(imported.document, imported.source);
```

For HTML input, use `ServerHTMLImporter.parseWithReport(html, schema)` directly.
The same `parseHTML` rules work with the browser `HTMLImporter`. You can also
import the public `htmlContainer` node specification and use it in your own
schema. The portable core module has no DOM or rendering-service dependency.

## What it preserves

The `html_container` node has `block*` content and a validated `tag` attribute:
`div`, `section`, `article`, `aside`, `nav`, `main`, `header`, `footer`, or
`address`. Children remain normal editable Fountain blocks, including nested
containers, headings and lists. Empty source wrappers remain empty rather than
becoming fake paragraphs. The optional authoring commands explicitly create a
paragraph when requested; import never manufactures one automatically.

Supported attributes are `id`, `className` (HTML `class`), `title`, `lang` and
`dir`. String values are bounded and control characters are rejected; direction
is empty, `ltr`, `rtl` or `auto`. Imported classes use the host's CSS, so the host
owns the visual meaning of class names and must manage IDs when rendering the
same document multiple times. This is not a CSS/layout preservation module.

The generic rules have priority 10, below normal host-specific rules. For example,
an application's `aside[data-alert]` parser can remain authoritative. Unknown
attributes, including arbitrary styles, data attributes and event handlers,
decline the generic wrapper; the server importer retains supported descendants
and reports the removed wrapper. It does not silently claim those attributes
survived. The browser importer shares the projection but has no server-style
conversion report API.

Rules use the additive optional `HTMLParseElement.getAttributeNames()` API. Both
the DOM-free adapter and browsers provide it. A custom adapter without enumeration
cannot verify the whitelist, so these rules decline it. Attribute enumeration
does not expose DOM nodes, events, selection or layout.

## Authoring without changing the engine

The module registers three commands in `HTMLContainerExtension.commands` and
exports the same functions from the root and `fountainjs-editor/core` entries:

```ts
import { insertHTMLContainer, appendHTMLContainerParagraph,
  unwrapHTMLContainer, setNodeAttributes } from 'fountainjs-editor/core';

insertHTMLContainer(editor, { tag: 'section', title: 'Next steps' });
appendHTMLContainerParagraph(editor, [1]);
setNodeAttributes(editor, [1], { title: 'Follow-up', lang: 'en' });
unwrapHTMLContainer(editor, [1]);
```

Paths above are examples, not stable IDs. Resolve them from the current document
immediately before invoking a command, particularly with concurrent edits.
Insertion happens **after the active top-level block**, even when the caret is
nested, and does not delete the selected content. It creates an initial paragraph
and focuses it. Appending works for empty or populated containers and keeps their
properties. Updating properties uses the existing validated attribute command.

Unwrapping replaces the chosen container with its children, preserving their
rich structure and attributes. The removed wrapper's own properties are removed.
An empty container becomes an editable paragraph. A text range entirely within
the container keeps its offsets; a selected descendant node keeps its selection.
Other selections move to the first resulting text leaf or node. Incompatible
parent schemas are refused. The three commands respect editor read-only state
and rejected host transactions, and accepted changes use ordinary undo/redo.
Read-only UI is not server-side authorization.

The public [authoring workshop](https://eddolo.github.io/fountainjs/demos/node-markdown.html#section-authoring)
provides a section picker, property inputs, insert/append/unwrap controls,
undo/redo and an isolated static reader snapshot. This is a separate draft, not
the conversion result above it. Changing parser options does not reset it. The
reader has no authoring controls or scripts; later edits require a new preview.
Outlines are this demo's CSS, not document data. No universal section toolbar,
automatic click-to-edit policy for empty wrappers, or general wrap-selection
command is implied.

Authoring regressions also found and fixed two retention bugs: both HTML parsers
must try block children before accepting an empty inline interpretation of
`block*` content, and plain-text clipboard serialization must separate a section's
child blocks with newlines. Empty paragraphs, nested empty wrappers and dividers
now survive the block-first import path.

## Export and safety boundaries

HTML export retains supported tags and attributes through the existing safe
schema renderer. Markdown canonical export writes an HTML block and explicitly
reports the need for an HTML-enabled receiving schema. Original-source export
remains a separate exact-string contract, not a sanitizer.

Scripts, iframes, raw CSS and executable attributes are not container types.
Existing unsafe-content handling remains unchanged: readable script source may
remain as inert text with conversion warnings; it is not executed. This module
does not sanitize an entire website, preserve arbitrary HTML, restore comments,
or implement permissions. DOCX/TeX do not acquire a matching container format
contract; existing fallbacks and reports still apply. Use Fountain JSON for exact
typed persistence with the receiving extension installed.

## Try it and verify it

In the [server conversion demo](https://eddolo.github.io/fountainjs/demos/node-markdown.html),
enable **Preserve HTML section containers**. For Markdown, enable the relevant
HTML conversion separately. Compare the JSON before/after enabling the extension,
then add an unsupported wrapper attribute to see the readable fallback report.

`tests/html-containers.test.ts` checks neutral runtime behavior, nesting, supported
attributes, empty wrappers, source/canonical handoff, unsafe input and host rule
priority. `tests/html-containers-browser.test.ts` checks browser/server agreement.
The compiled Node/workerd fixture checks the extension without a fake DOM.

The unchanged CommonMark neutral comparator now separately verifies 13 official
HTML-container examples with LF and CRLF: 26 semantic plus 26 exact-source checks.
Those checks require this optional schema and do not raise the existing default
563/652, identity-preserving 579/652, or source-recovery 580/652 scores. The whole
652-example checks remain active. This is not full CommonMark conformance.

`tests/browser/html-container-journey.ts` exercises the public checkbox and
fallback, then edits a real nested section, creates a paragraph, undoes/redoes,
and verifies reader HTML. The manual counterpart records the journey. The audit
outlines wrappers for inspection; that theme is not imposed by the module.

The follow-up authoring tests add insertion without selection loss, nested
unwrapping, attribute changes, empty-container undo, selected atoms, invalid
paths, read-only/filter rejection and strict parent-schema rejection. The
compiled Node/workerd fixture now also calls the authoring commands. The public
journey uses real keyboard copying and inspects the resulting plain/rich formats;
it is not a claim that every external editor was tested.

Local verification passes 1,714 tests / 132 files, compiled server and headless
checks, public API/package contracts, the complete existing CommonMark profiles,
framework types, performance and size checks. Import/edit and authoring journeys
pass in Chromium, Firefox and WebKit (six checks), as do six existing public
conversion regressions. Two separate journeys are recorded. The authoring video
overview, visible editor and reader screenshots, and narrow-screen property
controls were visually inspected. A full-component screenshot initially showed
an unpainted off-screen iframe; the final journey explicitly scrolls the reader
into view and captures its visible output rather than accepting DOM text alone.
The site build passes with the existing optional math chunk warning. Evidence:
`artifacts/section-authoring-final-check.log`, `section-authoring-final-tests.log`,
`section-authoring-verified-final.log`, `section-authoring-regression.log`,
`section-authoring-recorded-final/` and `section-authoring-site-build.log`.

No runtime dependency was added. The public declaration graph is 389 files.
Aggregate runtime size is 1402.5 KiB ESM / 1165.9 KiB CJS, with reviewed caps of
1403/1166 KiB; individual entry, stylesheet and performance caps are unchanged.
These are source/site changes, not a new npm release over `0.4.0-beta.1`.
