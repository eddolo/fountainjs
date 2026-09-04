# FountainJS → Tiptap capability programme

This document is the release gate for the work required to make FountainJS a
credible alternative to Tiptap. It compares user outcomes rather than copying
Tiptap's implementation or API. The comparison covers the open-source editor
and, separately, the hosted or paid capabilities that a product team can add to
Tiptap.

Primary comparison references:

- [Tiptap editor overview](https://tiptap.dev/docs/editor/getting-started/overview)
- [Tiptap extension system](https://tiptap.dev/docs/editor/core-concepts/extensions)
- [Tiptap collaboration](https://tiptap.dev/docs/collaboration/getting-started/overview)
- [Tiptap AI Toolkit](https://tiptap.dev/docs/ai/ai-toolkit/overview)
- [Tiptap conversion](https://tiptap.dev/docs/conversion/getting-started/overview)

The public Tiptap catalogue was last re-audited on **2026-09-04**. Catalogue
labels such as Open Source, Start, Team, and Add-on are availability boundaries,
not quality scores; a paid/cloud outcome still counts as a product capability
that FountainJS must either deliver or identify as a deliberate host boundary.

## Status language

- **Delivered**: public API, automated behavioural coverage, documentation, and
  a working example exist in the current release.
- **Partial**: a useful implementation exists, but an important behaviour,
  validation layer, or release gate is absent.
- **Missing**: FountainJS does not provide the outcome today. Being theoretically
  possible through a custom extension does not count as delivered.
- **Host boundary**: the editor exposes an integration point, while the host
  deliberately owns storage, authentication, transport, or another product
  concern.

## Definition of done

A row may move to **Delivered** only when all applicable gates pass:

1. The public API and behaviour are implemented without depending on React.
2. Unit tests cover success, failure, boundary, undo, and selection behaviour.
3. Playwright exercises the feature in Chromium, Firefox, and WebKit.
4. Keyboard-only and screen-reader semantics are documented and checked.
5. The feature has a real demo using the published package boundary.
6. API and architecture documentation explain extension and persistence rules.
7. ESM, CommonJS, React, and Web Component package smoke tests remain green.
8. Performance and memory baselines do not regress beyond the recorded budget.

## Baseline

### Editing engine

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| CORE-01 | Typed tree document with schema validation | Delivered | Continue compatibility and malformed-input coverage. |
| CORE-02 | Immutable state and explicit transactions | Delivered | Preserve as the collaboration layer is introduced. |
| CORE-03 | Positions survive multi-step document changes | Delivered | Step maps, mapping composition/inversion, automatic transaction-selection mapping, path/position conversion, and recoverable mapped selection bookmarks are implemented and tested. |
| CORE-04 | Text, node, gap, all-document, and table-cell selections | Delivered | Immutable selection variants map through steps and history; semantic typing/deletion/formatting, atomic pointer and arrow navigation, Ctrl/Cmd+A, exact block gaps, rectangular Shift-pointer and Alt+Shift+Arrow cell selection, DOM markers, public demos, and cross-browser contracts are included. |
| CORE-05 | Chained, dry-run-capable commands | Delivered | Typed immediate, atomic chained, and non-mutating `can()` surfaces compose every extension command with rollback, one-step history, reserved-name fallback, and a view-aware focus command covered in real browsers. |
| CORE-06 | Configurable input and paste rules | Delivered | Ordered input and paste rule plugins expose custom transaction handlers, immediate input undo, text/mark/wrapping helpers, repeated-match processing, and real-browser coverage. |
| CORE-07 | View-only inline, node, and widget decorations | Delivered | Immutable inline/node/widget sets, transaction mapping, plugin delivery, safe DOM rendering, overlapping-range segmentation, and browser contracts are implemented. |
| CORE-08 | Custom interactive node views | Delivered | Framework-neutral NodeViews have mapped reuse, live paths, update/recreate and cleanup contracts, contentDOM refresh, semantic selection hooks, event isolation, mutation recovery, reversible decorations, a separate React adapter, a live public demo, and unit/real-browser coverage. |
| CORE-09 | Predictable keyboard, IME, clipboard, and drag input | Delivered | Controlled input covers alternate composition commits without duplication, replacement/mobile input, rich structured paste, logical bidi and nested positions, selected-block native drag-move, semantic keyboard behavior, an optional bounded clipboard-history picker, and desktop plus emulated-mobile browser contracts. |
| CORE-10 | Configurable undo/redo | Delivered | Configurable local history plus Yjs local-origin undo/redo, remote-change preservation, explicit capture boundaries, and relative selection restoration are covered by 244 behavioral tests, the complete 150-test Chromium/Firefox/WebKit/mobile [CI run for `f98a1b5`](https://github.com/eddolo/fountainjs/actions/runs/33891892320), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33891892227), and live two-editor author-local undo verification. |

### Document capabilities

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| DOC-01 | Paragraphs, headings, quotes, breaks, dividers, and common marks | Delivered | Expand interoperability and browser coverage. |
| DOC-02 | Links with safe editing UI | Delivered | Safe normalization and host validation hooks, typed web/email autolinking, selection/caret link-on-paste, whole-link edit/remove, host-owned activation, React add/preview/title/target UI, and unit plus real-browser coverage are delivered. |
| DOC-03 | Bullet, ordered, nested, and task lists | Delivered | Multi-block wrapping, range-only conversion, mixed nesting, multi-item indent/lift, ordered-start preservation, task state, hierarchy-preserving boundary joins, nested HTML/Markdown round trips, keyboard behavior, React controls, and real-browser coverage are delivered. |
| DOC-04 | Code blocks with language-aware highlighting | Delivered | `StarterKit` adds live, non-persisted token and line-number decorations, normalized language metadata, safe host-tokenizer injection, editable React language/line-number controls, fenced Markdown and HTML interchange, and unit plus cross-browser editing coverage. |
| DOC-05 | Production table editing | Delivered | Span-aware geometry and repair, merged-cell-safe row/column transforms, merge/split, scoped header toggles, whole-row/column selection, pointer and keyboard column resizing, `colwidth` round trips, TSV/HTML clipboard handling, React controls, and unit plus cross-browser coverage are delivered. |
| DOC-06 | Images with upload, paste, drop, captions, and dimensions | Delivered | Typed block and inline images, mapped progress/cancel/retry uploads, fail-closed replacement, editable captions, safe metadata, alignment, responsive sources, load recovery, pointer/touch/keyboard resizing, React and Web Component workflows, interchange, and unit plus cross-browser coverage are delivered. |
| DOC-07 | Video, audio, files, and configurable embeds | Delivered | `MediaExtension` provides typed native playback with tracks, file cards, provider-scoped canonical embeds, mapped host-owned uploads, safe JSON/HTML/text/Markdown boundaries, accessible NodeViews and React controls, package-backed React/Web Component demos, undo/selection/failure coverage, all-engine browser contracts, lifecycle cleanup, and enforced release-size budgets. |
| DOC-08 | Mentions, emoji, typography, and character count | Delivered | Independent framework-neutral extensions, cancellable/stale-safe multi-trigger suggestions, safe mention/emoji atoms and interchange, curated plus isolated complete RGI emoji catalogues, configurable RTL-aware typography with literal undo, enforced custom counting/limits, accessible React UI, package-backed demos, unit coverage, and green Chromium/Firefox/WebKit plus mobile browser contracts are live. |
| DOC-09 | Native inline and display mathematics from LaTeX | Delivered | Opt-in framework-neutral math nodes store editable TeX and labels; commands, isolated input/paste rules with literal undo, safe source fallback, caller-owned DOM renderers, a trust-disabled KaTeX adapter, JSON/HTML/Markdown/text round trips, unit tests, and the public headless demo are delivered. |
| DOC-10 | Lean 4 source and interactive proof workflows | Partial | Portable Lean blocks, Unicode entry/highlighting, source-only operation, validated local/remote/managed/one-shot provider contracts, mapped transient diagnostics, exact-range selection, and a framework-neutral InfoView for checks, goals, hover, expected types, and completion are delivered. Add a hardened reference loopback bridge and real Lean integration tests before marking delivered. |
| DOC-11 | Collapsible details/summary content | Missing | Add schema-valid details and summary nodes, nested editing, keyboard behavior, interchange, and accessible disclosure rendering. |
| DOC-12 | Ruby annotations | Missing | Add portable ruby/base/annotation structure with safe HTML and plain-text fallbacks. |
| DOC-13 | Text style suite: foreground/background colour, font family, font size, and line height | Partial | Foreground colour and attributed background highlighting are delivered. Add validated font-family, font-size, and line-height marks/attributes, controls, interchange, and sanitization. |
| DOC-14 | Page layout, margins, page breaks, headers, and footers | Missing | Add a composable page model and print layout without coupling the document schema to one renderer. |
| DOC-15 | Live table of contents | Missing | Add stable heading anchors, flat/hierarchical indexes, active-section state, and framework-neutral navigation. |
| DOC-16 | Invisible-character visualization | Missing | Add view-only whitespace, hard-break, and paragraph markers with accessible enable/disable controls. |
| DOC-17 | Stable unique node identifiers | Missing | Add configurable id generation, paste/collaboration collision repair, filtering, and migrations. |
| DOC-18 | Guaranteed trailing editable block | Missing | Add a schema-aware trailing-node extension with undo, collaboration, and nested-root coverage. |
| DOC-19 | Office and external-app paste normalization | Partial | Rich HTML, spreadsheet grids, nested lists, images, and safe fallback are delivered. Add explicit Word, Google Docs, and Excel fixture suites plus configurable cleanup policies. |

### Product UI

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| UI-01 | Usable toolbar and starter editor | Delivered | Stable action/group composition, dependency-free icons, label/icon/render overrides, selection-safe mouse/pen/touch activation, RTL keyboard traversal, responsive scrolling, package checks, and package-backed desktop/mobile demos are covered by 210 behavioral tests, the complete 133-test all-engine CI matrix, and deployed-site verification. |
| UI-02 | Bubble and floating menus | Delivered | Framework-neutral named controllers, semantic default/custom visibility, reusable selection geometry, collision-aware placement, accessible React renderers, and package-backed desktop/mobile demos are covered by the complete release gate, all-engine CI, and deployed-site verification. |
| UI-03 | Slash-command menu | Delivered | A framework-neutral live registry, eleven schema-aware defaults, stable grouped filtering, cancellable async sources, atomic execution/rollback, keyboard/touch control, accessible React UI, and package-backed desktop/mobile demos are covered by the complete release gate, all-engine CI, and deployed-site verification. |
| UI-04 | Drag handles and block reordering | Delivered | Path-based schema-valid nested/cross-parent moves, visible contextual handles, real drop indicators, touch/keyboard buttons, host candidate/label policy, one-step undo, and framework-neutral/React/Web Component surfaces are covered by 217 behavioral tests, the complete 138-test Chromium/Firefox/WebKit/mobile [CI run for `02f8385`](https://github.com/eddolo/fountainjs/actions/runs/33880904977), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33880904970), and live-site interaction/console verification. |
| UI-05 | Search and replace | Delivered | Add regex/whole-word options only if justified by product evidence. |
| UI-06 | General drop cursor | Partial | Block reordering has an exact drop indicator. Add a framework-neutral cursor for arbitrary draggable inline and block content. |
| UI-07 | Placeholder, focus, and blurred-selection persistence | Delivered | The DOM/React/Web Component surfaces expose placeholders, programmatic focus, selection state, and mapped restoration; keep them in browser and accessibility gates. |

### Collaboration and review

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| COLLAB-01 | Concurrent conflict-free document editing | Delivered | The optional Yjs adapter provides character-level text merging, retained structural identity, independent node attributes, disconnected convergence, deterministic seed repair, schema-safe remote application, and local-origin history. It is covered by 244 behavioral tests, the complete 150-test Chromium/Firefox/WebKit/mobile [CI run for `f98a1b5`](https://github.com/eddolo/fountainjs/actions/runs/33891892320), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33891892227), and live deployed two-document convergence plus author-local undo. |
| COLLAB-02 | Provider-independent synchronization | Delivered | Framework-neutral lifecycle/status/reconnect contracts keep WebSocket, WebRTC, managed, custom, and offline providers optional while authentication, authorization, persistence, and retention stay host-owned. Adapter teardown, failure containment, package boundaries, documentation, the complete [CI gate](https://github.com/eddolo/fountainjs/actions/runs/33891892320), and the deployed provider-boundary demo verify the contract. |
| COLLAB-03 | Presence and remote selections | Delivered | Awareness-relative text selections, normalized immutable users, overlapping-safe accessible range/caret decorations, departure cleanup, and the two-editor demo are covered by unit and all-engine browser tests in the complete [CI run](https://github.com/eddolo/fountainjs/actions/runs/33891892320), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33891892227), and live deployed peer/caret verification. |
| COLLAB-04 | Threaded inline and document comments | Delivered | Provider-neutral thread records and lifecycle; inline/cross-block, point, block, and document anchors; overlapping decorations; mapped movement, deterministic recovery/orphan reattachment; replies, rich bodies, editing, reactions, resolve/archive/delete; permission hooks; authoritative storage operations plus an in-memory reference; accessible React UI; isolated ESM/CommonJS/types entries; and production/security guidance are covered by 252 behavioral tests, the complete 153-test Chromium/Firefox/WebKit/mobile [CI run for `75ae25f`](https://github.com/eddolo/fountainjs/actions/runs/33895703954), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33895703856), and live deployed verification of shared annotations, reply, reaction, resolution, and document-thread creation. |
| COLLAB-05 | General tracked changes and suggestion mode | Delivered | Provider-neutral insertion/deletion/exact replacement, mark, attribute, atom/table, and structural proposals; bounded portable author/time/reason/comment metadata; same-author grouping and nested records; individual/range/author/filtered batch accept/reject; enable/user/selection/hover/events; undo; Yjs no-retrack propagation; isolated ESM/CommonJS/types; and an accessible full-text React panel are covered by 265 behavioral tests, packed-tarball package/type validation, the complete 161-test Chromium/Firefox/WebKit/mobile [CI run for `4665b50`](https://github.com/eddolo/fountainjs/actions/runs/33900282765), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33900282688), and live deployed acceptance/rejection plus complete-text verification. |
| COLLAB-06 | Named versions, comparison, and restoration | Missing | Add snapshot provider contracts, structural diff, preview, and restore transactions. |

### AI

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| AI-01 | Inspectable, provider-independent text proposals | Delivered | Preserve local ownership and explicit disclosure. |
| AI-02 | Human accept/reject with stale-result protection | Delivered | Rebase proposals once mapped positions exist. |
| AI-03 | Streaming generation | Missing | Add abortable incremental proposals that never corrupt document state. |
| AI-04 | Schema-aware document tools for agents | Missing | Expose constrained read, insert, replace, format, and structure tools with validation. |
| AI-05 | Multi-turn AI conversation and reusable prompts | Missing | Add host-owned conversation and prompt-store contracts plus optional UI. |
| AI-06 | Generated media workflows | Missing | Connect generated assets through the normal upload/media boundary. |

### Interoperability and surfaces

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| FORMAT-01 | Lossless, validated JSON | Delivered | Add a versioned migration contract and published JSON Schema. |
| FORMAT-02 | Safe HTML import/export | Delivered | Schema-owned custom node/mark rules, wrapped content, priority and failure fallback, custom-mark output, common CSS/link semantics, generic executable-output hardening, and complete-tree validation are covered by 223 behavioral tests, the complete 141-test Chromium/Firefox/WebKit/mobile [CI run for `0275e49`](https://github.com/eddolo/fountainjs/actions/runs/33883485597), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33883485439), and a clean live-site custom-callout HTML paste with attribute preservation. |
| FORMAT-03 | Markdown import/export | Delivered | Titled inline plus full/collapsed/shortcut reference links and images, deterministic deduplicated reference export, recursive quotes, loose multi-block lists, aligned tables with escaped pipes and normalized rows, complete-tree validation, and immutable path-based extension-loss reports are covered by 230 behavioral tests, the complete 144-test Chromium/Firefox/WebKit/mobile [CI run for `fb81fcc`](https://github.com/eddolo/fountainjs/actions/runs/33886350283), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33886350370), and live headless-demo conversion with no reported losses. |
| FORMAT-04 | Plain-text projection | Delivered | Preserve as a deliberately lossy boundary. |
| FORMAT-05 | DOCX, PDF, ODT, and EPUB workflows | Missing | Define open conversion adapters and ship at least DOCX import/export plus print-quality PDF. |
| SURFACE-01 | Plain DOM integration | Delivered | Add lifecycle stress and multi-editor tests. |
| SURFACE-02 | React integration | Delivered | Add server-rendering guidance and concurrent React coverage. |
| SURFACE-03 | Standards-based Web Component | Delivered | Add form association, attributes/events completeness, and browser tests. |
| SURFACE-04 | Native Vue, Svelte, and Angular bindings | Partial | Recipes exist; publish thin, tested first-party bindings where they improve ergonomics. |
| SURFACE-05 | Headless/server document processing | Partial | Separate every DOM-dependent format path and publish explicit server entry points. |

### Production readiness and ecosystem

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| PROD-01 | Cross-browser desktop confidence | Partial | A Chromium/Firefox/WebKit Playwright lane now covers core input, cross-block and semantic selections, mapped decorations, input-rule undo, and the React playground; expand it across every editing capability. |
| PROD-02 | Mobile and IME confidence | Partial | Cross-engine composition order, replacement input, deletion, history, and responsive-layout contracts run in Pixel/Chromium and iPhone/WebKit emulation; add physical iOS/Android device-farm runs for real virtual keyboards and autocorrect. |
| PROD-03 | Accessibility conformance | Partial | Establish WCAG 2.2 AA targets, automated checks, manual screen-reader scripts, and fixes. |
| PROD-04 | RTL and localization | Partial | Logical replacement inside mixed Hebrew/Latin/Arabic content is covered across browsers; add explicit block direction, bidi-aware visual navigation checks, translatable UI strings, and locale packages. |
| PROD-05 | Performance and memory budgets | Missing | Benchmark large documents, transaction latency, rerenders, startup size, and teardown leaks. |
| PROD-06 | Extension authoring and compatibility tooling | Missing | Add a scaffold, conformance suite, manifest metadata, examples, and compatibility policy. |
| PROD-07 | Stable releases and migrations | Partial | Publish API stability levels, deprecations, migrations, security policy, and release evidence. |
| PROD-08 | Operable collaboration/document backend | Host boundary | FountainJS deliberately accepts offline, WebSocket, WebRTC, managed, and custom providers instead of requiring one cloud. Ship a hardened self-host reference stack and deployment tests so teams are not forced to design the operational layer from scratch. |
| PROD-09 | Comment/document APIs, webhooks, and notifications | Host boundary | Storage and authorization hooks exist; add reference REST/webhook contracts and notification examples while leaving deployment and identity under host control. |

### Catalogue coverage notes

The audit explicitly maps every distinct outcome in the current
[Tiptap extension catalogue](https://tiptap.dev/docs/editor/extensions/overview).
Bundle extensions such as StarterKit, ListKit, TableKit, and TextStyleKit do not
receive duplicate rows because their underlying outcomes are already listed.
YouTube and Twitch map to DOC-07's provider-gated embeds; Audio maps to native
media; FileHandler maps to DOC-06/DOC-07 uploads; Gapcursor and Selection map to
CORE-04; Focus and Placeholder map to UI-07; Color and Background Color map to
DOC-13; and Snapshot, Compare, Comments, Collaboration, Tracked Changes, AI, and
Conversion map to their named rows above. A theoretically possible custom
extension is never counted as a delivered first-party capability.

## Delivery order

The programme follows dependency order rather than visible-feature order:

1. **Mapped editing foundation** — CORE-03 through CORE-10.
2. **Professional single-user editing** — DOC and UI rows.
3. **Collaboration and review** — COLLAB rows, built on mappings and decorations.
4. **Agent-grade editing** — AI rows, built on safe mapped transactions.
5. **Interoperability and first-party surfaces** — FORMAT and SURFACE rows.
6. **Production proof and ecosystem** — PROD rows.

No website, README, or npm description may claim Tiptap parity while any required
row remains Partial or Missing. Individual capabilities may be advertised only
with links to their release evidence.
