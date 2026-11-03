# DOCX list-layout repair in progress

The retained scientific source and its native audit expose an 18 pt shift in
the first numbered instruction: source text begins at 75.7 pt; the exported
text begins at 93.7 pt. Source numbering uses a 360-twip text indent and hanging
indent, while the generated definition uses a 720-twip text indent. Reopening
also applies paragraph geometry on top of the browser list gutter.

This work is on `fix/docx-numbering-layout-20261103`, separate from the published
font repair. It is not yet a completed layout feature or release candidate.

## Portable geometry checkpoint

`ListLayout` is an optional attribute on `ordered_list`, `bullet_list` and
`list_item`, exported from the root/core entries. For a list, `indentStart` is
relative to its containing content box. An item override is relative to that
list's text origin. `markerOffset` anchors the marker relative to item text;
`firstLineIndent` controls the first text line independently. Lengths are points.
Marker styles, bounded prefix/suffix strings, alignment and optional font context
are validated data. Existing JSON without these optional attributes still loads.
Older readers need the updated schema to understand the new attributes.

```ts
layout: { unit: 'pt', indentStart: 18, markerOffset: -18, markerStyle: 'decimal' }
```

Word import resolves level properties, then moves indentation from the numbered
paragraph to this list/item owner. Native export reverses the coordinate change.
Nested lists and item overrides do not duplicate their parent's offset. An
existing saved paragraph indent is not automatically reinterpreted: without
provenance, it cannot safely be assumed to come from an older DOCX import.

Markers use CSS-generated content without extra editable DOM positions. Safe
HTML retains the typed data. Full HTML includes the same marker projection;
fragments retain native marker styles when a receiving client has no Fountain
stylesheet. Ordinary Markdown reports omitted list formatting/geometry.

The unchanged scientific source now measures 24 CSS pixels (18 pt) between body
and list text both before and after native download/reopen in all three desktop
engines. Recorded workflows also exercise backward selection, Enter,
Undo/Redo and Backspace in that list. The standalone HTML reader retains the
same offset; an independent native HTML surface without styles keeps numbering.
This does not certify an actual external application's clipboard processing.

The full HTML captures also expose existing unrelated gaps: equations remain
literal TeX instead of being typeset, and header/footer page-template fields
remain literal blocks in the linear reader. These require separate reader/export
work; the list checks do not establish full HTML visual fidelity.

The independent legacy-export expectations now put the same default 36 pt
nesting step and 18 pt marker outset on the list owner instead of duplicating
them on paragraphs. They still compare the complete expected document tree.
The original scientific fixture and numerical/native reference limits are
unchanged.

The final local checkpoint passes 3,460 unit tests in 245 files, the existing
performance/heap checks, framework types, built ESM/CommonJS entry contracts,
the 117-module headless boundary, and real Cloudflare workerd import/export/
reopen. The additive public API has 417 declaration files. Freezing the new
marker-style tuple changed its declaration snapshot; the mismatch was retained,
then the reviewed snapshot was updated and checked again successfully.

Three final headless desktop journeys pass with one worker, including loading
every reader image before capture. The captures retain the original list offset
through editing and reopen. Seven existing size ceilings currently fail (core
ESM/CJS, optional DOCX ESM/CJS, CSS, aggregate ESM/CJS). No code-size, performance,
heap, reference or assertion limits were widened for this checkpoint. The earlier
approved aggregate allowance is already present and is not a fresh allowance for
this unfinished feature.

## Earlier numbering-resolution checkpoint (df045ce)

The implementation now reads namespace-qualified numbering identities, abstract
levels and instance overrides. Paragraph styles inherit numbering through the
existing bounded style cascade. A direct level can refine an inherited
instance; direct instance references override styles. The standard's style-level
`ilvl` rule uses the abstract level's `pStyle` association. Word documents
unpredictable behavior for `ilvl` inside styles, so those inputs now carry an
explicit warning rather than a native-fidelity claim. `numId=0`
removes numbering. Real stylesheets do not acquire lists merely because a
style is named `ListNumber` or `ListBullet`. The legacy name fallback is
limited to inputs with no resolved stylesheet or numbering declaration.

Ambiguous identities, levels, overrides and style associations are rejected.
Unresolved references keep paragraph text and emit a located diagnostic.
Cycle/depth handling remains owned by the existing style cascade.

Twenty new Node contracts pass; 13 of the first 15 failed before the change.
The complete focused DOCX set passes 458 tests / 30 files. Build and framework
types pass. Full units pass 3,433 tests / 242 files; API (415 declarations),
headless (115 modules) and packed loading pass. Three recorded public conversion
lab runbook journeys pass in Chromium, Firefox and WebKit, including native
typing/history/download/reopen. Six captures were inspected. Independent
python-docx loading and direct XML inspection confirm the numbering and removal
in all three actual downloads. An initial journey locator wrongly required the
unchanged ending text after typing; its failure is retained separately from the
corrected final journeys.

At that earlier checkpoint, read-only native Range measurements exposed a 24-CSS-pixel rightward movement
of the first instruction on reopen. The new numbering tests do not approve that
geometry. The measured captures are byte-identical to the six reviewed captures.
That implementation exceeded four existing code-size caps;
no limits have been changed and this branch must not be merged as a release.

These rules follow Microsoft's [numbering reference/removal contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.numberingid?view=openxml-3.0.1)
and [style-to-level association contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.numberingproperties?view=openxml-3.0.1).
The paragraph cascade uses Word's documented ordering (paragraph styles before
numbering, then direct formatting), which differs from ISO's generic order:
[Word hierarchy notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/f20aa1bd-46a8-4833-bf1c-ee47082e12ba),
[style-level caveat](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/6a8f14ff-df90-4154-9bc9-e0e88ae5e641).

## Remaining acceptance work

1. Verify the new geometry owner against independent native source/export
   rendering. The original 18 pt profile passes browser download/reopen checks;
   this does not establish all Word list geometry or marker behavior.
2. Keep multi-paragraph list-item ownership on native reopen. Numbering-level
   declarations, styles, direct overrides and per-item offsets now have focused
   contracts; ordinary unnumbered continuation paragraphs still need a reliable
   ownership boundary rather than an indentation heuristic.
3. Preserve contextual spacing without silently converting its automatic rule
   into unrelated host margins. Cover adjacency changes during real editing.
4. Preserve or explicitly report marker formats/templates, alignment, suffixes,
   restarts and unsupported numbering effects. Font-dependent marker width and
   tab advancement (long prefixes, large counters or a marker wider than its
   gutter) are not modeled by the current fixed-coordinate projection. Retained
   marker declarations alone do not prove those cases look like Word.
5. Exercise nesting, custom starts, removal, lists in tables and mixed blocks
   through typing/history, native download and reopen. Inspect the editor and
   independent source/export rendering, with the original source unchanged.
6. Complete size/package/runtime checks and the current-source cloud gate
   before release. Any new capacity proposal must be based on the finished,
   reviewed implementation rather than this intermediate measurement.

The original fixture, native findings and separate header/footnote discrepancies
remain recorded in [the native audit](DOCX_NATIVE_AUDIT.md) and
[`docx-list-indent-audit-20261103.json`](../artifacts/docx-list-indent-audit-20261103.json).
