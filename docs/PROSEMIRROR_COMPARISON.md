# FountainJS versus ProseMirror + Tiptap

Last reviewed against the public documentation on **2026-09-05**.

## The correct comparison

ProseMirror is the editor-engine foundation beneath Tiptap. Tiptap's own
documentation says that it wraps ProseMirror with a higher-level,
framework-neutral API. The useful comparison is therefore not only FountainJS
versus Tiptap's surface or FountainJS versus ProseMirror's engine. It is the
complete ProseMirror + Tiptap stack versus the complete FountainJS stack.

```text
ProseMirror engine
  schema + document + state + transactions + plugins + DOM view
        ↓
Tiptap product/developer layer
  extensions + commands + framework bindings + UI + optional services

                         versus

FountainJS integrated stack
  independent engine + one extension contract + first-party product modules
```

FountainJS is not a wrapper around ProseMirror and has no `prosemirror-*`
runtime dependency. It independently owns the schema tree, state, steps,
mappings, transactions, selections, plugins, decorations, NodeViews, DOM view,
extension composition, framework surfaces, and higher-level modules. This is an
architectural comparison, not a compatibility claim: ProseMirror and Tiptap
classes, positions, transactions, extensions, and schemas cannot be passed into
FountainJS without a deliberate port.

Primary sources:

- [ProseMirror guide](https://prosemirror.net/docs/guide/)
- [ProseMirror reference manual](https://prosemirror.net/docs/ref/)
- [Tiptap overview](https://tiptap.dev/docs/editor/getting-started/overview)
- [Tiptap extension model](https://tiptap.dev/docs/editor/core-concepts/extensions)
- [FountainJS architecture](ARCHITECTURE.md)
- [FountainJS portability audit](PORTABILITY_AUDIT.md)

## Community friction translated into engineering requirements

Issue counts are not a quality score, and a single report is not proof that all
users experience a defect. They are still valuable when they expose a concrete
failure mode that FountainJS can reproduce and prevent. The following signals
come from maintainer documentation, project forums, or upstream issue trackers
rather than comparison marketing:

| Verified signal | FountainJS requirement | Current evidence |
| --- | --- | --- |
| ProseMirror's maintainer describes the system as necessarily complicated, and its forum records repeated requests for practical end-to-end examples ([documentation discussion](https://discuss.prosemirror.net/t/planning-new-documentation/861), [tutorial discussion](https://discuss.prosemirror.net/t/is-there-a-tutorial/1592), [examples discussion](https://discuss.prosemirror.net/t/where-examples-can-be-found/2689)) | A developer must be able to begin with a complete editor, learn one mental model, and follow working code from input through state, extensions, and persistence | The developer guide, source tour, API guide, ten package-backed demos, extension examples, non-destructive package scaffold, conformance runner, and whole-install doctor exist; independent timed onboarding/time-to-first-extension testing remains open |
| Tiptap's own performance guide says React over-rendering is its most common integration problem and documents special subscription/render controls ([performance guide](https://tiptap.dev/docs/guides/performance), [React changelog](https://tiptap.dev/docs/resources/changelog/react)) | Core transactions must not require framework rerenders; framework hooks must subscribe narrowly, survive Strict Mode, and release each view exactly once | FountainJS keeps the DOM view outside React rendering, uses `useSyncExternalStore`, and now proves single construction plus exact cleanup across twenty Strict Mode mount/rerender/unmount cycles |
| Upstream reports document a collaboration extension retaining a destroyed `Y.Doc` after React lifecycle changes and excessive presence traffic under Strict Mode ([#6882](https://github.com/ueberdosis/tiptap/issues/6882), [#4482](https://github.com/ueberdosis/tiptap/issues/4482)) | Collaboration ownership and replacement must be explicit; reconnect/remount must not retain a stale document, duplicate listeners, or multiply presence messages | FountainJS has generation-scoped contexts, public live adapter/`Y.Doc`/provider replacement, stale-session rejection, exact listener-count reconnect tests, default deduplicated 32 ms presence coalescing, and multi-editor DOM-selection ownership; all 184 Chromium/Firefox/WebKit/mobile browser checks passed in [CI run `eb9120a`](https://github.com/eddolo/fountainjs/actions/runs/33921214852) |
| Upstream reports describe large-document typing and React NodeView costs ([#4491](https://github.com/ueberdosis/tiptap/issues/4491), [#4492](https://github.com/ueberdosis/tiptap/issues/4492)); a 2026 discussion reports full-document collaboration validation on each Yjs transaction at roughly 500,000 words ([#8013](https://github.com/ueberdosis/tiptap/discussions/8013)) | Publish reproducible local/remote edit, render, memory, and teardown curves; prove a one-character edit does not accidentally perform avoidable full-document conversion or validation | FountainJS has enforced production-build curves through 10,000 blocks, live/teardown heap gates, identity-preserving DOM reconciliation, zero-churn unchanged React NodeViews, and direct Yjs text-delta application; all 187 Chromium/Firefox/WebKit/mobile browser checks passed in [CI run `4b2990a`](https://github.com/eddolo/fountainjs/actions/runs/33923645172). |

This evidence does not make FountainJS faster or easier by declaration. It
defines adversarial acceptance tests. FountainJS should claim an advantage only
after those tests are public, repeatable, and kept as release gates.

## One-to-one full-stack comparison

| Concern | ProseMirror + Tiptap | FountainJS today | Honest verdict |
| --- | --- | --- | --- |
| Stack ownership | ProseMirror supplies the independent low-level engine; Tiptap supplies a separate higher-level platform over it | FountainJS owns an independent engine and its higher-level modules under one project and extension contract | FountainJS can coordinate the whole stack directly; the older two-layer stack has far more operational proof |
| Product readiness | ProseMirror alone is building blocks; Tiptap adds StarterKit, extensions, commands, framework integrations, UI, and services | Core, `StarterKit`, optional modules, plain DOM, Web Component, React UI, and a working playground ship together | Same broad product category when ProseMirror and Tiptap are treated as one stack |
| Core packaging | Multiple ProseMirror engine packages plus Tiptap core, extension, framework, UI, and service packages | One combined browser-oriented root with isolated optional entries for large or policy-heavy capabilities; the model/transaction runtime works in Node, but a DOM-free core entry and declaration boundary are still missing | ProseMirror/Tiptap has cleaner package-level engine separation today; FountainJS's audited headless boundary is an explicit open gap |
| Document model | ProseMirror's persistent, schema-constrained node/mark tree exposed through Tiptap | FountainJS's immutable, schema-constrained node/mark tree | Same architectural category, independent implementations |
| Positions | ProseMirror integer offsets and resolved positions used by Tiptap | Explicit node paths plus text offsets, with mapped bookmarks and path/position conversion | Different coordinate systems; Fountain paths are directly inspectable, while ProseMirror positions have much deeper production proof |
| Changes | ProseMirror transform steps, maps, mappings, and transactions surfaced by Tiptap commands | FountainJS immutable steps, maps, mappings, transactions, and commands | Same engineering pattern; ProseMirror is much more battle-tested |
| Selections | ProseMirror text/node/all selections plus gap and table-selection modules, surfaced by Tiptap extensions | Text, node, gap, all-document, and table-cell selections in the Fountain engine/modules | Broad outcome parity; ProseMirror/Tiptap leads on edge-case history |
| Commands | ProseMirror commands plus Tiptap's chainable commands and `can()` checks | Typed immediate commands plus atomic `chain()` and non-mutating `can()` | Similar product ergonomics; APIs are unrelated |
| Plugins and extensions | ProseMirror plugin/state/view primitives underneath Tiptap's higher-level extension API | One named contract composes nodes, marks, plugins, commands, formats, and services; versioned manifests, ordered requirements, hard collision checks, a package scaffold, conformance fixtures, and `doctor` validate independently published modules | FountainJS integrates authoring and compatibility checks into one contract; ProseMirror/Tiptap still has a far larger and more proven extension ecosystem |
| DOM editing | ProseMirror `EditorView`, browser input handling, decorations, and NodeViews used through Tiptap | FountainJS `EditorView`, selection bridge, input manager, decorations, and NodeViews | Same role; ProseMirror wins on accumulated browser and IME evidence |
| Framework surfaces | Tiptap provides official bindings above ProseMirror for its supported frontend frameworks | Official plain DOM, Web Component, and React entries; Vue, Svelte, and Angular use the DOM/Web Component contract today | FountainJS is framework-neutral but still lacks dedicated native packages for several frameworks |
| Ready-made writing | Tiptap StarterKit plus its extension catalogue supply the common editor surface | FountainJS StarterKit supplies writing, lists, tables, links, media, history, rules, and highlighting | Comparable intention; the live capability ledger records exact gaps rather than assuming parity |
| Rich modules | Large Tiptap first-party/community catalogue over ProseMirror, with some outcomes in paid, add-on, or hosted products | First-party public modules for media, details, math, Lean, mentions, emoji, menus, clipboard history, comments, tracked changes, versions, and more | FountainJS aims to include more outcomes as public MIT modules; the ProseMirror/Tiptap ecosystem remains much broader |
| Formats | ProseMirror schema-aware DOM/JSON foundations, community tooling, and Tiptap conversion products | Validated and independently versioned JSON with sequential migrations plus safe schema-aware HTML, Markdown with explicit loss reports, and readable text | FountainJS has one explicit in-package format and migration contract; major office/ebook conversion gaps remain |
| Collaboration | ProseMirror step collaboration, ecosystem Yjs bindings, and Tiptap collaboration/cloud products | Provider-neutral lifecycle plus optional generic Yjs tree adapter, relative presence, and author-local undo | FountainJS provides an open provider boundary; ProseMirror/Tiptap has deeper deployment and administration maturity |
| Review and history | Tiptap offers collaboration comments, tracked changes, and version-history products above ProseMirror | Public provider-neutral comments, tracked changes, versions, diff, restore, and optional React panels | FountainJS includes these as MIT package modules; production scale and independent adoption are still unproven |
| UI | Tiptap UI components, templates, and application kits over its headless editor | Optional React toolbar, menus, navigator, comments, review, and version panels; headless APIs remain usable anywhere | Both can supply product UI; most Fountain rich UI is currently React |
| Hosted services | Tiptap offers optional managed collaboration, conversion, AI, and other platform services | No Fountain service is required; applications own storage, auth, uploads, collaboration transport, and optional AI through adapters | FountainJS maximizes host control; Tiptap offers more turnkey infrastructure |
| Licensing boundary | ProseMirror and Tiptap have open-source cores; availability varies across Tiptap packages, add-ons, and managed products | Every counted Fountain capability must be source-public and MIT-licensed in the npm package; infrastructure stays behind replaceable host adapters | FountainJS's intended differentiator is one clear open-source capability boundary, not the vague word “free” |
| Maturity | ProseMirror has a long production history; Tiptap adds a large user base, documentation set, and commercial organization | Early beta with automated behavior, package, size, and cross-browser gates | ProseMirror + Tiptap wins decisively today |
| Performance evidence | Mature engine used across many products, with years of real-world tuning | Reproducible built-package latency curves, long-session/teardown heap gates, bundle ceilings, DOM mutation/identity checks, browser input-to-paint gates, and bounded 100,000-block top-level virtualization across five browser/mobile projects run in public CI | ProseMirror + Tiptap still wins on accumulated production evidence; FountainJS now has an inspectable, enforced regression contract rather than an unmeasured claim |
| Ecosystem | Large combined package, integration, tutorial, contributor, and production ecosystem | Small new community and a growing first-party package | ProseMirror + Tiptap wins decisively on adoption; FountainJS can compete on included capability, coherence, and openness |
| Compatibility | Native use of ProseMirror packages and Tiptap extensions | FountainJS packages and extension API only | No drop-in compatibility; extensions must be ported intentionally |
| Releases and stored-data evolution | Separate mature upstream packages use SemVer; application schemas and their persisted-data evolution remain application concerns | Public API/deprecation levels, a reviewed declaration snapshot, versioned document envelope and migration runner, JSON Schema, exact release metadata, package/browser gates, rollback rules, and OIDC provenance live in one repository contract | FountainJS makes the release and document-upgrade path unusually explicit; ProseMirror + Tiptap still has far more real upgrade history |

## Why ProseMirror still receives its own engineering checks

The full-stack scorecard is ProseMirror + Tiptap versus FountainJS. ProseMirror
alone remains the right lower-level reference when testing the parts Tiptap
inherits: transaction correctness, rebasing, selection mapping, DOM mutation
recovery, IME behavior, NodeView lifecycle, large documents, and extension
interaction. Passing a Tiptap feature checklist would mean little if the
FountainJS engine underneath those features were unreliable.

## What “open source” means in this programme

“Open source” is a verifiable distribution and licensing boundary, not a price
slogan. A capability counts only when its implementation, types, tests, and
documentation are public in this repository; its package entry is published to
the public npm package under the MIT license; it works without a mandatory
Fountain account, license key, private registry, or Fountain-hosted service; and
developers may inspect, fork, modify, redistribute, self-host, and replace its
provider integrations under the MIT terms.

That does not make third-party infrastructure costless. A host may still pay its
chosen database, object-storage, model, conversion, or collaboration provider.
FountainJS keeps those concerns behind replaceable interfaces and supplies
usable local/reference implementations where appropriate. The editor capability
remains open source even when the application chooses a paid external service.

## Where FountainJS can genuinely differentiate

- One public MIT package can contain the engine and first-party editing, review,
  collaboration, versioning, format, mathematics, and proof-workflow modules.
- Owning both layers makes it possible to design every module around one
  conflict-checked extension contract, portable JSON model, and release matrix.
- Provider boundaries keep storage, authentication, uploads, synchronization,
  conversion, and optional AI under the application owner's control.
- A Web Component and plain DOM API provide standards-based integration in
  addition to React.
- Path-based public operations are directly inspectable in application data;
  their measured limits and remaining linear work are published rather than
  presented as an assumed advantage.

## Where FountainJS must still catch up

The [capability programme](TIPTAP_PARITY.md) compares visible outcomes with the
combined stack. Its largest open risks are production maturity, transform and
rebase depth, browser/IME edge cases, performance on very large documents,
native framework adapters, office conversion, real-world upgrade history,
extension porting guidance, and independent products exercising the API.

FountainJS should not claim full-stack parity until fuzz/property testing,
long-running collaboration and browser soaks, physical-device input, real-world
migration history, independent production traces, and the remaining capability
rows are complete. The objective is to exceed the combined stack's included product
capability while earning—not declaring—the same confidence in the engine.
