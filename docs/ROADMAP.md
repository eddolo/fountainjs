# FountainJS roadmap

Updated 2026-11-12.

FountainJS is an MIT-licensed structured-document engine with a web editor,
framework bindings, and optional document modules. The immediate goal is a
reliable beta that developers can install, integrate, and evaluate through
complete editing, review, and conversion workflows.

## Next beta

The local candidate version is **0.5.0-beta.1**, not yet published. The next minor version accounts for the
change to the default Yjs storage adapter. Existing XML rooms require the legacy
entry or an explicit migration. The [adoption guide](YJS_DEFAULT_ADOPTION.md)
explains both routes.

The candidate includes the existing local engine, format, framework, and UI work.
Its scope is fixed around the following outcomes.

| Outcome | Acceptance evidence |
| --- | --- |
| Ordinary editing preserves content and selection | Native typing, Enter, deletion, forward/backward selection, tables, quotes, math, clipboard, and undo/redo work through public editor controls. |
| Collaboration preserves both authors' work | Offline and concurrent edits converge, author undo is isolated, room replacement preserves drafts, and recovery survives retries and reload. |
| Document conversion reports its actual fidelity | Supported Markdown, HTML, DOCX, JSON, and PDF workflows preserve their documented subset and report conversion losses. Actual exports receive visual review. |
| Applications can adopt the editor | Plain DOM, React, Web Component, Vue, Svelte, and Angular integrations have runnable examples and guides. Existing framework forms retain their values and reset behavior. |
| The tested package is the shipped package | One candidate revision passes package, browser, runtime, type, size, and performance gates. Published docs and demos identify its version and limits. |

Capability fixes that meet these outcomes take priority. The broader ideas below
remain available for later releases.

## Release gates

The beta remains pending until the candidate has the following evidence.

1. A complete `pnpm check` run for the exact runtime revision, including all
   source tests and existing latency, memory, and code-size limits.
2. Hosted CI covering Chromium, Firefox, WebKit, Android/Chromium emulation,
   and iPhone/WebKit emulation, including default Yjs and migration recovery.
3. Packed ESM/CommonJS imports and types, both Angular ESM entries, and clean
   consumer installation. Node, Bun, Deno, and workerd cover the server entry.
4. Real Lean integration against the pinned toolchain and recorded visual
   review of the release's editor, reader, and export workflows.
5. Matching version, tag, changelog, website, and package metadata. The approved
   npm stage and a registry installation establish publication.

The commands and publication procedure are in [RELEASES.md](RELEASES.md).
The latest complete local `pnpm check` passes **5,389 tests in 332 files**,
including the external source-capture API and inline-atom caret repairs. All
package/API, server/headless, format, type, size, performance and retention gates
pass. Compiled native reference typing/deletion/undo passes in all three desktop
engines. The broader GitLab profile remains 11 passes/one Windows WebKit copy
failure, with all four cases passing in Linux WebKit/Xvfb. The GitLab codec is
partial; unchanged source can be exact, but edited output is currently canonical.
This is not full product, physical-device, packed-consumer or hosted-release proof.
[Current evidence and missing conversions](../integrations/gitlab/README.md#gitlab-rendered-document-codec).

The following private integration audit repairs conversion failures interrupting
view updates and reference clicks leaving an editable draft. Explicit error
events with no current Markdown allow the host to prevent stale submission;
Undo and reload recover. All 54 focused cases, root types, nine compiled Windows
and five Linux WebKit native journeys pass. The 5,393-test full unit run precedes
the seven added interaction cases; the full package gate above remains the
5,389-test checkpoint. Actual host save/storage/auth and full product integration
remain unfinished. [Recovery evidence](../integrations/gitlab/README.md#serialized-content-lifecycle).

The subsequent GitLab math adapter reuses native editable math for the tested
dollar, legacy-backtick, inline-display, fenced and retained-annotation forms.
The final complete unit suite passes **5,437 tests in 335 files**, including 37
math cases; 91 focused cases and root types pass. Recorded current math journeys
pass in all desktop engines and all six Linux WebKit component journeys pass.
Known conversion refusals remain explicit. This is not a full GitLab application
or a refreshed complete package/hosted gate, and parity-row counts are unchanged.
[Math evidence and limits](../integrations/gitlab/README.md#gitlab-math-adapter).

A prepared patch now guards the actual GitLab host's rich-to-Markdown handoff:
read current serialized content before unmounting, keep the document open on
refusal, and route restored-mode preferences through the same check. The native
Fountain surface provides this protocol through a host-owned reader and
composition tracking. The full unit suite passes **5,452 cases/336 files**;
fifteen handoff cases, thirty focused cases, current native journeys and root
types pass. The actual GitLab application/upstream Jest suite remains unfinished.
No parity row is promoted.
[Host patch and scope](../integrations/gitlab/README.md#prepared-host-markdown-handoff-patch).

The cumulative patch now also guards native submission, the fresh-value facade
and the actual legacy asynchronous submit handler. Current fields are published
synchronously; conversion/composition refusal, changed content during checks and
duplicate attempts stop submission without clearing newer drafts. The complete
unit suite passes **5,472 cases/338 files**, 35 focused cases and root types pass,
and current Windows/Linux component journeys pass in their documented profiles.
These are selected-host/component checks, not real server acceptance. Arbitrary
custom AJAX handlers, upstream suites and authenticated application workflows
still need verification. A separately pinned real GitLab baseline is prepared;
the matching replacement build is not finished. Capability counts are unchanged.
[Submission scope](../integrations/gitlab/README.md#prepared-current-document-submission-patch).

The real original GitLab baseline now runs at the matched `19.5.3` image/source
pin. Recorded native Linux Chromium verifies authenticated issue creation,
image upload, rich editing, UI save/reopen, anonymous denial and exact saved
source/image retention after a container restart. The original source passes
160 tests; the matching prepared host patch passes 168 in the same three GitLab
Jest suites. Optional alert handlers and incomplete unit setup were repaired
without relaxing assertions or timeouts. The refreshed Fountain unit suite
passes 5,472 cases/338 files. The running application still uses its original
frontend; deployment of the complete Fountain component/toolbars/adapters and
broader product acceptance remain unfinished. No parity row is promoted.
[Real-product baseline and remaining scope](../integrations/gitlab/README.md#real-gitlab-original-product-baseline).

The earlier complete local source check is the November 11 runtime-editability
repair: **5,300 tests in 327 files**, with all package, server, type, conformance,
size, performance and retention gates passing. Three native interaction-mode
journeys pass on Chromium/Firefox/WebKit. The actual Vue 2 surface bridge passes
both journeys in Chromium/Firefox on Windows and WebKit on Linux Xvfb; the
Windows WebKit external-copy failure remains recorded with an independent
control. This runtime change supersedes earlier archive identity claims: a
fresh final package and combined hosted checks remain required.
[Current bridge evidence](../integrations/gitlab/README.md#implemented-integration-primitive).

The subsequent serialized-content controller adds asynchronous load/template
history, cancellation, conflict protection and host change notifications. The
complete unit suite passes **5,311 tests in 328 files**, and root TypeScript
passes. Its native lifecycle journey passes in all desktop engines and Linux
WebKit; the existing Windows WebKit external-copy failure remains. These checks
use an explicit ordinary-Markdown codec, not a completed GitLab dialect adapter.
No library runtime/API or size limit changes in this follow-up.
[Lifecycle scope and evidence](../integrations/gitlab/README.md#serialized-content-lifecycle).

The GitLab resolver now implements the six rendered-resource/reference
operations using the host render callback, inert HTML parsing, bounded caching,
retry and cancellation. Thirty-seven focused Node cases and root TypeScript
pass; the private browser bundle compiles. Pinned fixture extraction records
provenance and retains the upstream license. A live public render attempt
returns 401, so no authenticated service or full-application pass is claimed.
The subsequent complete unit run passes **5,348 tests in 329 files**; this is
not a repeat of all packaging/browser/release gates.
[Resolver scope](../integrations/gitlab/README.md#rendered-resource-and-reference-resolver).

The earlier complete local source-check checkpoint is `e15335c7`, including the offline
equation HTML projection and earlier image-caption/recorded-audit repairs. Its library runtime is byte-identical to
`024ff8fe`, including the virtual-layout host-control repair. It passes all 5,279 source tests in 323 files and the
package, Node/workerd, type, performance, retention, format and size gates.
Fresh packed ESM/CommonJS consumers and both type analyses also pass outside
the repository without browser globals, React, Yjs or jsdom. Publint retains
its existing DOCX warning.

The complete local editor/mobile run finishes with 1,063 passes, 19 existing
skips and two Firefox lazy-loading timeouts. Both exact failed cases pass
serially with unchanged assertions and timeouts. The traces show much slower
browser/page setup in the failed run, consistent with transient contention;
the root cause is not established and this is not a clean parallel matrix.
The complete Firefox project subsequently passes with one worker: 333 passes,
nine existing skips, no retries or changed assertions/timeouts. All five
projects therefore have failure-free runs at the same runtime revision,
collected across the original matrix and the Firefox follow-up. Linux display
clipboard checks and fresh hosted CI remain required.
[Current checkpoint](RELEASES.md#repaired-runtime-integration-checkpoint--2026-11-11).

Fresh checks at `b03ad598` also pass pinned Lean, Bun, Deno, the production
site build, default Yjs (48), startup (24), migration recovery (21), compiled
native-presence (108), and three production starter-download journeys. All
1,008 distribution files remain byte-identical to the tested archive. Those
executions overlap and do not count as new capabilities; hosted CI must
refresh these outcomes for the final candidate.
[Supplementary evidence](RELEASES.md#supplementary-release-validation--2026-11-11).

The caption preview also passes three desktop source-server checks, three
production-subpath checks, and eight recorded release journeys. Visual review
covers eight full-resolution states, sampled recording timelines, and both
PDF pages in current bundled renderers. Continuous playback, older-renderer
differences and known DOCX viewer omissions remain distinct from these passes.
The earlier broad browser matrix predates this demo change; fresh combined
hosted CI remains required.
[Recorded journey evidence](RELEASES.md#recorded-release-journeys--2026-11-11).

CI now includes a required independent `recorded-ui` job for those eight
journeys and six built-site starter/caption checks. Local CI-mode execution
passes eight journeys; the stable production configuration passes all six.
Fourteen release-policy checks and both configuration/root typechecks pass.
These validate the new wiring locally; hosted Linux execution is still pending.

The actual Word research-paper journey is also registered in all three main
desktop projects. Six CI-mode local executions pass without retries, preserving
caption/math/table editing, line/history behavior and actual download/reopen
assertions. Its output is isolated per attempt and uploaded by CI. Captured
HTML math/page-template fallbacks remain documented limits, not visual parity.
[Research-document evidence](RELEASES.md#research-document-ci-coverage--2026-11-11).

Standalone candidate installation is now part of required CI too. Plain DOM
and React build outside the checkout and pass six desktop editing journeys;
the Node starter passes conversion and a blocked-optional-peer/no-DOM probe.
Three production download journeys verify the updated ZIPs. Visual review also
fixes the Windows WebKit font fallback in both starter shells. These are local
archive checks; hosted CI and registry consumption remain pending.
[Installed-starter evidence](RELEASES.md#installed-standalone-starters--2026-11-11).

The local Conversion Lab additionally offers offline MathML in HTML downloads,
with original TeX retained, an explicit source-only option and per-equation
fallback reports. Six desktop journeys and 50 focused checks pass, with captured
reader states reviewed. Library default HTML remains source-only; font/layout
and page-template fidelity remain separate. The full local gate and built-site
equation checks now pass; the combined hosted matrix remains pending.
[Equation-export evidence](RELEASES.md#offline-equation-html-projection--2026-11-11).

The website now labels its source/package/npm identity on all 20 public pages
before JavaScript runs, with narrow-screen and print checks. Framework and
preview copy is reconciled. Nineteen focused checks, six homepage interaction
checks, 15 built-site checks and eight recorded release journeys pass locally;
the built metadata names clean source `72174160`. These overlapping executions
are verification evidence, not new capability counts.
[Website identity contract](WEBSITE_BUILD_IDENTITY.md). Copy recovery and the named contrast repairs now have local evidence; broader
accessibility, larger-document/production profiling and marketing-page rendering stay open.

Homepage Copy now has an accessible manual recovery path and snapshot-bound
feedback. The targeted text colors measure at least 5.15:1 in all three desktop
engines. Recovery/race/contrast cases pass, but the positive Windows WebKit API
paste case fails in both Fountain and a plain native control: source 14/15,
built site 29/30. Required Linux display-backed checks retain that assertion;
publication remains pending those results.
[Copy/contrast evidence](RELEASES.md#homepage-copy-and-contrast--2026-11-11).

Homepage selection-only export work is repaired. Nine additional journeys use
a 502-block fixture within the existing character limit. The initial refusal
was caused by an oversized fixture; false success reporting is now fixed with
an explicit rejected outcome. Three source and three compiled native clipboard
journeys pass. The full local check passes 5,291 tests/325 files and every
existing package/runtime/type/format/size/performance gate. This is not whole
product, physical-device or hosted-release approval.
[Measured scope](WEBSITE_BUILD_IDENTITY.md#homepage-export-work).

The three flagship showcases must meet the [professional reference-product
requirements](PROFESSIONAL_REFERENCE_PRODUCTS.md). The existing limited issue
and task workflow labs do not satisfy that requirement. GitLab integration has
a pinned, reproducible upstream contract inventory and a tested real Vue 2
surface component. The complete Markdown/host/service adapters and real
application verification remain outstanding.

## Remaining parity work

The [capability ledger](TIPTAP_PARITY.md) records 61 Delivered, eight Partial,
two Host boundary and three Missing rows. The November 11 upstream catalogue
review added charts/diagrams, template slots and a whiteboard surface to the
previous 71-row scope. These are capability counts. Release readiness also
depends on the evidence above; the new outcomes do not expand this beta.

| Area | Work still required |
| --- | --- |
| Collaboration | Current release validation, sustained storage/history growth, realistic input responsiveness, and production adoption. |
| Formats and layout | Deeper DOCX/Word fidelity; clearer adoption of the distinct Markdown profiles, broader GFM coverage and exact model reopening; gradual ODT/EPUB support with independent fixtures. |
| Browser behavior | Complete cross-browser coverage for the current candidate and diagnosis of intermittent failures. |
| Mobile and IME | Physical iOS/Android keyboards, composition, autocorrect, selection, and clipboard evidence. |
| Accessibility | Additional menu and custom-renderer states plus assistive-technology testing. |
| RTL and localization | Remaining shared automatic-direction cases, inline isolation, broader host CSS and bidi behavior, and locale packages. |
| Frameworks | Broader framework-version coverage and equivalent optional UI/form integrations. |
| Onboarding | Stronger end-to-end examples, practical customization recipes, and independent developer integration evidence. |
| Host infrastructure | Tested self-host references and example storage, authorization, REST, webhook, and notification contracts. |

After the beta, measure browser input-to-paint latency and long-running
collaboration under representative workloads. Compare the same document and
operations with ProseMirror plus Tiptap. Current retained-Yjs measurements are
transaction bursts and in-memory exchanges. The
[diagnostic](YJS_ENDURANCE_DIAGNOSTIC.md) documents their workload and limits.

Markdown's default profile has 563/652 CommonMark fixture matches; the ordinary
complete-file profile has 635/652, with 17 documented policy differences. An
explicit source-data profile reaches 652/652 using inactive URI capture and
other declared options. That does not establish default editor, safe HTML,
GFM or exact model-reopening parity. Keep these contracts separate.
[Profile evidence and remaining boundaries](MARKDOWN_DOCUMENT_FLOW.md).

## Future work retained

The earlier proposals remain in [ROADMAP_HISTORY.md](ROADMAP_HISTORY.md),
including their scope, sources, and required proof.

- A self-contained `.fjs` package with assets and a portable local reader.
- Broader document ingestion, reproducibility tools, and migration adapters.
- Scientific workflows combining technical source, citations, references,
  proof checking, review, and verified publication output.
- Native renderer prototypes and a language-neutral document/operation protocol.
- Monaco/CodeMirror, Jupyter-kernel, and terminal adapters for structured workspaces.
- Authorable forms with separate definitions, respondent views, and submissions.
- Editable charts/source-backed diagrams, validated template slots and variable
  bindings, and an optional structured whiteboard surface. The
  [November 11 catalogue audit](TIPTAP_PARITY.md#catalogue-review--2026-11-11)
  records the missing outcomes and their upstream references.
- Provider-based audio/video transcription and further language-service modules.
- Further block, table, media, and editorial features justified by complete use cases.

These proposals enter an active release after their editing, persistence,
security, interoperability, accessibility, and performance contracts are defined.

## Project name

Keep **FountainJS**. The November 8 naming review found existing uses of
Inkognito in document processing and other products. A later naming decision
requires another candidate and a compatibility plan.
[Recorded naming review](ROADMAP_HISTORY.md#inkognito-naming-check-2026-11-08).

## Engineering record

[ROADMAP_HISTORY.md](ROADMAP_HISTORY.md) preserves the previous roadmap in full.
Its dated entries describe the evidence available at each checkpoint. Current
release decisions use this page, [the capability ledger](TIPTAP_PARITY.md), and
[the release evidence](RELEASES.md).
