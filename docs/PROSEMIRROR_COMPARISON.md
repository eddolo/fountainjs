# ProseMirror, Tiptap, and FountainJS

Last reviewed against the public documentation on **2026-09-04**.

## The relationship

Yes: ProseMirror is the foundation underneath Tiptap. Tiptap's own documentation
says that it wraps ProseMirror in a higher-level, framework-neutral API. A Tiptap
editor ultimately uses ProseMirror's document model, state, transactions, view,
plugins, and extension ecosystem.

FountainJS is not a wrapper around ProseMirror and has no `prosemirror-*`
runtime dependency. It independently implements a schema-owned document tree,
immutable state, steps and mappings, transactions, plugins, commands,
decorations, NodeViews, a DOM view, and optional higher-level modules. Similar
terms describe similar editor-engine problems, but the classes, position model,
transactions, extensions, and JSON schemas are not API-compatible.

```text
ProseMirror (low-level editor engine)
        └── Tiptap (higher-level API, extensions, UI, and services)

FountainJS (independent editor engine + first-party product modules)
```

Primary sources:

- [ProseMirror guide](https://prosemirror.net/docs/guide/)
- [ProseMirror reference manual](https://prosemirror.net/docs/ref/)
- [Tiptap overview](https://tiptap.dev/docs/editor/getting-started/overview)
- [Tiptap extension model](https://tiptap.dev/docs/editor/core-concepts/extensions)
- [FountainJS architecture](ARCHITECTURE.md)

## One-to-one engine comparison

| Concern | ProseMirror | FountainJS today | Honest verdict |
| --- | --- | --- | --- |
| Product level | A deliberately low-level toolkit; its guide describes it as building blocks rather than a drop-in editor | An engine plus `StarterKit`, optional product modules, DOM/Web Component/React surfaces, and a working playground | FountainJS starts closer to a usable product; ProseMirror gives lower-level control |
| Core packaging | Separate model, state, transform, and view packages plus optional official modules | One root core with isolated optional entries for large or policy-heavy capabilities | Different packaging choices; both are modular |
| Document model | Persistent schema-constrained tree of nodes and marks | Immutable schema-constrained tree of nodes and marks | Same architectural category, incompatible implementations |
| Positions | Integer document offsets resolved into tree context | Explicit node paths plus text offsets, with path/position conversion and mapped bookmarks | Different public coordinate systems; neither API can consume the other's positions |
| Changes | Transactions made from composable transform steps and step maps | Transactions made from immutable steps and composable mappings | Same pattern; ProseMirror has far more years of production hardening |
| Selection | Text, node, and all-document selections; gap cursor and table selections are separate modules | Text, node, gap, all-document, and table-cell selections in the public engine/modules | FountainJS integrates more selection types directly; ProseMirror's implementations are much more established |
| Commands | Functions over editor state with optional dispatch; keymaps and menus compose them | Typed immediate commands plus atomic `chain()` and non-mutating `can()` APIs | FountainJS offers a more product-oriented command surface; ProseMirror remains more proven |
| Plugins | Immutable plugin state, transaction filters/appends, props, decorations, metadata, and lifecycle through the view | Immutable plugin state, transaction filters/appends, input hooks, decorations, metadata, and lifecycle | Broad conceptual parity; APIs are not interchangeable |
| Extension composition | Applications combine schema specs, plugins, commands, and view props themselves or use ecosystem toolkits | `composeExtensions` merges named nodes, marks, plugins, commands, formats, and services with explicit conflict policy | FountainJS has a unified first-party composition contract; Tiptap supplies the analogous layer for ProseMirror users |
| DOM editing | `EditorView` projects state into `contenteditable` and turns browser input into transactions | `EditorView` does the same through FountainJS's own renderer, input manager, and selection bridge | Same role; ProseMirror has the larger real-world compatibility record |
| NodeViews and decorations | Mature public primitives used throughout the wider ecosystem | Framework-neutral NodeViews, React NodeViews, and inline/node/widget decorations with mapped paths | Core outcomes exist in both; ProseMirror leads on ecosystem experience |
| Default editor features | The essential core intentionally omits even common Enter behavior; official and community modules are assembled by the application | StarterKit provides common writing, links, lists, tables, media, history, input rules, and highlighting | FountainJS includes a broader ready-to-use baseline |
| Rich document modules | Basic schema, lists, tables, gap cursor, history, keymaps, input rules, Markdown, collaboration, and many community packages | First-party images/media, tables, details, math, Lean, mentions, emoji, slash commands, menus, comments, tracked changes, versions, and more | FountainJS ships more product outcomes together; ProseMirror has a much larger and older module ecosystem |
| Formats | Schema-aware DOM parser/serializer and JSON; official Markdown tooling is available | Lossless JSON plus safe schema-aware HTML, Markdown with explicit loss reports, and text | FountainJS makes these boundaries part of one public contract; neither format can preserve an unknown schema automatically |
| Collaboration | Official step-based collaboration module supports authority/version/rebase flows; Yjs integrations are available in the ecosystem | Provider-neutral collaboration lifecycle plus an optional generic Yjs tree adapter, relative presence, and author-local undo | Different collaboration models; FountainJS includes a direct Yjs path, while ProseMirror has deeper deployment history |
| Framework surfaces | The official view is DOM-based; framework integrations are provided by Tiptap and other projects | Official plain DOM, Web Component, and React entries; Vue/Svelte/Angular use the DOM or Web Component contract today | FountainJS is framework-neutral, but it does not yet have dedicated native adapters for every framework |
| UI | No required toolbar or product UI | Optional React toolbar, menus, navigator, comments, tracked review, and version panels; headless APIs remain usable elsewhere | FountainJS includes more UI, though most supplied rich UI is currently React |
| Hosted services | None required or bundled | None required; storage, media, authentication, collaboration, and AI use host-owned adapters | Similar ownership philosophy at the engine level |
| Maturity | Battle-tested foundation with a long production history and a large knowledge base | Early beta with explicit behavioral, package, bundle, and cross-browser gates | ProseMirror wins decisively today |
| Performance evidence | Mature transform/view implementation used by many production editors | Bundle ceilings exist, but large-document latency, rerender, and teardown benchmarks remain an open release item | ProseMirror wins until FountainJS publishes repeatable benchmark evidence |
| Ecosystem | Large direct ecosystem plus Tiptap and other frameworks built above it | Small new community and a growing first-party package | ProseMirror wins decisively; FountainJS can compete on included capability, not adoption yet |
| Compatibility | Native ProseMirror packages and every toolkit built for their types | FountainJS packages only | No drop-in compatibility: ProseMirror/Tiptap extensions must be ported |

## What Tiptap adds above ProseMirror

Tiptap is not merely a theme. It supplies the higher-level extension API,
command chaining, framework integrations, starter bundles, documented content
extensions, UI components/templates, and optional commercial or hosted
capabilities. That is why the primary parity programme compares FountainJS with
Tiptap: they occupy a more similar product layer.

ProseMirror remains the tougher engine-quality benchmark. Beating a Tiptap
feature checklist is not enough if FountainJS cannot also match ProseMirror's
correctness under complex transforms, browser edge cases, long documents,
composition, collaboration rebasing, and extension interactions.

## Where FountainJS can genuinely differentiate

- One public MIT package contains both the engine and first-party editing,
  review, collaboration, versioning, format, math, and proof-workflow modules.
- Provider boundaries keep storage, authentication, uploads, collaboration, and
  optional AI under the host application's control.
- The Web Component is a standards-based surface in addition to plain DOM and
  React.
- FountainJS can design every module around one conflict-checked composition
  contract and one release matrix because it owns the whole stack.
- Path-based public selections and operations can be easier to inspect in
  portable application data than opaque integer positions, though this must be
  validated with performance and mapping benchmarks rather than asserted as a
  universal advantage.

## Where FountainJS must still catch up

The [Tiptap capability programme](TIPTAP_PARITY.md) tracks visible product gaps.
Against ProseMirror specifically, the largest risks are production maturity,
transform/rebase depth, browser and IME edge cases, performance on very large
documents, framework-native adapters, extension compatibility tooling,
migration policy, and the number of independent products exercising the API.

FountainJS should not claim ProseMirror parity until repeatable benchmark,
fuzz/property, long-running collaboration, physical-device input, memory-leak,
and compatibility evidence exists. The honest objective is to exceed the
higher-level product capability while earning—not declaring—the same confidence
in the underlying engine.
