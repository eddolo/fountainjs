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

## Shared automatic direction

To retain `<section dir="auto">`, install this extension before importing. The
wrapper stores the automatic context; its children do not acquire independent
`dir="auto"` declarations. A Hebrew heading can therefore make the following
English paragraph inherit RTL, and replacing that heading with English changes
the whole section to LTR. The document core preserves the structure; the browser
resolves first-strong direction at render time, including after edits and undo.

Try **Create and edit sections** on the Node/Markdown demo: edit the first
section's heading, choose **Automatic** in its Direction menu, apply the section
properties, then preview for readers. Reader snapshots change only when you
refresh them. Recorded Chromium/Firefox/WebKit journeys verify both reading
directions, actual text alignment, undo/redo and independent reader snapshots.
The pure-Node tests retain nested fixed-direction sections and explicit left
alignment through JSON and canonical HTML reopening.

This does not resolve automatic direction in the headless core or preserve an
unsupported wrapper after flattening. Without the extension, the server report
identifies lost wrapper attributes/behavior; paragraphs are not assigned guessed
automatic directions. Full document-shell/body direction, unsupported wrapper
attributes, arbitrary CSS inheritance and inline bidi isolation remain separate
contracts. Removing a wrapper intentionally removes its shared direction too.

Baseline split-boundary audit (2026-10-08, before the scope fix): converting or lifting a middle item
from a list that owns `dir="auto"` splits/removes its shared context. Native
Chromium, Firefox and WebKit render unchanged English paragraphs differently
after that transform. Converting the entire list retains its context; converting
part of a directionless list inside an automatic section retains that section's
context. This is why a format-only split needs one neutral shared wrapper, not
independent `auto` attributes on fragments. See
`artifacts/auto-scope-boundary-audit-20261008.json`: twelve programmatic transforms
undo exactly, but six results retain a known direction gap. All 24 source/result
screenshots are visually checked. This is diagnostic evidence, not a passing
full-editor or mobile conformance gate; no scope-retention implementation is
introduced by this audit. Deliberate section unwrapping keeps its documented
property-removal contract.

### Format-only list splits

The default core schema now includes `direction_scope`, a neutral shared block
rendered as `<div data-fountain-direction-scope="" dir="auto">`. Converting a
middle list range or lifting its items keeps the prefix, changed blocks and
suffix inside **one** live automatic context. It does not assign `auto` to each
fragment or snapshot RTL onto English children. An independently directed item
keeps its own context when its item wrapper is removed. The document/transaction
engine does not compute first-strong direction; browsers resolve it after edits.

Sibling paragraphs/headings can be converted to lists inside their existing
parent, including this group, quotes and table cells. Selections, default
`nodeId` group identity and undo are retained. Schemas without the required group
capability and invalid or host-filtered final trees refuse the operation instead
of reporting success. Custom identity-attribute configurations are not certified
by the default-`nodeId` test.

`CoreExtension`, `CoreSchemaSpec` and StarterKit include the group. A custom
schema can register the exported descriptor as `direction_scope: directionScope`
from `fountainjs-editor/core`. No new browser dependency or renderer is required
for Node-only transforms, JSON, Yjs or canonical server HTML processing. The
marker rule declines unknown attributes rather than claiming they survived.

JSON is the exact persistence path. HTML preserves the shared context; Markdown
uses a reported HTML projection, not native CommonMark syntax. DOCX recursively
keeps the child blocks and numbering but reports `direction-scope-omitted` and
direction loss: Word layout is not certified by that export. Deliberate section
unwrapping still removes section properties. Moving a child to another parent
is a different operation and shared-auto reparenting remains open; wrapping that
child alone would not reproduce the old group's live first-strong behavior.

Supported inline `text-align` is a separate projection. Browser and server
importers now materialize the nearest supported ancestor declaration onto text
blocks, even if the surrounding wrapper is flattened. This includes anonymous
list/cell text and physical-left overrides. `inherit`/`unset` continue the inline
chain; `initial` resets alignment to `start`. No direction is guessed, and this
does not retain arbitrary wrapper styles or evaluate stylesheets, variables or
`match-parent`. The container module still declines unsupported style attributes
and reports its structural loss; preserving a paragraph's alignment does not
mean the original wrapper survived.

### Code buffers and direction

First-party `code_block` now supports an optional `dir` declaration. Use
`setTextDirection(editor, 'ltr' | 'rtl' | 'auto')` at a code caret/selection, or
the supplied **Code block and language → Code reading direction** setting.
Choose **Inherit from document** to remove the owned declaration. This changes
presentation, not the technical source, language, normalization or execution.
Code alignment remains a separate unsupported command; adding direction does
not turn code into ordinary prose.

Browser and DOM-free server HTML import preserve a code buffer's supported
owned declaration and fixed inherited direction when its wrapper is flattened.
Retained quotes/sections continue owning their shared context. HTML/JSON retain
the declaration; Markdown fences and DOCX cannot represent this code-direction
contract and report their projection/loss. Custom schemas must explicitly
declare the capability. No browser direction computation enters the core.

HTML also preserves disabled code line numbers with `data-line-numbers="false"`.
The default enabled setting emits no extra flag. Both browser and pure-Node
importers honor the flag; real internal copy/replace/paste checks retain it in
Firefox's HTML-only fallback. Previously this path silently enabled the gutter.
This is a code-setting retention contract, not arbitrary-attribute or identical
reader-theme certification.

For `dir="auto"`, native preformatted HTML resolves each source line's bidi
paragraph separately. The syntax-decorated block `code` child must also use
`unicode-bidi: plaintext`; checking only computed direction on `pre` missed a
real visual regression. Browser verification measures a Latin line against an
independent native source and exercises settings, typing, Enter/Backspace,
undo/redo and downloaded HTML reopening. This is not general bidi certification.

### Remaining automatic-scope gaps

Current-source follow-up: default live code themes now respond to retained solid
colour marks or owned block backgrounds, rather than placing copied black text
on a dark background. Explicit host themes win; no source or marks are stripped.
The native pasted-code contrast journey passes all three Windows browsers and
its nine PNGs are visually inspected. Conflicting mixed colours/custom CSS remain
host policy; this is not identical source styling or universal contrast approval.
The previous Linux checkpoint's twelve headed Xvfb controls transfer rich data
in native/rich event-authored cases. CI now runs the four clipboard workflows
serially against that display and the remainder headless, without new skips or
relaxed assertions. Complete partition/current-source Linux evidence is pending.

Native clipboard handoff: some browsers advertise rich HTML at `paste` but
provide it only in a subsequent cancelable `beforeinput`. Fountain defers just
that announced-but-empty case and reuses the sanitized importer; ordinary plain,
immediate rich, file and table-grid paths remain synchronous. A bounded fallback
keeps the original separated plain payload if no rich data arrives, reporting
`rich-html-unavailable`. Pending work is guarded by unchanged document/selection
and canceled for teardown, focus loss or another input. Explicit paste/beforeinput
plugin handlers still own their supported events. Non-cancelable native input is
not duplicated with a model write; that path is not native-device certification.
Three Windows desktop research-note journeys retain headings, marks, link,
RTL quote, literal code/table and undo/redo; source/theme pixel identity is not
promised. Copied black code marks on the dark theme remain a readability gap.
The final guarded-source regression passes nine cases / three existing Windows
WebKit event-authored clipboard skips; all 33 PNGs are inspected or exact matches
to reviewed captures. See `artifacts/native-rich-handoff-verification-20261008.json`
for the lifecycle, native-browser and remaining performance/transport evidence.

The Linux shared-scope checkpoint `a9af193` passes verification, performance,
Lean and Pages, but its structural browser preflight fails two WebKit rich-paste
restorations (55 passes / two failures). Plain text reaches the target; shared
rich structure does not survive. Copy-event `setData` alone is not proof of
native paste delivery. New diagnostics record delivered MIME payloads and use
an independent native control; no Linux skip or cached-text restoration is added.
The full browser matrix was not reached.

The subsequent `599deae` Linux run passes all nine code-direction journeys and
64 structural preflights, but retains the same two WebKit restoration failures.
All six failure/retry paste events contain exact plain text and no HTML/private
JSON. Native textarea controls reproduce missing rich MIME, but a textarea is
not sufficient evidence about contenteditable. The expanded diagnostic compares
native rich controls as well, preserving delivered formats and rendered bold
state independently of Fountain. Linux rich-control results remain pending;
these diagnostics do not count as passing Fountain restoration or justify a skip.
Windows WebKit's native rich control retains bold and exposes HTML at
`beforeinput`, despite empty HTML at `paste`. That event handoff needs a direct
Fountain audit; it is distinct from event-authored clipboard copies, which these
Windows controls find empty at both events. Do not label all native rich paste
unsupported based solely on its earlier event payload.

The subsequent `e68e41a` Linux run retains three WebKit clipboard failures
(66 preflight passes; the new code-copy case also fails). Independent native
contenteditable controls now lose bold in headless Linux WebKit as well: the
later HTML value is only the plain baseline. Therefore the Windows event-handoff
fix is not claimed to recover absent Linux source markup. Headed Xvfb controls
are a separate pending diagnostic, not a Linux skip or passing editor evidence.

A separate nested-boundary audit finds direction loss when lifting an automatic
list's child across parents or indenting it under an independently fixed item.
Fixed-direction and same-context controls retain direction; all twelve tested
transforms undo exactly. The six observed engine/case failures remain open.
Wrapping the moved child alone or freezing RTL would not preserve the original
group's live first-strong context. These diagnostic cases are not conformance
passes and do not certify native mobile devices.

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
