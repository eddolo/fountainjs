# FountainJS roadmap

Updated 2026-11-13.

The latest GitLab checkpoint adds native Mermaid/PlantUML source creation and
editing with real previews, error/retry recovery, copy, language conversion and
delete/undo/redo. Actual toolbar creation after bold prose exposed inherited
formatting that blocked serialization; the explicit plain-code conversion now
retains text characters and semantic selection positions while clearing prose
marks. The recorded real-service run passes **21 checks**, including edited
reader output after save/reopen/restart. All **5,887 unit tests/359 files** pass;
the upstream ten-suite set is **318 passed / 2 failed / 320 total**. Guarded
nineteen-file source rollback/reinstall and eleven ordered patches verify.
Preview/source pairing in long documents, saved invalid diagrams, remaining
specialized content, full roles/workflows and both other products remain open.
Public library/API/size limits are unchanged; nothing is published.
[Diagram evidence and limits](../integrations/gitlab/README.md#native-mermaid-and-plantuml).

The preceding GitLab checkpoint prevents reference loss when native text is typed
immediately beside issue/MR/user/label atoms. Canonical source preserves their
HTML text-node boundaries without adding visible separators; code/link marks
that would erase reference semantics refuse export while the document remains
editable. Thirty real-renderer fixtures and 29 new regression cases accompany a
recorded actual-service journey: **19 checks**, zero browser errors, and all four
kinds retained after save/reopen/restart. All **5,855 unit tests/357 files**,
current types/API and unchanged size limits pass. The 17-file source
rollback/reinstall passes; the nine-suite upstream set remains **304 passed /
2 failed / 306 total**, with the two unfinished requirements unchanged. Full
product acceptance and exact untouched-section spelling retention remain open.
[Boundary evidence and limits](../integrations/gitlab/README.md#reference-text-boundaries).

The preceding GitLab work adds native reference controls: ID/title/summary display,
absolute URL copy, real new-tab navigation, removal/undo, retained qualified
source and offline draft recovery without stealing the current cursor. The
actual-service journey passes **18 checks**, including save/reopen/restart;
twelve isolated component states pass 18 checks with zero accessibility violations.
All **5,826 unit tests/356 files**, current types/API and unchanged size checks pass.
The native reference-render boundary and thirteen new component cases pass.
GitLab's nine-suite set is **304 passed / 2 failed / 306 total**; specialized code
and full media requirements remain open. Reference autocomplete/hover cards,
EE-only epic acceptance, full roles/workflows and the other two complete products
also remain open. The GitLab bridge still uses canonical serialization after
edits; exact untouched-section source retention remains separate work. No public
library/API or size-limit change is introduced.
[Reference evidence and limits](../integrations/gitlab/README.md#native-reference-controls).

The preceding work hardens real media-file replacement: picker ownership, mapped retry
targets, preservation of image links/title/description/dimensions, wrong-kind
refusal and cleanup. The real workflow exposed a shared pipe-table alignment
defect; direct and nested imports now distinguish implicit/default from explicit
physical-left columns, including rendered RTL reopening in all three desktop
engines. All **5,786 tests/355 files** and existing package/API/runtime/format/
framework/size/performance gates pass. GitLab's eight-suite set is **290 passed /
3 failed / 293 total**. The real recorded service journey passes **24 checks**,
including upload/retry, source persistence, private-access refusal and restart;
reader video playback now requires advancing time and completion. Twelve isolated
component states pass 21 checks with no accessibility violations. Complete media,
specialized-code and reference menus,
remaining application workflows and the other two full products remain open.
Audio dimensions survive editing, but GitLab's reader still uses standard sizing.
[Current contracts and limits](../integrations/gitlab/README.md#native-media-file-replacement).

The preceding GitLab checkpoint adds native image/audio/video properties, canonical
URL retention, replacement uploads, dimensions, deletion, undo/redo and native
playback. Actual testing repaired inline-atom caret recovery, cold-image geometry
and node reveal, collapsed audio controls, Enter submission and description/title
recovery from GitLab's folded media labels. All **5,747 unit tests/353 files** pass,
along with package/API, runtime/headless, format, framework, size and performance/
retention gates. A retained table timeout under overlapping compilation passes
serially and in the bounded four-worker full suite without changing assertions
or timeouts. Six default/custom image-renderer journeys pass across Chromium,
Firefox and WebKit. The actual GitLab journey passes **21 checks**, including real
uploads/playback, blocked-save recovery, source switching, saved reader/reopen,
private access refusal and application restart. Nine isolated component states
pass keyboard/clipboard/accessibility checks. GitLab's eight-suite set remains
**283 passed / 3 failed / 286 total**; unfinished media, specialized-code and
reference-menu requirements remain open. Fifteen-file guarded source rollback/
reinstall and nine ordered patches verify. Aggregate CJS capacity grows by 1 KiB
for 979 measured bytes; entry, ESM, CSS, semantic and performance limits stay fixed.
This is incomplete product work, with no parity-row promotion or publication.
[Current evidence and limits](../integrations/gitlab/README.md#native-media-properties).

The preceding GitLab checkpoint adds native alerts: all five types, direct literal
title/body editing, insertion, conversion to text, deletion, undo/redo and keyboard/
mobile input boundaries. Actual renderer fixtures preserve generated versus
authored default-word titles. Structural export retains nested list, code and
fenced-math prefixes. A public opt-in export repair omits only the editor-owned
trailing caret paragraph; authored blank paragraphs remain intact. All **5,685
unit tests/350 files** and existing package/API, runtime/headless, format, size,
performance/retention and framework gates pass without changing acceptance limits.
GitLab's seven-suite set is **272 passed / 3 failed / 275 total**, including eleven
native alert cases; media, specialized code and reference-menu requirements remain
open. The final actual-service journey passes **17 checks**, including real
save/expanded-reader/reopen, private access refusal and application restart.
Thirteen-file source rollback/reinstall preserves every digest. An earlier reader
image-decode failure and an incorrectly synchronized loading assertion remain
recorded; the later pass does not establish that image intermittency is fixed.
This is Linux Chromium evidence and incomplete product work, with no parity-row
promotion or publication.
[Current evidence and limits](../integrations/gitlab/README.md#native-gitlab-alerts).

The preceding GitLab checkpoint adds native ordinary-code language controls, full-source
copy, deletion and undo/redo, with mapped targets and retained invalid/conflicting
drafts. Real renderer output is normalized through an explicit code adapter.
Public engine repairs retain required containers when deleting their final block
and land the caret in the immediate replacement or successor. All **5,614 unit
tests/347 files** pass. Package/API, headless/server, format, size, performance/
retention and framework type checks pass; an initial math-routing regression is
repaired and its failed run is retained. GitLab's scoped upstream set is
**260 passed / 4 failed / 264 total**, including ten passing new code-control
cases. Four component states at desktop/narrow widths pass eight checks with
zero accessibility violations. The final actual GitLab journey passes **17 checks**,
including a viewport assertion for nested deletion/typing, exact source saving,
reader reopen, anonymous refusal and application restart. Native acceptance is
currently Linux Chromium-only.
Diagrams, frontmatter, suggestions, GLQL and complete snippet workflows remain
unfinished. The four legacy contextual-menu requirements still fail; no parity
row or full-product claim is promoted.
[Current evidence and limits](../integrations/gitlab/README.md#native-ordinary-code-controls).

The preceding real GitLab checkpoint adds native text-link creation, preview, copy,
editing and removal, with mapped selection, one-step undo/redo, strict host URL
resolution and retained drafts during real network failure. Its recorded journey
passes **17 checks**, including actual save/reopen, anonymous refusal and application
restart. The preceding upload profile separately passed 18 checks; those scenarios
are not all rerun by the link profile. Public repairs preserve mark order during
attribute updates and serialize one continuous link across mixed text formatting.
The full unit suite passes **5,560 tests/344 files**; types/API, package/headless/
server runtimes, size and performance/retention checks pass. The actual upstream
set is **250 passed / 4 failed / 254 total** (includes 64 additional work-item
description cases). Alert, media, code-block and reference menus remain unfinished.
Seven isolated component states plus a narrow preview pass portal-inclusive
accessibility checks; these fixtures are separate from real GitLab acceptance.
Actual link acceptance is currently Linux Chromium-only. Full product/release
acceptance remains open. No parity row is promoted, and the other two full products
remain unimplemented. Immediate follow-up: the four remaining contextual menus.
The reader's intermittent initial lazy-image decode remains open despite later passes.
[Current evidence and remaining work](../integrations/gitlab/README.md#native-text-link-controls).

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

The matching full frontend now builds and runs with the prepared host patch.
Loaded script digests and a real rich/source/rich save/restart journey are
recorded. The final run passes; earlier blank-image failures after restart remain
an open intermittent finding. A new native Fountain document service also passes
a separate real GitLab render/edit/save/reimport audit in Node, with its own
upload and visually reviewed result. Full units pass **5,483/339 files**, plus
26 focused cases and root types. The browser still uses GitLab's existing editor;
native component/toolbar/provider deployment and broader acceptance remain open.
No capability-row promotion or refreshed publication gate is claimed.
[Native service/deployment scope](../integrations/gitlab/README.md#rebuilt-host-deployment-and-native-document-service).

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
