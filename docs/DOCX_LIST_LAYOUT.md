# DOCX list-layout repair in progress

Latest native-export work: [the paragraph spacing bridge](DOCX_NATIVE_SPACING.md)
now retains the paper's zero internal list gaps through recorded browser
download/reopen in all three desktop engines. Independent native rendering confirms
matching 14.5 pt instruction steps and a remaining common 7 pt vertical offset.
The earlier cumulative drift measurements below remain historical evidence;
broader layout/flow and release acceptance are unfinished.

The initial retained scientific source audit exposed an 18 pt shift in
the first numbered instruction: source text begins at 75.7 pt; the exported
text begins at 93.7 pt. Source numbering uses a 360-twip text indent and hanging
indent, while the original generated definition used a 720-twip text indent.
The portable-geometry checkpoint below repairs that horizontal drift; vertical
native-export spacing and broader fidelity remain unfinished.

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

## Independent native result for d8e6f3d

[Native audit 41740050920](https://github.com/eddolo/fountainjs/actions/runs/41740050920)
passes on the unmerged feature commit. The downloaded archive digest was checked
against GitHub's artifact digest before extraction. Both source and actual
browser-downloaded export render to two Letter pages with four drawn image
objects. All four page images were inspected; the unchanged source's two images
are byte-identical to the earlier master audit.

The source and export now place all three instruction texts at 75.7 pt, removing
the previously measured 18 pt horizontal shift. The same 18 pt body-relative
offset also survives browser import/download/reopen and standalone HTML in
Chromium, Firefox and WebKit. This is bounded evidence for this fixture/profile.

Vertical list spacing still differs: source instruction tops are 244.471,
258.971 and 273.471 pt; export tops are 251.471, 272.971 and 294.471 pt. Header
horizontal placement and the original footnote/renderer discrepancy also remain.
Page two of the export is byte-identical to the prior master audit. Supported
equations, figures, table, title font and authored ending remain visible; this
does not establish complete native Word or whole-document visual fidelity.

An actual packed local tarball additionally passes ESM/CommonJS root/core HTML
and native DOCX list-geometry consumer checks in Node. It was not published.

## Word import joins portable paragraph flows (2026 11 04)

The importer now keeps the actual valid Word paragraph-style identity, including
an omitted `pStyle` that selects the declared default. It does not compare display
names, formatting equality or a shared ancestor. Styles are case-sensitive. An
unnamed default has its own identity; an unresolved explicit reference does not
invent a same-style relationship. Both an enabled and an explicitly disabled
unrepresentable rule produce a located warning.

Only identities needed by a contextual-spacing declaration become portable
spacing groups. Every member of such a group is retained, including neighbours
with an omitted or disabled rule. Styles with no declaration anywhere in the
imported document do not introduce unrelated Word metadata into ordinary
paragraphs. Original before/after values remain unchanged. These document-local
opaque identities are not a stylesheet transplant or a globally unique style
registry; applications combining independent documents must remap local groups.

On the unchanged cooling-report source, exactly four paragraphs acquire rule
data: its Title and three ListNumber paragraphs. The complete expected model
comparison includes those additions and every existing node/attribute; no
attributes or assets are removed to obtain equality. The list retains its
original 7 pt after-spacing while deriving zero gaps between its instructions.
The rest of the model, including figures, table, equations and separate stories,
matches the retained package exactly.

Recorded Chromium, Firefox and WebKit journeys use the actual Word source, not
a synthetic Fountain replacement. They cover Enter, a visible empty line,
Undo/Redo/Backspace, actual JSON/HTML downloads, a standalone HTML reader, and
an actual DOCX download/reopen. The imported and reader list gaps measure zero;
the reopened DOCX still measures about 9.33 CSS px (7 pt). That last measurement
records a remaining loss, not native-fidelity success.

Native export remains unfinished and reports
`paragraph-contextual-spacing-not-exported`. With the same clock input and the
unchanged lab MathJax adapter, all 18 native export parts and the complete ZIP
remain byte-identical to `ec2f4a2`; no native rendering improvement is inferred.
No new LibreOffice run is substituted for this explicit unchanged-output proof.
The earlier native PDF evidence still describes the exported spacing defect.

Word quote paragraphs that become separate isolated containers, a contextual
paragraph split by a page break/equation, an image-only paragraph promoted to a
block, captions without paragraph-flow projection, and custom carriers lacking
the flow contract retain explicit import diagnostics. This is not complete
contextual spacing for every Word structure.

The initial overview review misidentified the empty item's number as missing.
Focused paint inspection confirms that it already displays `2.` in all three
engines. The original marker patches are byte-identical to the repeated captures
(15/31/111 dark pixels in Chromium/Firefox/WebKit). No renderer repair was needed.
The earlier remaining-marker finding is superseded by
[the original-capture inspection](../artifacts/list-marker-original-inspection-20261104.json).

New recorded journeys verify actual marker pixels against independent literal
`2.` and suppressed-marker controls. The negative control requires zero dark
pixels. A first WebKit attempt included two pixels from the preceding line at
the crop boundary; cropping inside the line fixes that oracle error without
changing its zero-pixel expectation. Actual JSON downloads before and after
Enter/Backspace compare the complete document, including all attributes/assets,
with exact equality. All three journeys and framework types pass. Standalone
HTML still displays math source and separate header/footer stories, not native
paginated Word output.

This journey is now registered in the standard desktop browser suite through
`tests/browser/editor.spec.ts`, with per-test output directories so CI can rerun
it. The selected Chromium/Firefox/WebKit cases pass through that entry point;
this does not claim a fresh run of the entire browser suite. The marker review
changes no production code: all 169 runtime/CSS files match `d0c8d75` exactly.
[Bound corrective audit](../artifacts/list-marker-visibility-verification-20261104.json).

The final image audit scrolls each embedded image into view and waits for a
successful decode before taking the full-reader capture. All three images load
in every engine. An earlier Firefox full-page capture showed the header image's
alt text because that offscreen image was still lazy-loaded; this was an audit
timing issue, not evidence that the packaged image was missing.

The Word-import checkpoint passed 3,532 unit tests in 250 files, including 23 new import contracts;
framework types; package-entry checks; the 118-module headless boundary; DOCX
interoperability; and the unchanged 419-file public API surface pass. Actual
packed ESM/CommonJS root/core consumers and real Cloudflare workerd also exercise
native Word bytes, the 10/12-to-2 pt case, retained off intent, transactions and
HTML reopening without browser globals. Twelve final captures were reviewed:
nine by byte identity with inspected captures and three by fresh inspection.
Of 169 built runtime/CSS artifacts, only DOCX ESM/CommonJS changed from `ec2f4a2`.
[Bound source, checks and visual observations](../artifacts/docx-spacing-identity-verification-20261104.json).

The larger feature branch still fails size acceptance and has an unresolved
server-HTML timing gate. This checkpoint does not change budgets, dependencies,
CSS or public API declarations, and does not promote a parity percentage.

## Next native-export requirements

1. Native paragraph-style identity must express portable group equality,
   including a group shared by different block roles. Do not split a group by
   heading/code/caption role just to simplify presentation, or merge groups
   because they share formatting or ancestry.
2. Write the original before/after declarations and each paragraph's native
   contextual on/off intent. Participating omitted spacing means zero; generated
   styles must not introduce an inherited Normal after-space. Never freeze the
   current computed gap into declarations that become stale after editing.
3. Generated style IDs must be bounded, XML-safe and collision-free. Preserve
   portable identities and block roles on reopen through validated bindings;
   metadata must not override authoritative native edits with stale formatting.
   Keep this Word-specific bridge outside the platform-neutral core.
4. Verify the 10/12-to-2 pt, both-enabled zero-gap, disabled and different-group
   cases, plus list/cell/story boundaries. Download, edit and reopen actual DOCX,
   then independently render the real output. Keep the whole scientific source,
   figures, equations and horizontal list geometry in the comparison. Native
   spacing is unfinished until this evidence shows the actual repair.

## Earlier portable contextual-spacing checkpoint (ec2f4a2)

Optional `ParagraphLayout.spacingGroup` is an opaque, case-sensitive identity;
`contextualSpacing` is a retained boolean intent. These are application data,
not a binding to Word's style hierarchy. Identical appearance or shared ancestry
does not imply identical groups. A participating paragraph owns its before/after
space, with omitted spacing values treated as zero. Old JSON without these
fields behaves as before; older consumers need the updated layout schema.

`resolveParagraphGap()` and `paragraphSpacingAt()` operate on the immutable
document without a DOM. They preserve original declarations, combine adjacent
space with a maximum, then subtract enabled same-group contributions with a
zero floor. The following carrier owns the resulting gap. The renderer and HTML
serializer project that value without adding editable DOM or writing computed
margins back into document state.

`NodeSpec.paragraphFlow` explicitly classifies a text carrier, transparent
container or isolated flow. Paragraphs, headings and code blocks are carriers;
lists, items and definition-list containers are transparent. Other/custom blocks
default to isolated flows. Table cells, quote containers and separate stories
do not acquire implicit cross-boundary adjacency. Extensions can opt their own
containers into flow instead of relying on their HTML tag names.

An unchanged mounted paragraph refreshes after adjacent edits; offscreen
neighbours are resolved from the model. The local tests cover original JSON,
safe HTML, splitting/history, deletion/reordering, Yjs changes and virtualized
DOM reuse with an actually unmounted predecessor. The original Word-source
fixture is unchanged.

Two additional custom-view regressions were reproduced before repair. A reused
view now receives its unprojected base styles before `update()`, preventing a new
plain value equal to the previous derived value from restoring stale margins.
The final projection also runs after `updateDocument()` callbacks, so their
base-style refresh cannot overwrite the current model-derived gap.

The first recorded browser attempt exposed a Chromium-only 5 px list gap despite
zero paragraph margins. An isolated native-HTML probe reproduced it and showed
that matching only the marker's declared font context removes the gap; switching
to `flow-root list-item` does not. The shared editor/reader marker rule applies
font context to native markers without changing descendant text or replacing
the semantic list. The initial Firefox/WebKit journeys also needed an audit
navigation correction: after selecting a new file, the old workspace is no
longer active. Numerical gap assertions and the timeout were not relaxed.

The editor uses the supplied stylesheet; a standalone full HTML export embeds
the same marker rule. Style-free fragments preserve declarations and semantic
lists, but an external client's own marker fonts can change their appearance.
The fragment contract does not certify another application's clipboard/layout.

Three final recorded journeys pass in Chromium, Firefox and WebKit. Native
bounding-box measurements verify 2 pt between the two research paragraphs,
zero extra space between same-group list items, and a restored 12 pt gap after
deleting the first observation. Enter/Undo/Redo/Backspace, backward selection,
actual JSON download, HTML download/reader/reopen and explicit DOCX loss display
are included. Original 12 pt declarations survive while the current gap is 2 pt.
The entered empty paragraph has a measured 14 pt line box in all three engines;
the check does not merely count an invisible model node. All fifteen final
captures were reviewed, eight by byte identity with already reviewed captures
and seven by fresh visual inspection.
The reader uses its own presentation; this is not whole-document pixel parity.

This checkpoint passes 3,509 unit tests in 249 files (28 new contracts), types,
419 public declarations, package-entry checks, the 118-module headless boundary,
and both retention checks. An actual packed archive passes ESM/CommonJS root
and core consumer checks in pure Node. The new gap/transaction/HTML behavior
also passes in real Cloudflare workerd without browser globals.

Seven unchanged size ceilings still fail: core ESM/CommonJS, DOCX ESM/CommonJS,
CSS and both runtime aggregates. The standalone 100-block server-HTML p95 gate
also failed at 48.13 ms and again at 35.38 ms against its unchanged 35 ms limit.
The retained baseline passed its standalone run. An alternating-order diagnostic
shows slow samples in both builds, but does not resolve the regression or replace
the failed gate. No acceptance threshold was changed. Full logs, fixture/source
hashes and final browser observations are bound in
[the verification record](../artifacts/paragraph-spacing-verification-20261104.json).

At that checkpoint native Word import still reported the unresolved source rule. Export of these
new portable fields reports `paragraph-contextual-spacing-not-exported`, including
caption metadata where present. Word style identities/group bindings and native
contextual-spacing output are the next bridge work. Do not describe this as a
completed DOCX spacing repair or merge/publish it while acceptance gates fail.

## Earlier contextual-spacing declaration checkpoint (1a4481a)

The Word reader/cascade now preserves the three distinct declaration states:
omitted, enabled and explicitly disabled. Namespace aliases, invalid values,
duplicates, inheritance and absolute overrides use the existing strict reader
and cascade. Defaults, table context, paragraph ancestry, numbering and direct
formatting retain their established order. This is private format resolution;
no new public layout attribute or successful visual-spacing claim is introduced.

The projection reports `paragraph-contextual-spacing-not-imported` only where
the effective rule is enabled. An unused style or a false override does not
produce that warning. The retained paper enables it on the title and three
numbered paragraphs (source paths 0, 5, 6 and 7). Declared 7 pt spacing remains
unchanged until the portable rule and its view/export boundary are implemented.

Twenty-one focused declaration/report contracts pass, together with 489 tests
in the 32-file DOCX run. Build, unchanged 417-file public API, framework types,
built package entries and the 117-module headless boundary pass. Three recorded
headless lab journeys pass with one worker; the warning and reopened-document
captures were inspected in Chromium, Firefox and WebKit. Seven existing size
ceilings still fail and no limit was changed.

The complete imported JSON and all 18 native export parts, including the entire
ZIP archive, also match the retained pre-change tarball under the same clock
input. That comparison uses the lab's full StarterKit/Pages/Math schema and its
unchanged real MathJax export adapter, with explicit image, equation, table,
page-template and footnote coverage checks. It does not strip timestamps or
normalize output. The earlier minimal-core comparison was insufficient for
these broader statements and was extended before recording this result.

The remaining implementation must retain an opaque paragraph spacing-group
identity independently of resolved appearance: identical formatting or a common
ancestor does not make two Word paragraph styles identical. It must compute the
gap from the original spacing values and the current adjacent paragraphs,
without replacing those values by a one-time zero. Microsoft's documented
example combines 10 pt after and 12 pt before into a 12 pt gap, then subtracts
the first paragraph's enabled 10 pt contribution, leaving 2 pt. See the
[contextual-spacing contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.contextualspacing?view=openxml-3.0.1).

Before enabling that portable behavior, verify these boundaries:

1. Opaque group identity and on/off intent survive JSON, editing/history,
   collaboration, HTML and native Word without colliding with generated style
   IDs or changing paragraph/heading semantics.
2. A pure, DOM-independent gap resolver uses the adjacent flow's original
   before/after values, suppresses only enabled contributions between identical
   groups, and floors the resulting gap at zero. Cover the documented 2 pt case,
   both enabled, neither enabled, explicit false, different IDs with equal
   formatting, and distinct child/parent styles.
3. The view recomputes after insertion, deletion, splitting, merging, reordering
   and remote edits, including unchanged neighbouring DOM nodes. Reuse and
   virtualization must not retain an old gap or scan unmounted DOM for semantics.
4. Adjacent paragraphs across list items use their native text-flow order;
   table cells, separate stories and opaque/custom blocks need explicit flow
   boundaries. Split Word paragraphs must keep their existing loss diagnostics.
5. HTML reader/export projection and native style/contextual-spacing output
   retain the rule as well as its present appearance. Inspect independent native
   source/export renders and actual recorded browser editing before promotion.

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

1. Extend the verified original 18 pt profile to broader native list geometry
   and marker behavior. The retained fixture now passes both browser and
   independent native position checks; broader cases still require evidence.
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
