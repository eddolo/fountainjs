# DOCX list-layout repair in progress

The retained scientific source and its native audit expose an 18 pt shift in
the first numbered instruction: source text begins at 75.7 pt; the exported
text begins at 93.7 pt. Source numbering uses a 360-twip text indent and hanging
indent, while the generated definition uses a 720-twip text indent. Reopening
also applies paragraph geometry on top of the browser list gutter.

This work is on `fix/docx-numbering-layout-20261103`, separate from the published
font repair. It is not yet a completed layout feature or release candidate.

## Resolve the actual numbering first

The implementation now reads namespace-qualified numbering identities, abstract
levels and instance overrides. Paragraph styles inherit numbering through the
existing bounded style cascade. A direct level can refine an inherited
instance; direct instance references override styles. Style-level `ilvl` is
ignored in favour of the abstract level's `pStyle` association. `numId=0`
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

Read-only native Range measurements expose a 24-CSS-pixel rightward movement
of the first instruction on reopen. The new numbering tests do not approve that
geometry. The measured captures are byte-identical to the six reviewed captures.
The current implementation exceeds four existing code-size caps;
no limits have been changed and this branch must not be merged as a release.

These rules follow Microsoft's [numbering reference/removal contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.numberingid?view=openxml-3.0.1)
and [style-to-level association contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.numberingproperties?view=openxml-3.0.1).

## Remaining acceptance work

1. Give text indentation, marker position and numbering tabs one explicit owner
   across the portable model, browser view and native export. Do not replace
   every document's list indent with a smaller hard-coded default.
2. Resolve numbering-level paragraph declarations with paragraph styles and
   direct overrides. Keep per-item geometry and multi-paragraph continuations.
3. Preserve contextual spacing without silently converting its automatic rule
   into unrelated host margins. Cover adjacency changes during real editing.
4. Preserve or explicitly report marker formats/templates, alignment, suffixes,
   restarts and unsupported numbering effects.
5. Exercise nesting, custom starts, removal, lists in tables and mixed blocks
   through typing/history, native download and reopen. Inspect the editor and
   independent source/export rendering, with the original source unchanged.
6. Complete size/package/runtime checks and the current-source cloud gate
   before release. Any new capacity proposal must be based on the finished,
   reviewed implementation rather than this intermediate measurement.

The original fixture, native findings and separate header/footnote discrepancies
remain recorded in [the native audit](DOCX_NATIVE_AUDIT.md) and
[`docx-list-indent-audit-20261103.json`](../artifacts/docx-list-indent-audit-20261103.json).
