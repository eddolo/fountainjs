# Image and caption paragraph layout (unmerged)

Block images now have an optional `imageLayout: ParagraphLayout` attribute.
It owns the image body's paragraph geometry and font context independently of
the existing `captionLayout` and `captionAlign`. These are portable validated
values, not Word style bindings, DOM objects or cached measurements.

```ts
createImageNode(editor, {
  src: '/figure.png',
  width: '566.4px',
  height: '181.247979px',
  imageLayout: { unit: 'pt', spacingBefore: 0, spacingAfter: 7 },
  caption: 'Figure 1',
  captionLayout: { unit: 'pt', spacingBefore: 0, spacingAfter: 14 },
  captionAlign: 'left',
})
```

Existing calls/documents without these optional values retain their schema
defaults. The factory refuses paragraph options for inline images, where the
containing text paragraph owns layout, or when a custom block-image schema has
no corresponding attribute. Invalid values fail the existing paragraph-layout
validation. The source object remains unchanged through export and history.

The image body projects its typed layout onto the actual `img` element and
retains the authoritative data attribute; the caption retains its own context.
NodeSpec rendering, live ImageNodeView, safe HTML export and browser/server HTML
import use the same helpers. Clearing formatting removes stale image styles and
metadata without changing caption formatting or the image dimensions. Browser
CSS projection does not certify Word line-box, pagination or complex wrapping
equivalence.

Word import retains image-only paragraph declarations before promoting the
paragraph to an image block. Native export writes those declarations instead of
substituting the generated 6 pt before / 4 pt after defaults. Legacy images with
no declared image layout keep those export defaults, which become explicit data
when the generated Word file is reopened. A receiving schema that cannot retain
image paragraph layout gets a located loss report.

The Word adapter retains six decimal places of CSS-pixel precision on import
and rounds only when writing integer EMUs. Supported size bounds are unchanged.
The unchanged scientific source's first image has native extents
`5394960 × 1726387` EMUs; its fractional CSS dimensions return to those exact
integers after export/reopen. Embedded asset bytes remain unchanged.

The native bridge can retain opaque image spacing identities and on/off
declarations. Composite image/caption adjacency is not yet part of the portable
paragraph-flow resolver, and the limitation stays explicitly reported. Ordinary
Markdown reports omitted image paragraph formatting. Full Word/HTML fidelity,
unsupported wrapping/legacy settings and release acceptance remain separate work.

Verification includes Node JSON/HTML/DOCX contracts, invalid data, history, the
image factory, browser HTML parsing, live NodeView update/clear/undo, and
fractional native dimensions. Three recorded Chromium/Firefox/WebKit journeys
pass caption typing/undo, source-declared image gaps, list editing, HTML reading
and actual DOCX download/reopen. All three complete saved JSON documents equal
their initial live document, including plugin-owned trailing content. Independent
native rendering and the complete suite now pass the bounded profile below.

The figure screenshot uses Playwright's `caret: 'initial'`: its default caret
hiding writes styles to every `[contenteditable]`, including protected custom
blocks elsewhere in the paper, and can trigger their DOM-restoration observer.
The capture therefore retains the actual live caret instead of injecting those
style mutations. This changes no editor behavior or content assertion.

## Independent native result

The unchanged two-page scientific source retains SHA-256
`52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495`.
The implementation checkpoint is `e5fb6c5`; the independent
[native run](https://github.com/eddolo/fountainjs/actions/runs/41768523557)
uses LibreOffice in isolated Ubuntu CI. Its downloaded archive matches GitHub's
SHA-256 `bcb3b3215fdff08497667ef6562304d7f5bec7b0e4a2646ff09eedb2f6b8dc86`.
All four source/export page images were inspected. The source raster remains
identical to the preceding audit.

| Independent PDF target | Previous y difference | Current y difference |
| --- | ---: | ---: |
| Setup heading and all three instructions | 0 pt | 0 pt |
| Figure 1 caption | -3.2 pt | 0 pt |
| Figure 2 caption | -6.4 pt | 0 pt |
| Page-two recorded-temperatures heading | +2 pt | +2 pt |

The native coordinate gate adds both complete caption phrases, retaining its
0.01 pt threshold. It has separate actual pre-repair PDF controls: the earlier
7 pt paragraph offset and the later caption-only drift. This is a fixture
regression profile, not general Word certification. The
[expanded gate run](https://github.com/eddolo/fountainjs/actions/runs/41768955941)
passes all six positions and both negative controls; its four page rasters
exactly equal the independently inspected implementation run. Native header/title raster
differences, page-two equation/table layout and source/export footnote behavior
remain visible. Standalone HTML still shows equation source and linear page
templates/page fields; it does not reproduce the native pages.

Full verification: 3,597 unit tests / 254 files; build, framework types, package
exports, 419 declaration files, headless boundary across 119 modules, independent
DOCX interoperability, recorded desktop journeys, actual packed root/core ESM
and CommonJS consumers, server runtime contracts and real workerd. The existing
Markdown conformance gate passes with its recorded partial semantic profiles;
this checkpoint does not claim complete CommonMark conformance.

The explicitly approved theme-language limits are now DOCX 185/149.5 KiB and
aggregate ESM/CJS 1,652.5/1,375.5 KiB. Seven existing size failures still exceed
those or unchanged core/CSS limits. Prior HTML timing acceptance is unresolved.
No additional allowances, merge or npm publication are included.

Evidence: [browser complete-model comparison](../artifacts/image-paragraph-layout-capture-real-20261104/evidence.json),
[verification and runtime hashes](../artifacts/image-paragraph-verification-20261104.json),
[independent native review](../artifacts/image-paragraph-native-review-20261104.json).
