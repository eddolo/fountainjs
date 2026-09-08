# Glossary handoff through Word

Unreleased source change, 2026-09-08. DOCX export now preserves supported
definition-list content as editable Word blocks instead of collapsing the entire
glossary into one plain-text paragraph. Reopening a valid Fountain glossary
restores its term and description roles from the visible Word content.

This is an experimental interchange contract, not exact Fountain persistence or
certified Word page fidelity. Keep Fountain JSON for the complete document.

## Representation

`definition_list`, `definition_term` and `definition_description` use nested
block-level Word content controls. Their tags are respectively
`urn:fountainjs:docx:definition:list:v1`,
`urn:fountainjs:docx:definition:term:v1` and
`urn:fountainjs:docx:definition:description:v1`. Controls have human-readable
aliases and unique numeric IDs, but IDs are not Fountain node identities.

The content is ordinary Word paragraphs, numbering, tables and supported media.
Terms use a bold paragraph style; description paragraphs are indented. Nested
paragraph indentation accumulates. These presentation styles do not add strong
marks to the imported content. Specialized heading/code/quote styles remain
specialized. Tables and images retain their own existing export presentation;
this does not provide a general container-layout engine.

No original glossary JSON is embedded. Changing displayed text changes the
reimported document; duplicate control IDs do not restore stale text. Multiple
terms/descriptions, incomplete authoring groups and nested lists are supported.
Empty Word paragraphs reopen using the DOCX importer's empty-paragraph form,
which need not contain the HTML importer's zero-length text node.

The OOXML representation uses Microsoft's documented
[block content controls](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sdtblock?view=openxml-3.0.1)
and [block content containers](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sdtcontentblock?view=openxml-3.0.1).
Fountain's versioned role tags are its own convention, not a Word glossary
standard or Word's separate building-block glossary document part.

## Validation and fallback

The importer accepts exact namespace-qualified tags, one properties container,
one content container, and only alias/ID/tag properties. A list must contain
term/description controls directly. The receiving schema must validate the
restored nodes. Known visible child blocks follow the existing bounded importer.

Missing/unknown/version-changed tags, orphan roles, unexpected list children,
locks, bindings or other control properties use the ordinary readable projection
with explicit control-loss warnings. Missing/incompatible host roles produce
`definition-schema-fallback`. Each entry's visible content is parsed once even
if deeply nested roles cannot be restored. Foreign control lookalikes are not
interpreted as Word. Existing XML, ZIP and media resource limits still apply.

This does not implement forms, data bindings, access control or execution. It
does not install an extension from a tag. Unsupported child content retains the
existing warnings and limitations; role restoration cannot make that content
lossless. A third-party editor that strips tags cannot retain typed roles.

Every glossary export reports `definition-docx-experimental`. Custom role
attributes/marks produce `definition-metadata-omitted`. A glossary inside a
numbered/bulleted item reports `definition-list-numbered-context`: its roles can
survive while its enclosing item relationship does not. That relationship and
complete native Word save/layout testing remain open.

The public Word conversion demo displays the actual distinct export warning
messages alongside the count after downloading, including this experimental
boundary. Import details and export details refer to their separate operations.

## Verification

- `tests/docx-definition-lists.test.ts` checks roles, rich paragraphs, nested
  lists and tables, empty entries, visible external edits, namespace aliases,
  altered/missing controls, host-schema fallback and bounded nested parsing.
- `scripts/check-docx-interoperability.mjs` opens the exported archive with
  independent `python-docx`, checks role tags, edits displayed text, saves it and
  verifies that compiled Fountain reimports the edit and roles. This is
  structural interoperability, not native Word UI verification.
- `tests/browser/docx-glossary-journey.ts` compares the original export in
  independent `docx-preview` with the actual editor, checks term emphasis and
  description indentation, edits, undoes/redoes, downloads, and reopens the file
  through the public Word conversion demo. The manual counterpart records it.

The initial recorded comparison was visually inspected. Both surfaces show the
glossary structure and numbering, but heading sizes and paragraph spacing differ;
pixel equality is not claimed. As recorded in the preceding control audit,
`docx-preview` drops controls inside table cells. Nested table-cell glossary
retention is covered structurally, not certified by that viewer.

The documents skill's packaged renderer was attempted again; the Windows runtime
has no bundled LibreOffice. `artifacts/docx-glossary-native-render.log` retains
the failure. Native Word/LibreOffice page layout remains unverified. QA DOCX files
are internal fixtures, not certified final document deliverables.

Final local verification: `pnpm check` passes 1,677 tests / 129 files, compiled
headless/runtime, API/package, independent producer, framework types, performance
and size checks. Six final browser checks pass in Chromium, Firefox and WebKit
(glossary plus the preceding generic-control handoff). The final separate recorded
journey and site build pass; the public export-warning screenshot was inspected.
The existing optional math chunk warning remains. Evidence is retained under
`artifacts/docx-glossary-final-check.log`, `docx-glossary-final-regressions.log`,
`docx-glossary-final-recorded/` and `docx-glossary-site-build.log`.

No dependencies or public signatures changed. The optional DOCX entry measures
74.8 KiB ESM / 60.1 KiB CJS; its reviewed caps are 75/61 KiB. Aggregate totals are
1398.5/1162.3 KiB with caps of 1399/1163. Other entry, stylesheet and performance
ceilings are unchanged. CommonMark's separate 563/579/580 profiles are unchanged.
These are source/site changes, not a new npm release over `0.4.0-beta.1`.
