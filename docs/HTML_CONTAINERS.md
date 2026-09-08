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
becoming fake paragraphs. An application authoring an empty container should
provide an initial paragraph; this module does not add a container toolbar or an
empty-container caret policy.

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

Local verification passes 1,694 tests / 131 files, compiled server and headless
checks, public API/package contracts, the complete existing CommonMark profiles,
framework types, performance and size checks. The new journey passes in Chromium,
Firefox and WebKit. Its separate recording, public option screenshot and edited
section/reader comparison were visually inspected. The site build passes with
the existing optional math chunk warning. Evidence is retained in
`artifacts/html-containers-final-check.log`, `html-containers-browsers.log`,
`html-containers-recorded/` and `html-containers-site-build.log`.

No runtime dependency was added. The public declaration graph is 389 files.
Aggregate runtime size is 1400.2 KiB ESM / 1163.8 KiB CJS, with reviewed caps of
1401/1164 KiB; individual entry, stylesheet and performance caps are unchanged.
These are source/site changes, not a new npm release over `0.4.0-beta.1`.
