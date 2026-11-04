# Display-equation paragraph context (unmerged)

Display math has an optional validated `layout: ParagraphLayout`, separate from
its TeX source, semantic expression and accessibility label. Inline math remains
in its containing paragraph and has no new paragraph-layout attribute.

The unchanged scientific Word fixture exposed the missing boundary: its two
equation-only paragraphs inherit Normal-style 7 pt after-spacing, but import
discarded the paragraph context. Export then used the generated Normal style's
8 pt default. Independent PDFs show +1 pt drift after the first equation and
+2 pt after the second, including the recorded-temperatures heading.

Import now retains the resolved paragraph geometry and font context when one
Word paragraph owns one display equation. The existing list/quote grouping still
wraps the equation. A receiving schema without the owning attribute gets a
located loss report. Mixed prose/equation paragraphs still split in source order;
their single paragraph geometry cannot simply be duplicated onto every fragment,
and that limitation is now reported explicitly.

Typed JSON and safe browser/server HTML retain the context. Static schema
rendering and the live math NodeView project its CSS. Clearing paragraph layout
removes the previously owned style properties and metadata while retaining
unrelated host styles. TeX edits preserve paragraph context; undo restores the
entire model, including its semantic expression. Ordinary Markdown reports the
layout it omits. No TeX execution/compiler dependency is added to the core.

Native semantic-math export writes the retained paragraph declarations and
bounded spacing identity. Display math remains an isolated paragraph-flow
boundary: retaining contextual-spacing declarations does not certify identical
portable/native adjacency. Full Word pagination, mixed-paragraph reconstruction
and unsupported alignment/renderer behavior remain separate work.

Focused verification passes 12 new Node/DOM cases, including a 17 pt spacing
control, receiving-schema loss, mixed fragments, list/quote ownership, spacing
identity, source editing/history, complete HTML reopening, invalid values and
style clearing. Three recorded desktop browser journeys pass actual TeX editing,
rendering, undo, list editing, caption editing, HTML download and DOCX reopening.
The complete suite passes 3,609 tests across 256 files. Existing fixtures that
omit equation layout now explicitly expect the generated Word Normal defaults
on reopen (Arial 11, 8 pt after, 1.15 line spacing), while retaining the complete
model comparison. No geometry is filtered out to manufacture equality.

## Independent native result

The source fixture remains SHA-256
`52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495`.
Implementation `c39d92dc0145927c22dd1b7a8799a687f0ec3b38` passed the isolated
[native rendering run](https://github.com/eddolo/fountainjs/actions/runs/41770211766).
The downloaded archive matches GitHub's SHA-256
`834441907fc033c5f2c7dcfd6aa644f0610c9e04c48711bd04a9f44cc04243dd`.

| Independent PDF target | Previous y difference | Current y difference |
| --- | ---: | ---: |
| Model heading and Newton-model label | 0 pt | 0 pt |
| Half-cooling-time label | +1 pt | 0 pt |
| Rate-constants paragraph | +2 pt | 0 pt |
| Recorded-temperatures heading | +2 pt | 0 pt |
| Earlier heading, three instructions, two captions | 0 pt | 0 pt |

The updated exported second page was visually inspected. Both source rasters and
the exported first page exactly match previously inspected pages. A separate
[expanded gate run](https://github.com/eddolo/fountainjs/actions/runs/41770809283)
checks all 11 positions at the unchanged 0.01 pt tolerance, rejects the actual
pre-repair paragraph/caption/equation PDF controls, and reproduces all four
implementation rasters exactly. This is a bounded fixture profile, not whole-page
or Microsoft Word certification. Header/title raster differences, table/footnote
details, mixed paragraphs and standalone-HTML math/page-template fallbacks remain
outside that claim. The extra end-of-report text is the audit's intentional edit.

Build, framework types, package exports, the 419-declaration API surface,
119-module headless boundary, independent DOCX interoperability, existing
Markdown conformance gate, server runtimes, actual packed root/core ESM/CommonJS
consumers and real workerd pass. Packed/worker probes include equation context,
complete HTML reopening, native export/reopen, source edits and exact undo without
DOM globals. Existing partial CommonMark semantic scores remain explicitly
recorded; this change does not complete CommonMark conformance.

The latest unchanged performance/retention gate passes: 100-block server-HTML
p95 is 28.61 ms / 35 ms, and the 10,000-block profile is 846.35 ms / 900 ms.
Earlier timing failures remain recorded; no parser optimization or durable
timing-failure repair is claimed. Seven size limits still fail, including the
previously approved DOCX/aggregate ceilings. No new limit allowance, merge or
npm publication is included.

Evidence: [complete browser models](../artifacts/math-paragraph-layout-real-20261104/evidence.json),
[native review and negative controls](../artifacts/math-paragraph-native-review-20261104.json),
[package/runtime verification](../artifacts/math-paragraph-verification-20261104.json).
