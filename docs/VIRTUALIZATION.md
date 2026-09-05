# Huge-document virtualization

FountainJS provides opt-in top-level block virtualization through the ordinary
DOM `EditorView`. It keeps the complete immutable document, transactions,
history, collaboration state, search results, and model positions in memory,
but mounts only the viewport window and any selection endpoints. Unmounted
ranges are represented by inert, `aria-hidden` height spacers; they are never
parsed back into document state.

```ts
const scrollHost = document.querySelector<HTMLElement>('#editor-scroll')!

const view = new EditorView(scrollHost, editor, {
  virtualization: {
    scrollContainer: scrollHost,
    minimumBlockCount: 500,
    estimatedBlockHeight: 48,
    overscanPx: 1_000,
    pinnedOverscanBlocks: 1,
  },
})
```

`virtualization: true` uses the window as the viewport, starts at 250 top-level
blocks, estimates unknown blocks at 48 px, renders 1,000 px beyond each viewport
edge, and retains one neighboring block around each pinned endpoint. React's
`FountainEditor` and `FountainComposer`, and `registerFountainElement`, forward
the same option.

## Invariants

- `VirtualBlockLayout` is renderer-independent. It indexes complete-model block
  positions and cumulative heights, plans disjoint viewport/selection ranges,
  and carries measurements through insertion, removal, and movement by
  immutable node identity.
- Every rendered path and decoration receives its absolute position from the
  complete document. Spacer DOM is excluded from text paths, selection mapping,
  mutation recovery, clipboard content, schema, JSON, history, and Yjs.
- Text, node, cell, and root-gap selections pin their required top-level blocks.
  A search command therefore brings a distant model match into the DOM without
  giving search a view-specific API.
- A wide native copy or cut temporarily mounts the complete selected block
  range before the browser reads the selection, retaining marks and node DOM.
  The viewport window is restored in the next task.
- `beforeprint` temporarily mounts the complete document; `afterprint` restores
  virtualization. Hosts may call `setVirtualizationSuspended(true)` for their
  own export, capture, or continuous-accessibility mode and resume with `false`.
- A top-level block or NodeView leaving every active window is destroyed through
  the normal lifecycle. Re-entry creates it again. A retained immutable block
  keeps its DOM and live path; decoration and model changes still follow the
  ordinary update rules.
- Measurements are batched after rendering. Structural insertions/removals and
  height corrections above the viewport adjust its scroll offset against the
  same immutable anchor, rather than visibly jumping to another block.

## Accessibility and product policy

Virtualization is deliberately opt-in. Unmounted content cannot appear in the
browser accessibility tree, so a product that promises continuous screen-reader
reading across the entire document must either leave virtualization disabled or
suspend it while that mode is active. Spacers have no role, label, editable
content, or pointer behavior. The one canonical editor remains labelled as a
multiline textbox, and pinned selections retain their real semantic DOM.

This is a boundary, not an accessibility claim: physical screen-reader testing
remains part of the host's release work. `setVirtualizationSuspended` exists so
the optimization never forces an inaccessible product policy.

## Scope and limits

The current window is top-level-block based. A single enormous table, code
block, custom NodeView, or other top-level node is mounted as one unit; the host
or node implementation must virtualize its own internal rows/items if needed.
Virtualization and the editable pagination surface are separate view modes:
disable or suspend virtualization while a paginator needs simultaneous DOM
geometry for the complete document.

The height index begins with an estimate and converges as blocks are measured.
Choose an estimate near the product's usual block height to reduce scrollbar
correction on the first pass. Custom NodeViews with late-loading media should
expose stable dimensions where possible so their measured height does not keep
changing.

## Evidence

Unit contracts cover 100,000-block range planning, measurement reuse, boundary
validation, distant editing, model-backed search, decoration positions,
NodeView destruction/re-entry, remote collaboration transactions, wide copy,
print suspension, and small-document fallback. The real browser contract runs a
100,000-block editor in Chromium, Firefox, WebKit, mobile Chromium, and mobile
WebKit. It verifies bounded mounted-node counts, multi-million-pixel scroll
geometry, distant selection, Japanese IME composition, stable structural scroll
anchors, rich marked content inside a wide native-readable copy selection,
full-render print events, restoration, and teardown.

Run the focused proof with:

```sh
pnpm exec playwright test --grep "100,000"
```

The complete package and browser gates remain the release authority; a feature
is not certified from the focused test alone.
