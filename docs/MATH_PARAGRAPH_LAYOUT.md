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
The complete unit suite and independent native re-render are in progress.
