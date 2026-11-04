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
native rendering and the complete suite are being checked for this source.

The figure screenshot uses Playwright's `caret: 'initial'`: its default caret
hiding writes styles to every `[contenteditable]`, including protected custom
blocks elsewhere in the paper, and can trigger their DOM-restoration observer.
The capture therefore retains the actual live caret instead of injecting those
style mutations. This changes no editor behavior or content assertion.
