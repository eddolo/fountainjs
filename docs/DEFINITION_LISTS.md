# Definition lists and glossaries

Unreleased: `CoreExtension` and `StarterKit` include native `definition_list`,
`definition_term` and `definition_description` nodes. Terms and descriptions are
separate editable containers, not adjacent text runs in one paragraph.

Try the [issue workflow](https://eddolo.github.io/fountainjs/issue-editor.html).
Use **Insert definition list**, type the term, then click the indented description
and type its content. With the caret in a list, **Add term and description** adds
a pair and focuses its term. **Delete definition list** removes the selected list;
Undo restores it. Enter and Backspace split/join paragraphs inside an entry.
Use the contextual controls to add pairs or remove the list; Enter is not an
automatic term-to-description or next-pair shortcut.

## Engine and host controls

```ts
import {
  insertDefinitionList, appendDefinitionPair, deleteDefinitionList,
} from 'fountainjs-editor/core';

insertDefinitionList(editor, 'Latency', 'Time to respond.');
appendDefinitionPair(editor, 'Throughput', 'Work per second.');
deleteDefinitionList(editor);
```

These are ordinary document transactions, with no browser dependency in the
commands. The host supplies the schema and history plugin. Read-only editors
refuse the mutations. Insertion follows the generic block insertion convention:
after the selected top-level block, rather than an implicit inline replacement.
Appending targets the innermost active list. Deleting a sole nested list leaves
an editable paragraph in its parent instead of an invalid empty container.

The React toolbar exposes `definition-list`, `append-definition` and
`delete-definition-list` action IDs. Existing `hiddenActions`, `actionLabels`,
`actionIcons`, `actionOrder` and `renderAction` customization applies. Other
interfaces can call the same commands with their own controls.

The three node specs are also exported as `definitionList`, `definitionTerm`
and `definitionDescription` for custom schemas. Both item types contain `block+`;
the list contains `(definition_term | definition_description)*`. This preserves
multiple terms/descriptions and allows incomplete groups while authoring. It is
not a strict HTML-authoring conformance validator. Item nodes cannot escape into
ordinary `block+` positions. An imported empty list remains empty; a newly
inserted pair always has two editable paragraphs.

## Import, source and handoff

- Browser `HTMLImporter` and DOM-free `ServerHTMLImporter` use the same structural
  projection for `dl`, `dt` and `dd`. Nested paragraphs, lists, marks and supported
  media use the normal schema and URL policy. Empty terms/descriptions gain a
  caret paragraph. Registered item parse rules can retain host-defined attributes.
- HTML permits multiple names/descriptions, and grouping `div` wrappers. The
  latter are unwrapped in order; the server report explicitly warns that their
  wrapper identity/attributes were removed. See the
  [HTML definition-list model](https://html.spec.whatwg.org/multipage/grouping-content.html#the-dl-element).
- Unexpected list content declines semantic list conversion and follows the
  existing readable fallback, with server loss reports. Orphan terms/descriptions
  retain separate block boundaries. No content is silently selected away to
  manufacture a valid list. Browser paste has no server-style loss report API.
- JSON retains the typed structure. HTML emits semantic `dl`/`dt`/`dd`, including
  the usual optional standalone stylesheet. Custom attributes still require a
  matching receiving schema and explicit parse/output rules.
- CommonMark has no native definition-list syntax. Markdown export uses a compact
  HTML block and reports the need for an HTML-enabled receiving importer. It does
  **not** imply universal Markdown or DOCX/TeX fidelity. DOCX now has an
  [experimental typed glossary handoff](DOCX_GLOSSARIES.md); native layout and
  complete third-party save retention remain unverified. Plain-text export and the
  clipboard separate entries with line breaks; plain text cannot retain roles.
- The issue demo opts into **tables and definition lists only** when reopening
  HTML-bearing Markdown. Unrelated HTML remains inert. General consumers choose
  their own `parseHTMLBlock` policy; the default Markdown importer is unchanged.

```ts
import { MarkdownImporter } from 'fountainjs-editor/core';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

const document = MarkdownImporter.parse(markdown, schema, {
  parseHTMLBlock: (html, target) => ServerHTMLImporter.parseFragment(html, target),
});
```

That example opts into schema conversion for all HTML blocks, not live HTML
injection. Use a narrower policy like the issue demo when appropriate. Unknown
attributes/extensions, arbitrary CSS, complete review state and other format
boundaries are not made lossless by this feature.

## Evidence

`tests/definition-lists.test.ts` checks the platform-neutral model, malformed
fallbacks, nesting, export and explicit format warnings.
`tests/definition-list-editing.test.ts` checks browser/server agreement,
transactions, history, read-only refusal, nested deletion and custom attributes.
The compiled Node/workerd smoke fixture checks a Markdown/HTML round trip without
fake browser globals. `tests/browser/definition-list-journey.ts` drives the actual
issue workflow; `tests/manual/definition-list-audit.spec.ts` records it. Paste and
copy payload tests are not operating-system clipboard certification, and narrow
viewports are not physical mobile-device certification.

Verified 2026-09-08: full `pnpm check` passes **1,633 tests / 126 files**, compiled
Node/workerd checks, types, API, package, performance and size gates. All nine
selected browser cases pass: glossary, paragraph recovery and styled HTML handoff
in Chromium, Firefox and WebKit. The separate recorded glossary journey passes;
its video overview, author/reader views, narrow view and standalone HTML export
were visually inspected. The initial Firefox export-test failure came from
replacing HTML without unloading the live application; the corrected test opens
the export in a fresh document. No assertions were weakened to accept that result.

Local evidence: `artifacts/definition-final-contract-check.log`,
`artifacts/definition-verified-browsers/`, `artifacts/definition-recorded/` and
`artifacts/definition-site-build.log`. The production site build passes, retaining
the existing large optional MathJax chunk warning. The additive public declaration
graph is 387 files. No dependencies were added. Runtime totals are 1,393.6 KiB ESM
and 1,158.3 KiB CJS, with documented aggregate caps of 1,394/1,159 KiB; individual
entry, stylesheet and performance caps did not change. CommonMark remains
563/652 default and 579/652 with opt-in block/inline HTML, not full conformance.
These are source/site results, not a new npm release over `0.4.0-beta.1`.
