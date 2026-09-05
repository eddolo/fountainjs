# Native renderer feasibility

Status: **architecture decision complete; no native renderer is implemented or
promised**.

FountainJS now has an enforced platform-neutral engine entry, but a DOM-free
engine is not the same thing as a native rich-text editor. This document defines
the smallest boundary that can be prototyped without weakening the browser
editor or pretending that a WebView is native.

## Decision

Design native compatibility now and implement it later. If a feasibility spike
is scheduled, **React Native is the first candidate**, because the existing
TypeScript engine can run in the same JavaScript application without a
cross-language document engine port. That advantage does not make React
Native's `TextInput` a complete structured-document surface.

Electron and Tauri continue to use the existing DOM renderer. Node.js,
serverless runtimes, and background jobs use `fountainjs-editor/core` and
`fountainjs-editor/html/server`. Flutter, SwiftUI, and Android Compose remain
future host adapters, not current package claims.

The recommendation is therefore:

1. keep `fountainjs-editor/core` free of browser dependencies permanently;
2. specify one renderer/input protocol around the existing engine;
3. prove the protocol with one deliberately bounded React Native spike;
4. do not publish `@fountain/react-native`, Flutter, Swift, or Kotlin packages
   until their input, selection, accessibility, lifecycle, and performance
   gates pass on physical devices.

## Evidence from the current engine

The reusable pieces already exist:

- [`src/core/editor.ts`](../src/core/editor.ts) owns the authoritative immutable
  state, synchronous `dispatch`, transaction filtering/appending, subscriptions,
  update notification, and deterministic teardown.
- [`src/core/selection.ts`](../src/core/selection.ts) represents text, node, gap,
  all-document, and rectangular cell selections as logical document positions,
  not DOM ranges.
- [`src/core/transaction/transaction.ts`](../src/core/transaction/transaction.ts)
  maps logical selections through every applied step and carries metadata.
- [`src/extensions/collaboration-core.ts`](../src/extensions/collaboration-core.ts)
  owns provider-neutral connection, presence, remote transaction, and teardown
  behavior without rendering a caret.
- [`src/widgets/index.ts`](../src/widgets/index.ts) keeps widget values,
  validation, key policy, and transactions portable while letting a renderer
  supply its own control.
- [`src/headless/index.ts`](../src/headless/index.ts) is the enforced package
  facade that proves these modules compile and execute without DOM libraries.

The browser-specific work is already identifiable and must not leak back into
that engine:

- [`src/view/dom-renderer.ts`](../src/view/dom-renderer.ts) turns model nodes and
  decorations into DOM nodes and manages NodeView identity.
- [`src/view/selection-handler.ts`](../src/view/selection-handler.ts) maps
  browser `Selection`/`Range` state, DOM paths, pointer selection, and semantic
  selection markers to the logical selection model.
- [`src/view/input.ts`](../src/view/input.ts) interprets `beforeinput`, keyboard,
  composition, clipboard, drag/drop, pointer, and hit-test events.
- [`src/view/view.ts`](../src/view/view.ts) owns focus, rendering, mutation
  recovery, virtualization, view commands, and DOM lifecycle.

This evidence supports an adapter, not an engine rewrite.

## Why native editing is not a renderer swap

Native platforms provide text-field primitives, not a ready-made equivalent of
an arbitrary nested structured document. React Native documents `TextInput` as
a controlled native text input and exposes selection/change events, while also
warning that keeping its native value and controlled value synchronized can
cause visible or input behavior when they differ. Its accessibility layer maps
to different iOS VoiceOver and Android TalkBack behaviors. See the official
[React Native `TextInput` reference](https://reactnative.dev/docs/textinput),
[direct-manipulation guidance](https://reactnative.dev/docs/the-new-architecture/direct-manipulation-new-architecture),
and [accessibility reference](https://reactnative.dev/docs/accessibility).

Flutter's `EditableText` is explicitly a low-level building block that owns
text input, cursor movement, selection, scrolling, clipboard actions, focus,
and platform input-service coordination. This confirms that a Fountain adapter
must integrate with those behaviors rather than merely paint styled spans. See
the official [Flutter `EditableText` API](https://api.flutter.dev/flutter/widgets/EditableText-class.html).

Android's state-based text fields explicitly retain text, selection, and
composition as one input state. Input transformations run before committing to
that state. See the official [Jetpack Compose text-field guidance](https://developer.android.com/develop/ui/compose/text/user-input).

Apple's custom text-input contract likewise requires marked text, selected
text, and abstract text positions/ranges for multistage input. See the official
[`UITextInput` protocol](https://developer.apple.com/documentation/uikit/uitextinput).

Consequently, a collection of independently controlled per-paragraph inputs is
not sufficient proof. It tends to break cross-block selection, composition,
atomic nodes, tables, bidi navigation, clipboard fidelity, and accessible
reading order at the boundaries between controls.

## Smallest host boundary

No new public API should be frozen before the spike. The prototype should test
an internal boundary with these responsibilities.

### 1. Engine ownership and revisions

One `Editor` remains authoritative. The host mounts exactly one adapter,
subscribes once, and destroys its view resources without destroying an
application-owned editor. Every outward projection and inward input message
carries a monotonically increasing `revision`.

A host event based on an old revision is either safely mapped through retained
transactions or rejected and resynchronized. It must never overwrite a newer
document wholesale.

### 2. Render projection

The renderer receives immutable, renderer-neutral block projections keyed by a
stable node ID and model path. Each projection contains semantic node type,
validated attributes, inline text/mark runs, child identities, and logical
source ranges. It does not contain HTML, CSS selectors, DOM nodes, or NodeView
constructors.

The first prototype may send a full projection for a bounded fixture. A
production adapter must apply keyed changed-block patches derived from the
transaction and reuse unchanged native views. Serializing the complete document
for every keystroke is a failed architecture.

### 3. Logical selection

The adapter translates between platform selections and Fountain's existing
logical selection classes:

- text: start path/offset and end path/offset;
- node: stable ID/path;
- gap: parent path plus child index and association;
- all-document;
- rectangular table cells.

Direction/affinity, selection ownership, and a revision accompany the native
representation. The model stays authoritative; native handles and highlights
are a projection.

### 4. Input and composition

The host emits ordered semantic input messages rather than simulated DOM
events. At minimum the protocol needs:

- replace the current logical range with text;
- delete backward/forward using platform intent and granularity;
- split/join blocks and insert a hard break;
- apply a command or mark;
- begin, update, commit, and cancel a composition session;
- change logical selection;
- activate or exit an atomic node/widget;
- undo/redo and platform shortcut intent.

Composition messages carry a unique session ID, base revision, replace range,
current marked text, and selected range within the marked text. Remote updates
or React/Flutter recomposition must not destroy an active composition. A stale
commit must be rejected or mapped once, never applied twice.

### 5. Clipboard and external content

The core owns a portable clipboard envelope: Fountain JSON where an application
can safely exchange it, plus `text/plain`, safe HTML, files/media descriptors,
and loss metadata. Each platform adapter owns permission prompts, clipboard API
calls, and the set of payload types that platform actually exposes.

Plain text remains the mandatory fallback. Unknown native payloads must not be
silently interpreted as trusted Fountain JSON, and private document JSON must
not be put on a system clipboard without an explicit host policy.

### 6. Layout, hit testing, and scrolling

The renderer owns typography and geometry. It must provide:

- native point to logical selection;
- logical selection/range to one or more screen rectangles;
- block measurement and viewport visibility;
- caret visibility and keyboard-inset scrolling;
- writing direction and line/word movement as understood by the platform.

The engine must not gain `getBoundingClientRect`, CSS, or pixel-layout logic.
Pagination and virtualization consume neutral measurements but stay optional
view capabilities.

### 7. Widgets and custom nodes

Stable type names and node IDs select host-owned native renderers. A native
widget renderer receives current validated attributes, an update command,
read-only state, focus/exit actions, and teardown. It cannot mutate document
objects or keep a second authoritative value.

Unknown custom nodes render a safe labelled fallback. One missing widget
renderer must not make the document unreadable or crash the editor.

### 8. Collaboration and presence

The existing collaboration adapter stays in core. A native renderer projects
remote logical selections into its own carets, names, highlights, and
accessibility descriptions. Provider transport, authentication, rooms, and
persistence remain host choices.

### 9. Accessibility and focus

The adapter must expose one coherent editor, semantic headings/lists/tables,
labelled controls, current selection, editing state, and supported actions to
the platform accessibility tree. Focus order and screen-reader order must agree
with document order even when rendering is virtualized.

This is a release requirement, not post-release polish.

## Candidate architecture

```text
fountainjs-editor/core
  Editor / schema / transactions / selections / extensions / history
  collaboration / serializers / stable IDs
                    |
                    | immutable projections + semantic input messages
                    v
        renderer adapter contract (internal until proven)
          |             |               |              |
          v             v               v              v
        DOM         React Native      Flutter       Swift/Kotlin
    current view    first spike     future bridge   future bridge
```

React Native can invoke the TypeScript engine directly and render native
components. Flutter/Swift/Kotlin need a stronger serialization boundary and a
decision between embedding a JavaScript runtime and maintaining a separate
engine implementation. Maintaining independent engine ports is not recommended:
it would multiply schema, transaction, mapping, collaboration, and migration
behavior and make conformance drift likely.

## First spike: intentionally bounded

The first spike is an experiment, not a package release. It should use React
Native without a WebView and prove all of the following before the architecture
is accepted:

- paragraphs, two heading levels, bold/italic, lists, and one atomic image;
- typing and replacement in the middle of marked text;
- selection, copy, cut, and replacement across two blocks;
- Japanese composition start/update/commit without duplication;
- autocorrect/predictive-text update without an echo loop;
- backspace, Enter, arrows, select all, undo, and redo;
- a remote transaction during an active local selection and composition;
- native screen-reader reading order, labels, and editing actions;
- keyboard appearance/dismissal, focus restoration, and caret visibility;
- stable unchanged-view identity over 10,000 blocks and a measured 100,000-block
  read-only/virtualized projection;
- repeated mount/unmount and editor/view ownership without leaks.

Tables, comments UI, tracked-change UI, pagination, drag/drop, widgets, and
production collaboration presence are deliberately outside this first spike.
They remain required before any claim of native feature parity.

## Fail-fast criteria

Stop and redesign the boundary if the spike needs any of these shortcuts:

- a hidden WebView or `contenteditable` surface;
- converting the document to HTML for every render;
- replacing the full document on every character;
- one uncontrolled native value and a second Fountain value that reconcile
  after the fact;
- ending composition for every remote update or React render;
- a per-block design that cannot represent a cross-block selection;
- DOM event, element, range, CSS, or layout types imported by core;
- platform-specific behavior added to the schema or transaction engine.

## Risk register

| Risk | Why it is hard | Required evidence |
| --- | --- | --- |
| IME and marked text | Composition is a session, not a sequence of final characters; rerenders and remote edits can invalidate its base range. | Physical iOS and Android Japanese/Chinese/Korean fixtures, stale-revision and remote-edit cases, no duplicate commits. |
| Cross-block selection | Native text controls usually own local ranges while Fountain documents contain nested blocks and atoms. | Drag/handle and keyboard selections across blocks, copy/cut/replace, bidi boundaries. |
| Controlled-input echo | Native state, JavaScript state, and model state can race or replay. | Revision/session protocol under fast typing, autocorrect, prediction, and delayed rendering. |
| Bridge cost | Full JSON and cross-language calls per keystroke will stutter and allocate heavily. | Changed-block patch benchmark, call count, p95 input latency, memory/GC budgets. |
| Layout and hit testing | The engine has logical positions; each platform owns glyph geometry and word/line navigation. | Point/range mapping, selection rectangles, scroll-to-caret, variable fonts and bidi. |
| Accessibility | VoiceOver and TalkBack expose different focus and nested-element behavior. | Physical screen-reader journeys, external keyboard actions, virtualized reading order. |
| Clipboard | Native platforms expose different rich payloads and file permissions. | Plain-text fallback, safe rich envelope, foreign-app fixtures, privacy policy. |
| Tables and widgets | Nested controls, cell selection, focus handoff, and atomic components are not plain text. | Separate post-spike conformance suite before parity is claimed. |

## Platform order

| Surface | Engine strategy | Recommendation |
| --- | --- | --- |
| Browser DOM / ReactDOM | Existing core plus DOM input/render adapter | Primary product; keep hardening. |
| Electron / Tauri | Existing web surface in their browser renderer | Validate packaging; no new editor engine. |
| Node / serverless | `fountainjs-editor/core` plus `html/server` | Delivered; keep runtime and no-DOM gates permanent. |
| React Native | Run the TypeScript core in the application JS runtime; add native projection/input adapter | Best first feasibility spike after web priorities. |
| Flutter | Embed the JS core behind a bounded protocol or fund a fully conformant port | Design-compatible, implementation later. |
| iOS / SwiftUI | Bridge the authoritative engine to TextKit/`UITextInput` behavior | Dedicated platform project later. |
| Android / Compose | Bridge the authoritative engine to Compose/native input state | Dedicated platform project later. |

## Acceptance before a public native package

A public native binding requires more than a successful demo. It needs:

- a versioned adapter protocol and compatibility diagnostics;
- deterministic conformance tests shared with the DOM renderer;
- physical iOS and Android IME, bidi, accessibility, clipboard, keyboard, and
  lifecycle evidence;
- explicit supported node/mark/widget matrices and safe fallbacks;
- large-document latency, memory, view-reuse, and bridge-call budgets;
- collaboration and undo ownership tests;
- framework upgrade policy and maintenance owners;
- documentation that distinguishes native capability from web capability.

Until those gates pass, the honest statement is: FountainJS has a
platform-neutral engine designed to permit native adapters; FountainJS does not
yet ship a native rich-text editor.
