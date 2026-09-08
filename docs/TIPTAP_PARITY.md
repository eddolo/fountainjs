# FountainJS → ProseMirror + Tiptap capability programme

Source-recovery audit (2026-09-08, Unreleased): fixed synthetic code terminators
leaking into code buffers. The optional structural adapter now has an independent
580/652 CommonMark semantic regression profile checked with LF and CRLF, plus
separate exact-source retention. Existing 563/579 profiles and the neutral
comparator remain unchanged. This is a correctness/coverage improvement, not
completed CommonMark or product parity.

Definition-list structure (2026-09-08, Unreleased): native terms/descriptions now
retain distinct editable blocks through HTML and opt-in Markdown handoff. Shared
server/browser projection, pair insertion, contextual removal, undo and explicit
format warnings replace the earlier paragraph-flattening fallback for supported
lists. See [contracts and verification](DEFINITION_LISTS.md). This does not change
the CommonMark score or establish complete format fidelity or product parity.

HTML loss visibility (2026-09-08, Unreleased): standard wrappers removed by schema
fallback now report that loss; registered containers are not falsely flagged.
Public conversion output stays fully accessible in a keyboard-scrollable panel.
This improves reporting/UX, not structural fidelity or the CommonMark score.
That audit's definition-list gap is addressed by the subsequent work above.

Registered-wrapper correction (2026-09-08, Unreleased): custom HTML container
rules no longer falsely reject generated hard breaks after trying an incompatible
content shape. Only accepted parse attempts contribute preservation evidence.
Nested section editing and HTML reopening pass across three engines. This repairs
the modular import path; it does not establish full HTML fidelity or parity.

Task-source recovery (2026-09-08, Unreleased): optional HTML/Markdown source
projection now verifies complete task-list subtrees and checked state. Nested
tasks remain structured; raw-text flattening or changed task content rolls back
to inert source. This is Fountain/GFM-extension retention, not CommonMark
conformance or completed parity. See the source-boundary audit for evidence.

Inline-object recovery (2026-09-08, Unreleased): the explicit source adapter now
preserves supported inline objects and their data through editable block
structures, while retaining inert rollback if preformatted projection would
flatten them. Full-structure/source reference contracts increase from 24 to 38;
the 563/579 corpus scores remain unchanged. This is interoperability progress,
not full HTML fidelity or completed parity.

Plain hard-break recovery (2026-09-08, Unreleased): parser-generated break tags
and renderer line feeds now remain distinct through explicit source projection,
including nested lists/quotes and preformatted scopes. Reference checks increase
to 58 preformatted and 24 full-structure/source contracts. This is not an increase
to the 563/579 corpus scores or a claim of completed Markdown/editor parity.

Recursive source recovery (2026-09-08, Unreleased): the optional Markdown/HTML
adapter now uses parser-derived list/quote events, including ordered starts and
tight/loose item boundaries. Reference checks cover both exact preformatted
content and complete nested structure outside pre. Custom attributes, modified
projections and unsupported atoms remain explicit refusals. This is progress on
the remaining HTML/Markdown boundary, not full conformance or completed parity.

Opaque code labels (2026-09-08, Unreleased): previously rejected long/quoted
labels now remain safely serialized string metadata. Fence decoding order and
canonical escape retention are corrected, and prototype-like labels no longer
crash the highlighter. Thirty-four new complete reference/source/canonical
contracts pass without changing the 563/579 corpus baselines. Long visual labels
wrap and expose their original spelling; no full parity claim follows from this.

Code-language fidelity (2026-09-08, Unreleased): browser/server HTML import now
preserves full supported labels such as `c++`, `c#` and `my.dsl` instead of
truncating them. Full check passes 1,515 tests / 119 files. Unsupported CommonMark
fence info and broader structural conversion remain open; no parity score bump.
The three-engine public conversion/source/reader journey and separate recorded
run passed, with the C++ reader and recording overview visually inspected.

Text-block source recovery (2026-09-08, Unreleased): opt-in mixed Markdown/HTML
projection now covers direct ATX/Setext headings and fenced/indented code, with
syntax-derived wrappers and code terminators. Twenty-four LF/CRLF reference-code
and source contracts pass; outer-div mismatches and nested lists/atoms remain
open. Full check passes 1,503 tests / 118 files, including compiled Node/workerd.
This does not change the 563/579 corpus baselines or establish complete parity.
The expanded conversion/edit/undo/file/reader journey passed Chromium, Firefox
and WebKit; a separate recording and desktop/mobile layouts were inspected.

Paragraph-source recovery (2026-09-08, Unreleased): four cross-paragraph HTML/pre
fixture kinds now retain exact code text via a separate explicit adapter and demo
option. Eight LF/CRLF checks include two complete reference-structure matches;
outer-div mismatches, structural nodes and atoms remain open. Full check passes
1,484 tests / 117 files. Existing 563/579 corpus semantic baselines are unchanged.
The expanded editing/undo/file-reopen/reader journey passed in three desktop
engines; recorded conversion/editor/mobile-reader layouts were inspected.

Paragraph provenance implementation (2026-09-08, Unreleased): an optional lazy
flow context exposes direct paragraph syntax, raw tags and physical line breaks
without host callback replay. This advances the source-aware adapter boundary;
it does not increase the 563/579 semantic baselines or complete CommonMark.
Full check: 1,466 tests / 116 files; three-engine editing/reopen regression and
recorded visual inspection passed. No new end-user conversion is claimed.

Whole-container Markdown boundary audit (2026-09-08): eight pending fixtures and
48 fallback/source checks now protect the unsupported preformatted flow cases.
An executable collision proof establishes that earlier parser provenance is
required. No runtime change, new semantic match or parity percentage increase.
[Boundary evidence and implementation plan](MARKDOWN_FLOW_PROVENANCE.md).

Firefox audit follow-through (2026-09-08): the apparent selection failure was
an invalidated interaction across a page reload, established from the original
trace. Stable-document guards now detect that condition without hiding editor
failures. Nine isolated three-engine repetitions and a separate recorded Firefox
journey passed; editor and reader layouts were visually checked. Full sequential
check: 1,451 tests / 115 files. No selection
engine change or new parity claim is justified by this result.
[Evidence and limitations](BROWSER_AUDIT_RELOADS.md).

Preformatted newline correction (2026-09-08, Unreleased): streaming CRLF and
initial-LF rules now respect protected text positions, empty slots and Markdown
formatting boundaries. Full clean check: 1,447 tests / 114 files; 76 paragraph
reference/source contracts, with default 563 / block+inline 579 unchanged.
The recorded journey and visually inspected editor/reader/mobile layouts retain
the exact three lines and indentation. Chromium/WebKit passed; Firefox had one
partial-selection/paste failure under load before three isolated passes. That
failure was subsequently traced to a page reload, as documented above. See the
[roadmap evidence and remaining limits](ROADMAP.md).

Preformatted paragraph follow-through (2026-09-08, Unreleased): source-tagged soft
breaks now survive closed text-only pre scopes as code line breaks. HTML newline
handling and plain-text code exports are reported; text attributes/marks remain
in JSON. Cross-paragraph scopes, atoms and active/foreign raw text retain explicit
fallbacks. Full local check passes 1,429 tests / 114 files, including compiled
Node/workerd and package/API/headless/performance gates. Sixty-two reference/source
cases and 1,304 corpus source checks accompany the three-engine editor/file/reader
journey. Baselines remain 563 default / 579 block+inline; no claim of full conformance.
The recording test passed and editor/reopened-reader/narrow-screen frames were
visually inspected. This does not certify physical-device input or arbitrary HTML.

Tight-list recovery follow-through (2026-09-08, Unreleased): direct list paragraphs
now receive source-derived tightness context instead of always adding an HTML p
wrapper. Nested containers and opaque blocks retain their own scope. Full local
check passes 1,409 tests / 113 files, compiled Node/workerd, API/headless and
performance gates. Thirty-eight reference/source cases and 1,304 source-retention
checks accompany three-engine editing/file/reader journeys. Empty-item/comment
identity differences and raw-text recovery remain open. No conformance inflation:
the established default 563 / block+inline 579 semantic baselines are unchanged.
The extended recorded journey passed; editor/reopened reader and narrow-screen
views were visually inspected. This is not physical-device input certification.

Paragraph HTML implementation (2026-09-08, Unreleased): an additive, default-off
block-returning paragraph adapter now recovers embedded paragraph/heading/quote
tags without forcing block nodes into inline content. Seventeen unit cases,
eight reference/source contracts and 1,304 unchanged-source cases cover the new
path; the editor/file/reader journey passes Chromium, Firefox and WebKit.
The tight-list wrapper issue is addressed above; experimental demo/documentation
retain raw-text limitations. Existing 563 default / 579 block+inline semantic baselines
are unchanged. This is concrete boundary work, not completion of the programme.
Full local check: 1,391 tests / 113 files, with compiled Node/workerd recovery,
headless/API and performance gates passing. Recorded editor/reopened reader and
narrow-screen views were visually inspected; the recording test passed.

CommonMark evidence audit (2026-09-08, Unreleased): projection version 9 corrects
the comparison of paragraph/heading formatting scopes, recognizing example 167
which the engine already imports correctly. Opt-in HTML now locks 579/652;
default remains 563/652. Twenty semantic/source contracts and ten injected losses
guard the normalization. Two inline-block HTML cases remain explicit literal
fallbacks, not new conformance. No runtime feature or package API changed.

Latest follow-through (2026-09-08, Unreleased): the issue workflow exposes the
existing HTML-table preservation route and imports supported table structure
when reopening Markdown. Six new pure-Node host-policy checks; full local check
passes 1,374 tests / 112 files. Headerless/mixed cells, spans, paragraphs and bold
rendering survive source/file/reader handoff in Chromium, Firefox and WebKit,
including undo/redo of file replacement. No new engine API, bundle ceiling or
CommonMark conformance promotion. Pipe-format losses remain explicit.

Latest follow-through (2026-09-08, Unreleased): browser paste and pure-Node HTML
import retain supported inline formatting across block wrappers, lists and table
groups/rows/cells, including nearer color overrides. Twenty-four added cases
bring full `pnpm check` to 1,368 tests / 111 files. Three desktop browser journeys
verify server import, pasted rendering, editing/undo and Markdown file handoff;
recorded original/editor/reader/mobile views were inspected. Public API and bundle
ceilings are unchanged (ESM 1369.8/1370 KiB; CJS 1138.8/1139 KiB).
The CommonMark baselines remain 563 default / 578 opt-in HTML matches out of 652.
Arbitrary CSS cascades/resets and headerless-table pipe-Markdown fidelity remain
open, explicitly documented boundaries—not new conformance matches.

Latest follow-through (2026-09-08, Unreleased): a real-world workflow hub now
surfaces the issue editor directly from the demo gallery and adds a Todoist-style
task workspace. Independent task documents/history, host metadata, reader preview
and local Markdown handoff are exercised, not whole-product replacement claims.
Markdown table escapes and strikethrough boundaries now preserve literal text
across 420 text/mark/container combinations and ten captured GitHub fixtures.
Full local verification: 1,344 tests / 110 files; six Chromium/Firefox/WebKit
journeys passed, plus separately recorded and visually inspected issue/task
journeys and narrow-screen captures. Public API and bundle budgets are unchanged.
CommonMark remains 563/652 default matches (72 pending, 17 intentional); neither
this demonstration work nor the targeted GFM fixes close the parity programme.
These changes are on the development website, not the immutable beta.1 tarball.

Latest follow-through (2026-09-07, Unreleased): literal text LF/CR survives
Markdown save/reopen without becoming spaces or structural blocks, including
multiline code marks. Full local verification passes 1,303 tests / 109 files;
twelve exact-character oracle checks supplement the unchanged CommonMark
classification. The three desktop engines exercise edits/history/file handoff
and actual line geometry; recorded desktop/mobile reader captures were inspected.
This closes a concrete retention bug, not full Markdown or export parity.

Latest repair (2026-09-07, Unreleased): canonical Markdown now protects literal
delimiter/address text from becoming formatting, math atoms or new links on
reopen. Full local verification passes 1,284 tests / 108 files; Chromium,
Firefox and WebKit exercise visual edits, history, file handoff and reader
retention, with an inspected Chromium recording. This repairs an actual
interchange loss without promoting any CommonMark baseline classifications.

Current follow-through (2026-09-07, Unreleased): bare-address autolinking is now
an explicit import choice rather than mandatory syntax. The opt-out passes 566
reference comparisons while default scores stay unchanged. The headless demo
and Chromium/Firefox/WebKit DOCX handoff checks, plus a recorded Chromium journey,
exercise plain-address and explicit-link retention. This is a Markdown compatibility increment, not
full CommonMark certification; see [ROADMAP.md](ROADMAP.md).

Latest verified increment (2026-09-07, Unreleased): root Markdown reference
definitions (standalone or immediately before content) retain source and lookup precedence through unrelated edits and
block movement/deletion. The issue workflow demonstrates visual editing,
undo/redo, raw-source fidelity, read-only preview and local download/reopen.
Evidence: 1,253 unit tests / 106 files in `pnpm check`, nine Chromium/Firefox/
WebKit workflow checks, and a recorded journey with inspected source/reader/
mobile screenshots under `artifacts/reference-prefix-20260907-recorded-v2/`.
This does not close CommonMark conformance or ambiguous/container provenance,
and is not included in the published 0.4.0-beta.1 package.

This document is the release gate for the work required to make FountainJS a
credible independent alternative to the combined ProseMirror + Tiptap stack. It
compares user outcomes rather than copying either implementation or API. The
comparison covers ProseMirror's engine responsibilities, Tiptap's open-source
developer/product layer, and the hosted or paid capabilities a product team can
add to Tiptap.

Every capability counted here must ship in FountainJS's public MIT-licensed npm
package. Optional entry points and peer dependencies are allowed so consumers
only load what they use; private registries, paid extension tiers, subscriptions,
and mandatory Fountain-hosted services are not. Hosted infrastructure may be
offered only behind replaceable provider contracts with a usable self-hosted
reference.

The 2026-09-07 human-use alignment audit fixes selected-range, nested/empty block,
container, whole-document and table-cell formatting. It also fixes native
paragraph-element DOM endpoints that previously left a stale model caret during
backward keyboard selection. Recorded toolbar/history/HTML-reader evidence and
cross-browser checks cover this repair; it does not close explicit RTL direction
or localization. Full-page HTML body extraction now fixes the title/stylesheet
leak with explicit document-shell loss reports; complete source/layout retention
is not claimed. Full CI then exposed inline-atom selection loss, repaired by
preserving its exact native node range. The new issue-editor workflow provides
recorded visual/source/draft/reader evidence, not full GitLab compatibility.
See [ROADMAP.md](ROADMAP.md) and [the workflow guide](ISSUE_EDITOR_DEMO.md).

Current Markdown follow-through (2026-09-07): optional raw-HTML block conversion
and inline HTML scope projection connect the isolated server importer to
Markdown, including nested containers and source snapshots. Inline projection
protects already-parsed Fountain nodes instead of serializing them through HTML;
unprovable content preservation falls back to readable source. The public
headless demo exposes separate default-off choices. Block-fragment conversion
now omits comment-only results without inserting an empty-document caret
paragraph, while retaining explicitly authored blank blocks.
The optional HTML flow adapter now carries raw blocks and protected Fountain
blocks through a shared HTML scope, reconstructing tables split at blank lines
without serializing extension data through HTML. Surrounding semantic/style/custom
marks now copy only affected paths, retaining source, attributes and node IDs;
specialized raw-text scopes over those blocks still fall back explicitly.
The 1,304 LF/CRLF flow source-retention checks do not change semantic scores.
Combined block/inline conversion now has a separate 579/652 exact projection
regression baseline. Source-bound reference code provenance corrects the raw
`<pre>` newline comparison; structural table comparison recognizes equivalent
unit spans and cell wrappers while rejecting fourteen real losses. Attribute-free
paragraph/heading formatting scopes are normalized with independent loss checks.
Its 73 unresolved comparisons include policy/schema and
comparator differences, not just parser bugs. This broader audit exposed a real
fallback loss: inline conversion could consume a closing tag before block flow
failed. Recovery now restores the failed container's inert interpretation,
including nested HTML, without changing successful sibling containers.
Exhaustive HTML precedence, specialized/raw-text inline structures, and conversion-loss accounting remain
unfinished. This does not change the 563-match / 72-pending / 17-intentional-difference
CommonMark baseline or qualify the overall programme for publication. See the
[Markdown contract and evidence](MARKDOWN_SOURCE.md).

HTML table import now resolves zero spans within source row groups and places
headers, body rows and footers in native structural order in browser and server
paths. Independent physical-layout checks pass in all three desktop engines;
a recorded real-clipboard edit/history/export/reopen journey confirms row order.
Section identity, repeated print headers/footers and arbitrary CSS remain outside
that contract. Protected Markdown blocks still trigger explicit fallback if
conversion would reorder them; no semantic score is promoted by these repairs.

The list audit also fixes zero-start renumbering during partial conversion and
lifting, and HTML integer-prefix parsing (including oversized-input failure).
Three-engine keyboard/history/export checks cover the repair. Native reversed,
negative, non-decimal and per-item override numbering still require a richer
end-to-end contract; server import now reports those losses, not parity.

DOCX additionally preserves supported custom starts and separate list instances,
including nested restarts and table-cell lists. Independent OOXML import tests
and recorded browser-renderer comparisons cover the new contract. Visual review
found ignored overrides in that viewer; explicit base definitions corrected
the displayed counters. Native Word/LibreOffice certification and arbitrary
Word restart/continuation rules remain open. See [DOCX.md](DOCX.md).

The independent `literal-html-reference-v1` gate now proves the declared inert
policy for all 72 raw-HTML examples, plus 144 generated boundary/round-trip
cases. The development-only reference parser must first reproduce all 652
official outputs; it is not bundled into Fountain's runtime. This is separate
from full opt-in conversion conformance and does not promote pending cases.

Academic document parity is additionally subject to the open
[real-document reproduction benchmark](REFERENCE_DOCUMENT_AUDIT.md). Delivered
math/Lean primitives do not claim full TeX-paper layout, bibliography, or native
Lean IDE parity. The first real-paper preflight fails display-equation and
LaTeX-table import; whole-document visual/export reproduction remains unverified.

Primary comparison references:

- [Tiptap editor overview](https://tiptap.dev/docs/editor/getting-started/overview)
- [Tiptap extension system](https://tiptap.dev/docs/editor/core-concepts/extensions)
- [Tiptap collaboration](https://tiptap.dev/docs/collaboration/getting-started/overview)
- [Tiptap AI Toolkit](https://tiptap.dev/docs/ai/ai-toolkit/overview)
- [Tiptap conversion](https://tiptap.dev/docs/conversion/getting-started/overview)
- [ProseMirror guide](https://prosemirror.net/docs/guide/)
- [ProseMirror reference manual](https://prosemirror.net/docs/ref/)

The public Tiptap catalogue was last re-audited on **2026-09-04**. Catalogue
labels such as Open Source, Start, Team, and Add-on are availability boundaries,
not quality scores; a paid/cloud outcome still counts as a product capability
that FountainJS must either deliver or identify as a deliberate host boundary.

## Why the target is ProseMirror + Tiptap

ProseMirror is the low-level editor engine beneath Tiptap. Tiptap wraps its
document, state, transaction, plugin, and view APIs with a higher-level extension
and product layer. FountainJS independently implements both responsibilities and
ships first-party modules around its own engine. The primary one-to-one target is
therefore the complete ProseMirror + Tiptap stack. ProseMirror alone is still the
lower-level benchmark for engine correctness, browser behavior, transforms,
rebasing, and performance. See the [full-stack comparison](PROSEMIRROR_COMPARISON.md).

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
9. Product-style workflows are complete end to end: developer integration,
   author configuration, end-user interaction, permission and read-only states,
   persistence or submission boundaries, failure/retry behavior, and the paired
   developer guide are demonstrated honestly. A toolbar, editable mockup, or
   client-only role toggle does not by itself qualify as a finished product.

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
| CORE-09 | Predictable keyboard, IME, clipboard, and drag input | Delivered | Controlled input covers alternate composition commits without duplication, replacement/mobile input, rich structured paste that takes precedence over plain-text rules, multi-block insertion inside nested containers, visible repeated empty paragraphs and deletion, forward/backward pointer and keyboard selections, logical bidi and nested positions, selected-block native drag-move, semantic keyboard behavior, and an optional bounded clipboard-history picker. The complete 581-test package gate and 335-pass Chromium/Firefox/WebKit/mobile [CI run for `f69bb40`](https://github.com/eddolo/fountainjs/actions/runs/34027117935) certify the current basics regression set. |
| CORE-10 | Configurable undo/redo | Delivered | Configurable local history plus Yjs local-origin undo/redo, remote-change preservation, explicit capture boundaries, and relative selection restoration are covered by 244 behavioral tests, the complete 150-test Chromium/Firefox/WebKit/mobile [CI run for `f98a1b5`](https://github.com/eddolo/fountainjs/actions/runs/33891892320), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33891892227), and live two-editor author-local undo verification. |
| CORE-11 | First-class portable interactive widgets | Delivered | The DOM-free definition/controller, validated one-step state updates, protected identity, explicit focus/key exits, host-safe read-only behavior, bounded fail-explicit interchange, generic history/Yjs behavior, separate DOM and React renderers, and two public demo routes are certified by the complete 414-test package suite and 281-pass Chromium/Firefox/WebKit/mobile [CI run for `cced9e2`](https://github.com/eddolo/fountainjs/actions/runs/33969832708), plus the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33969832692). |
| CORE-12 | Granular structured node attributes | Delivered | DOM-free bounded definitions and typed path commands, whole-root and schema validation, stable-ID-addressed nested Yjs maps/arrays, non-overlapping field and concurrent-insertion convergence, canonical JSON repair, preflighted local writes, local-only undo, fail-closed remote validation, isolated ESM/CommonJS/types packaging, documentation, and a public two-editor control surface are delivered. The complete 425-test package suite and 284-pass Chromium/Firefox/WebKit/mobile matrix (with two intentional non-Chromium PDF skips) passed in [CI run `0a33c87`](https://github.com/eddolo/fountainjs/actions/runs/33972148767), and the corresponding [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33972148765) succeeded. |

### Document capabilities

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| DOC-01 | Paragraphs, headings, quotes, breaks, dividers, and common marks | Delivered | Paragraph/heading conversion applies to every compatible block in a cross-block selection, and the supplied quote action wraps selected blocks or unwraps the containing quote without moving the logical selection. Those workflows are covered by the complete package and all-engine [CI run for `f69bb40`](https://github.com/eddolo/fountainjs/actions/runs/34027117935). Expand interoperability as new external formats are added. |
| DOC-02 | Links with safe editing UI | Delivered | Safe normalization and host validation hooks, typed web/email autolinking, selection/caret link-on-paste, whole-link edit/remove, host-owned activation, React add/preview/title/target UI, and unit plus real-browser coverage are delivered. |
| DOC-03 | Bullet, ordered, nested, and task lists | Delivered | Multi-block wrapping, range-only conversion, mixed nesting, multi-item indent/lift, ordered-start preservation, task state, hierarchy-preserving boundary joins, nested HTML/Markdown round trips, keyboard behavior, React controls, and real-browser coverage are delivered. |
| DOC-04 | Code blocks with language-aware highlighting | Delivered | `StarterKit` adds live, non-persisted token and line-number decorations, normalized language metadata, safe host-tokenizer injection, editable React language/line-number controls, fenced Markdown and HTML interchange, and unit plus cross-browser editing coverage. |
| DOC-05 | Production table editing | Delivered | Span-aware geometry and repair, explicit insertion dimensions, above/below and left/right transforms, complete-table deletion, merge/split, scoped header toggles, whole-row/column selection, pointer and keyboard column resizing, `colwidth` round trips, and TSV/HTML clipboard handling are delivered. The supplied React toolbar now exposes one labelled contextual menu while `tableControls="expanded"` preserves the complete action row for specialist hosts; both modes and the public demos are covered by [CI run `f69bb40`](https://github.com/eddolo/fountainjs/actions/runs/34027117935). |
| DOC-06 | Images with upload, paste, drop, captions, and dimensions | Delivered | Typed block and inline images, mapped progress/cancel/retry uploads, fail-closed replacement, editable captions, safe metadata, alignment, responsive sources, load recovery, pointer/touch/keyboard resizing, React and Web Component workflows, interchange, and unit plus cross-browser coverage are delivered. |
| DOC-07 | Video, audio, files, and configurable embeds | Delivered | `MediaExtension` provides typed native playback with tracks, file cards, provider-scoped canonical embeds, mapped host-owned uploads, safe JSON/HTML/text/Markdown boundaries, accessible NodeViews and React controls, undo/selection/failure coverage, lifecycle cleanup, and enforced release-size budgets. Image-type downloadable attachments now show a safe preview plus a separate download action; editable NodeViews expose explicit selection so host controls can edit metadata or delete the object. Package-backed browser coverage and the deployed [Playground run for `f69bb40`](https://github.com/eddolo/fountainjs/actions/runs/34027118101) verify the public workflow. |
| DOC-08 | Mentions, emoji, typography, and character count | Delivered | Independent framework-neutral extensions, cancellable/stale-safe multi-trigger suggestions, safe mention/emoji atoms and interchange, curated plus isolated complete RGI emoji catalogues, configurable RTL-aware typography with literal undo, enforced custom counting/limits, accessible React UI, package-backed demos, unit coverage, and green Chromium/Firefox/WebKit plus mobile browser contracts are live. |
| DOC-09 | Native inline and display mathematics from LaTeX | Delivered | Opt-in framework-neutral math nodes store editable TeX and labels; direct selected-node source editing plus inspect/update commands; neutral plain, tinted, or outlined presentation; isolated input/paste rules with literal undo; safe source fallback; caller-owned DOM renderers; a trust-disabled KaTeX adapter; JSON/HTML/Markdown/text round trips; unit tests; and the public headless/live editor demos are delivered. |
| DOC-10 | Lean 4 source and interactive proof workflows | Delivered | Portable blocks, Unicode entry/highlighting, source-only operation, validated local/remote/managed/one-shot provider contracts, mapped transient diagnostics, exact-range selection, and a framework-neutral InfoView are delivered. The packaged one-shot bridge binds only to loopback, requires an exact Origin plus per-session secret, exposes no request-controlled command/path, bounds source/output/time/concurrency, and removes temporary source. The complete 624-test package gate, live Lean 4.30.0 acceptance/rejection proof, and 359-pass Chromium/Firefox/WebKit/mobile matrix are certified by [CI run `2e99656`](https://github.com/eddolo/fountainjs/actions/runs/34045486830), with the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34045486832). Goals/hover/completion remain optional host-provider capabilities rather than a forced Fountain service. |
| DOC-11 | Collapsible details/summary content | Delivered | The isolated public `details` entry provides schema-valid details/summary nodes, arbitrary and nested body blocks, public insert/wrap/unwrap/open commands, native accessible disclosure rendering, persisted open state, summary/body keyboard transitions, undo, JSON/HTML/Markdown/text interchange, Yjs synchronization, a live playground route, and dedicated unit/mobile coverage. The complete 171-test Chromium/Firefox/WebKit/mobile [CI run for `12ca04c`](https://github.com/eddolo/fountainjs/actions/runs/33908273099) and successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33908273179) are green. |
| DOC-12 | Ruby annotations | Delivered | The isolated framework-neutral module provides marked editable base text, validated readings, public set/update/unset/toggle commands, semantic native rendering, replaceable accessible IME-safe annotation UI, JSON/HTML/Markdown/text interchange, generic Yjs synchronization, packaging, documentation, and a live playground workflow. The complete 289-test package suite and 176-test Chromium/Firefox/WebKit/mobile [CI run for `340bdda`](https://github.com/eddolo/fountainjs/actions/runs/33912934939) and successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33912934954) are green. |
| DOC-13 | Text style suite: foreground/background colour, font family, font size, and line height | Delivered | Five validated marks, public commands and mixed-selection inspection, safe HTML and lossless browser/headless Markdown interchange, generic Yjs synchronization, an isolated package entry, and responsive React controls are delivered. The complete 300-test package suite and 181-test Chromium/Firefox/WebKit/mobile [CI run for `26c3787`](https://github.com/eddolo/fountainjs/actions/runs/33917430739) and successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33917430659) are green. |
| DOC-14 | Page layout, margins, page breaks, headers, and footers | Delivered | The isolated neutral foundation, DOM measurement/controller, read-only preview, and guarded editable surface cover A4/Letter/custom geometry; legal fragment flow; portable breaks, stable-ID/derived-number footnotes with standard Markdown and semantic HTML interchange, templates, and fields; real line/blockquote-child/list/table and long-footnote measurement; exact source projection; bounded incremental reflow; canonical whole-block/paragraph/list/rowspan-safe table and measured footnote continuation; read-only/print continuation of multi-block blockquotes; safe merged multi-row header copies; unique editable page-intent rails; responsive fallback; explicit oversized row/atomic/footnote-fragment overflow; retained selection, IME, history, review, comments, movement, custom NodeViews, and Yjs; plus strictly validated host-declared custom-block bands and a sanitized host-owned print projection that leave the model/live widget unchanged. Blockquote and custom splits deliberately fail closed to continuous live editing until a host supplies a safe contract. Chromium, Firefox, and WebKit verify physical A4/Letter sheet geometry, stable named-page assignment, headers/page numbers, page-local footnotes, forced print breaks, accessibility isolation, removal of transient editor state, and exact editable/print long-footnote clips without duplicate or dropped fragments. A styled semantic-HTML fixture additionally proves multi-page direct-child quote continuation, marks/alignment, ruby, math, nested quote/list structure, merged tables, and imported manual breaks in all three engines; Chromium verifies emitted PDF page count, MediaBoxes, and exact once-only content. The bounded capability is certified by the 387-test package suite and complete 278-pass browser matrix in [CI run `38e3aa8`](https://github.com/eddolo/fountainjs/actions/runs/33965195752), plus the corresponding successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33965195758). Further document families extend this contract; they do not make the tested feature provisional. See [PAGINATION.md](PAGINATION.md). |
| DOC-15 | Live table of contents | Delivered | The isolated DOM-free implementation provides stable identity-backed anchors, immutable flat/tree indexes, normalized hierarchy, selection-driven active state, framework-neutral navigation, stable view-only heading decorations, and an accessible React Navigator with complete-title hover text. The complete 605-test package suite and 350-pass Chromium/Firefox/WebKit/mobile [CI run for `128c533`](https://github.com/eddolo/fountainjs/actions/runs/34037255518), successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34037255559), and live interaction verification certify the public package and rendered workflow. |
| DOC-16 | Invisible-character integrity tools | Delivered | The isolated implementation includes a DOM-free scanner/raw inspector for whitespace, hard breaks, line endings, zero-width/BOM/bidi controls, invalid surrogates, code points, UTF-8, and normalization; bounded view-only markers; eligible literal-input interception; explicit preview-first per-category sanitization with stale-selection refusal; package entries; a replaceable React inspector; and a live browser workflow. Nothing cleans text automatically, and byte-for-byte fidelity remains an explicit original-byte import/hash responsibility. The complete 612-test package gate and 353-pass Chromium/Firefox/WebKit/mobile [CI run for `734f151`](https://github.com/eddolo/fountainjs/actions/runs/34039546987), successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34039547002), and live rendered inspection certify the public package and workflow. |
| DOC-17 | Stable unique node identifiers | Delivered | The isolated DOM-free module provides configurable `nodeId` policy, deterministic/injected generation, O(1) lookup, fail-closed diagnostics, lookup/update/select commands, one-step history-neutral repair, JSON normalization, schema filtering, and mixed-client Yjs repair convergence. Identity survives ordinary edits and moves, duplicate paste remains one undo action, and the public Go demo proves IDs through a real rendered workflow. The complete 400-test package suite and 278-pass Chromium/Firefox/WebKit/mobile [CI run for `8fca57c`](https://github.com/eddolo/fountainjs/actions/runs/33967296032), plus the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33967296119), are green. |
| DOC-18 | Guaranteed trailing editable block | Delivered | `StarterKit` now appends one schema-valid direct text block after terminal tables, media, dividers, widgets, quotes, lists, and other non-text blocks while leaving editable paragraphs/headings/code blocks unchanged. The independently configurable, DOM-free extension is idempotent, history-neutral, nested-root aware, and provider-independently rebroadcast after remote repair; unit, Yjs-convergence, and real-browser typing/table-control coverage protect the invariant. The complete [CI run for `530c47f`](https://github.com/eddolo/fountainjs/actions/runs/34029708945) and corresponding [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34029708931) are green. See [TRAILING_EDITABLE_BLOCK.md](TRAILING_EDITABLE_BLOCK.md). |
| DOC-19 | Office and external-app paste normalization | Delivered | Source-aware configurable cleanup covers independent/nested Word lists with numeric starts, footnotes/endnotes and revisions; Google Docs structure and metadata; Excel tables, spans, and supported cell styling; annotated MathML, ruby, semantic footnotes, unsafe content, external-comment loss, and safe fallback. Fountain-to-Fountain copy writes schema-validated versioned JSON for exact compatible content plus clean semantic HTML and readable text for external destinations; missing extensions fall back without breaking paste. Chromium clipboard journeys prove exact complex-document round trips and rich/text-only external destinations, while synthetic native paste events prove representative Word/Docs/Excel ingestion in Chromium, Firefox, and WebKit. The complete 620-test package gate and 359-pass all-engine browser matrix are certified by [CI run `849a96a`](https://github.com/eddolo/fountainjs/actions/runs/34044186483), with the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34044186485). Unknown proprietary properties, formulas, and external comment threads remain explicit losses rather than false fidelity claims. |

### Product UI

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| UI-01 | Usable toolbar and starter editor | Delivered | Stable action/group composition, dependency-free icons, label/icon/render overrides, selection-safe mouse/pen/touch activation, RTL keyboard traversal, responsive scrolling, and package-backed desktop/mobile demos are delivered. Highlight colour has an explicit apply/remove panel; quote controls describe their reversible action; table tools appear contextually with named groups; custom widgets and attachments expose their edit affordances; and the React demo no longer stacks duplicate toolbars. The complete 581-test package gate, 335-pass all-engine [CI run for `f69bb40`](https://github.com/eddolo/fountainjs/actions/runs/34027117935), successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34027118101), and installed-Chrome public-site smoke test certify the current surface. |
| UI-02 | Bubble and floating menus | Delivered | Framework-neutral named controllers, semantic default/custom visibility, reusable selection geometry, collision-aware placement, accessible React renderers, and package-backed desktop/mobile demos are covered by the complete release gate, all-engine CI, and deployed-site verification. |
| UI-03 | Slash-command menu | Delivered | A framework-neutral live registry, eleven schema-aware defaults, stable grouped filtering, cancellable async sources, atomic execution/rollback, keyboard/touch control, accessible React UI, and package-backed desktop/mobile demos are covered by the complete release gate, all-engine CI, and deployed-site verification. |
| UI-04 | Drag handles and block reordering | Delivered | Path-based schema-valid nested/cross-parent moves, full-block hover/focus targeting, stronger grabbed state, a visually independent drop-position indicator, Space/Enter grab with Arrow movement and Escape release, touch controls, host candidate/label policy, one-step undo, and framework-neutral/React/Web Component surfaces are implemented. Real-browser coverage exercises multi-line paragraphs, headings, lists, tables, images, audio, and extension atoms; the complete Chromium/Firefox/WebKit/mobile [CI run for `e5926a1`](https://github.com/eddolo/fountainjs/actions/runs/34041864432) and successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34041864377) certify both the movement contract and its structural feedback. |
| UI-05 | Search and replace | Delivered | Add regex/whole-word options only if justified by product evidence. |
| UI-06 | General drop cursor | Delivered | A default-on, framework-neutral DOM manager distinguishes inline caret and atomic/block boundary targets for native drags carrying data; yields to schema-valid block reordering; exposes host CSS/class/colour replacement; forwards through React and Custom Elements; and never changes state or selection. Unit and real-browser coverage is certified by the complete Chromium/Firefox/WebKit/mobile [CI run for `e5926a1`](https://github.com/eddolo/fountainjs/actions/runs/34041864432) and successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34041864377). |
| UI-07 | Placeholder, focus, and blurred-selection persistence | Delivered | The DOM/React/Web Component surfaces expose placeholders, programmatic focus, selection state, and mapped restoration; keep them in browser and accessibility gates. |

### Collaboration and review

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| COLLAB-01 | Concurrent conflict-free document editing | Delivered | The optional Yjs adapter provides character-level text merging, retained structural identity, independent node attributes, disconnected convergence, deterministic seed repair, schema-safe remote application, and local-origin history. It is covered by 244 behavioral tests, the complete 150-test Chromium/Firefox/WebKit/mobile [CI run for `f98a1b5`](https://github.com/eddolo/fountainjs/actions/runs/33891892320), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33891892227), and live deployed two-document convergence plus author-local undo. |
| COLLAB-02 | Provider-independent synchronization | Delivered | Framework-neutral lifecycle/status/reconnect contracts keep WebSocket, WebRTC, managed, custom, and offline providers optional while authentication, authorization, persistence, and retention stay host-owned. Adapter teardown, failure containment, package boundaries, documentation, the complete [CI gate](https://github.com/eddolo/fountainjs/actions/runs/33891892320), and the deployed provider-boundary demo verify the contract. |
| COLLAB-03 | Presence and remote selections | Delivered | Awareness-relative text selections, normalized immutable users, overlapping-safe accessible range/caret decorations, departure cleanup, and the two-editor demo are covered by unit and all-engine browser tests in the complete [CI run](https://github.com/eddolo/fountainjs/actions/runs/33891892320), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33891892227), and live deployed peer/caret verification. |
| COLLAB-04 | Threaded inline and document comments | Delivered | Provider-neutral thread records and lifecycle; inline/cross-block, point, block, and document anchors; overlapping decorations; mapped movement, deterministic recovery/orphan reattachment; replies, rich bodies, editing, reactions, resolve/archive/delete; permission hooks; authoritative storage operations plus an in-memory reference; accessible React UI; isolated ESM/CommonJS/types entries; and production/security guidance are covered by 252 behavioral tests, the complete 153-test Chromium/Firefox/WebKit/mobile [CI run for `75ae25f`](https://github.com/eddolo/fountainjs/actions/runs/33895703954), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33895703856), and live deployed verification of shared annotations, reply, reaction, resolution, and document-thread creation. |
| COLLAB-05 | General tracked changes and suggestion mode | Delivered | Provider-neutral insertion/deletion/exact replacement, mark, attribute, atom/table, and structural proposals; bounded portable author/time/reason/comment metadata; same-author grouping and nested records; individual/range/author/filtered batch accept/reject; enable/user/selection/hover/events; undo; Yjs no-retrack propagation; isolated ESM/CommonJS/types; and an accessible full-text React panel are covered by 265 behavioral tests, packed-tarball package/type validation, the complete 161-test Chromium/Firefox/WebKit/mobile [CI run for `4665b50`](https://github.com/eddolo/fountainjs/actions/runs/33900282765), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33900282688), and live deployed acceptance/rejection plus complete-text verification. |
| COLLAB-06 | Named versions, comparison, and restoration | Delivered | Public MIT package entries include bounded provider contracts, monotonic revisions, optimistic heads, exact idempotency, manual/debounced automatic versions, stable content identity, exact text/mark/attribute/structure comparison, non-destructive preview, permission hooks, backup-first one-transaction restore, tracked-change bypass, full-content accessible React UI, package gates, and production/security guidance. They are covered by 276 behavioral tests, the complete 166-test Chromium/Firefox/WebKit/mobile [CI run for `ff48dc7`](https://github.com/eddolo/fountainjs/actions/runs/33905590167), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33905590132), and live deployed verification of exact comparison, complete preview, guarded restore, backup creation, and a clean browser console. |
| COLLAB-07 | Lifecycle-safe document/provider replacement and bounded presence traffic | Delivered | Generation-scoped contexts, live adapter/`Y.Doc`/provider replacement, stale-session isolation, one-time adapter retirement, default deduplicated/throttled Yjs awareness, twenty-cycle reconnect/listener gates, twenty-cycle React Strict Mode construction/cleanup gates, and multi-editor DOM-selection ownership are covered by 306 behavioral tests, package/type/bundle gates, the complete 184-test Chromium/Firefox/WebKit/mobile [CI run for `eb9120a`](https://github.com/eddolo/fountainjs/actions/runs/33921214852), and the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33921214818). |

### AI

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| AI-01 | Inspectable, provider-independent text proposals | Delivered | Preserve local ownership and explicit disclosure. |
| AI-02 | Human accept/reject with stale-result protection | Delivered | Rebase proposals once mapped positions exist. |
| AI-03 | Streaming generation | **Delivered** | Abortable provider-neutral async streams, bounded append-only deltas, immutable live proposal snapshots, fail-closed cancellation/errors, completed-only human acceptance, one-step undo, an accessible React state/stop/review surface, and a deterministic public demo passed the 630-test local package gate and the complete package/Lean/browser matrix in [CI run `34046846091`](https://github.com/eddolo/fountainjs/actions/runs/34046846091); the matching [public playground deployment](https://github.com/eddolo/fountainjs/actions/runs/34046846054) also passed. |
| AI-04 | Schema-aware document tools for agents | **Delivered** | The isolated DOM-free `fountainjs-editor/ai/document-tools` entry provides bounded path/schema reads, portable JSON-Schema descriptors for read/insert/replace/format/structure calls, non-mutating immutable proposals, atomic multi-operation previews, proposal-scoped reads, tool allowlists, declared-attribute and active-schema validation, total resource bounds, stale refusal, explicit reject, and one-transaction accept/undo. The 640-test package gate, packed Node 10/16 ESM/CommonJS/bundler checks, no-DOM source/declaration checks, real Lean 4.30 validation, 368-pass/14-skip all-engine browser matrix, and four recorded and visually inspected human journeys certify the implementation in [CI run `34052102441`](https://github.com/eddolo/fountainjs/actions/runs/34052102441); the matching [public playground deployment](https://github.com/eddolo/fountainjs/actions/runs/34052102443) passed and its preview/accept/undo flow was verified on the deployed site. |
| AI-05 | Multi-turn AI conversation and reusable prompts | **Delivered** | The isolated DOM-free `fountainjs-editor/ai/conversation` entry provides host-owned conversation and prompt stores; bounded, inspectable context; cancellable transient streaming; exact idempotent saves and optimistic conflict refusal; immutable normalized records; strict reusable-prompt rendering; and an optional accessible React surface with visible history, newest-turn scrolling, prompt selection, stopping, last-request disclosure, and guarded clearing. The full package/API/type/headless/runtime/budget/performance gate, real Lean 4.30 integration, complete Chromium/Firefox/WebKit/mobile browser matrix, and four recorded and visually inspected human journeys passed in [CI run `34054229441`](https://github.com/eddolo/fountainjs/actions/runs/34054229441); the matching [public playground deployment](https://github.com/eddolo/fountainjs/actions/runs/34054229459) passed and its prompt/first-turn/follow-up/context/clear lifecycle was verified on the deployed site. |
| AI-06 | Generated media workflows | **Delivered** | The isolated DOM-free `fountainjs-editor/ai/generated-media` entry provides private-by-default inspectable requests, provider-neutral generation, bounded copied byte candidates, separate generation/upload progress, cancellation, provenance, immutable review state, explicit accept/reject, and single-accept protection for images, audio, video, and files. The browser bridge converts an accepted candidate into a normal `File` and routes it through the existing host-owned mapped image/asset upload boundary, preserving validation, failure behavior, progress, insertion, and one-step undo; the optional React surface supplies local previews, exact-request disclosure, and accessible decisions. The exact package passed 659 behavioral tests, packed Node 10/16 ESM/CommonJS/bundler checks, DOM-free source/runtime gates, the real Lean 4.30 integration, a 374-pass/14-skip Chromium/Firefox/WebKit/mobile matrix, and four recorded and visually inspected human journeys in [CI run `34057805832`](https://github.com/eddolo/fountainjs/actions/runs/34057805832). The matching [public playground deployment](https://github.com/eddolo/fountainjs/actions/runs/34057805818) passed, and its request disclosure → preview → host upload → insert → undo flow was exercised directly on the deployed site. Generator, moderation, billing, credentials, permanent storage, and public URLs remain replaceable host responsibilities rather than a Fountain service. |

### Interoperability and surfaces

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| FORMAT-01 | Lossless, validated JSON | Delivered | Lossless schema-validated `NodeJSON` now has an independently versioned `fountainjs` envelope, deterministic sequential application-owned migrations, historical bare-v1 compatibility, future-version rejection, and a published structural JSON Schema through a DOM-independent entry. Public release-gate evidence is tracked with PROD-07. |
| FORMAT-02 | Safe HTML import/export | Delivered | Schema-owned custom node/mark rules, wrapped content, priority and failure fallback, custom-mark output, common CSS/link semantics, generic executable-output hardening, and complete-tree validation are delivered in browsers. The isolated server entry adds bounded DOM-free parsing, portable `parseHTML` extension rules, explicit browser-only-rule reports, exact browser/server fixtures, and emitted-bundle execution in Node ESM/CommonJS, Bun, Deno, and Cloudflare `workerd`. The complete 439-test package suite, 284-pass Chromium/Firefox/WebKit/mobile [CI run for `ebc3194`](https://github.com/eddolo/fountainjs/actions/runs/33974721733), and successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33974721742) certify the combined boundary. |
| FORMAT-03 | Markdown import/export | Delivered | Titled inline plus full/collapsed/shortcut reference links and images, deterministic deduplicated reference export, recursive quotes, loose multi-block lists, aligned tables, complete-tree validation, and immutable path-based loss reports remain the semantic baseline. The additive source snapshot returns an unchanged JavaScript source string exactly, retains recognized inert YAML frontmatter exactly after visual edits, and reports preservation without pretending unknown changed syntax survived. Aligned top-level blocks retain exact source and separators around changed blocks; uniquely equal blocks also retain exact source through insertion, deletion, and movement while structural separators become canonical. Duplicate, ambiguous, or reference-owning blocks fail closed rather than being guessed. A versioned Fountain-authored CommonMark 0.31.2/GFM 0.29-oriented subset adds ATX headings with exact closer/trailing-space handling, single/multiline Setext headings, indented and variable fenced code, collision-safe variable-delimiter code spans with standard whitespace normalization, strict HTML5 character references and all ASCII punctuation escapes, safe URI/email autolinks, star/underscore emphasis, both hard-break forms, compact/spaced thematic breaks, all bullet/ordered marker styles, up-to-three-space list markers, lazy nested blockquotes, opaque code-language labels, marker-relative tab stops, and first-child nested lists/thematic breaks/code blocks. Entity-obfuscated URLs are decoded before validation and canonical export protects literal entity-shaped text. Safe path/query-relative and explicit empty destinations, balanced and angle-bracket destinations, strict title closers, bounded and escaped single/multiline reference labels, code/paragraph-aware single/multiline definitions, global definitions nested in blockquotes, pinned Unicode 17 full label case folding, exact whitespace/code-point bounds, adjacent-reference precedence, opaque code/autolink/inline-HTML label scanning, raw-source identifier normalization, empty reference destinations, and whitespace-guarded titles further harden link interchange. Nested image descriptions project to plain alt text; inline-node marks preserve links and emphasis around image atoms through Markdown, browser/server HTML, DOM rendering, JSON, and Yjs; nested emphasis, Unicode-aware closing-flanking enforcement, rule-of-three arithmetic, ASCII-only list separation, marker-style list boundaries, thematic-break/list precedence, link/inline-token precedence, unmatched delimiter preservation, outer-to-inner semantic HTML mark projection, continuous mixed-format links, and lazy-blockquote Setext precedence cover the current emphasis/list subset. A development-only neutral semantic oracle materializes real tabs, canonicalizes equivalent URI spellings, and regression-locks 563 of 652 official CommonMark examples while classifying 72 pending and 17 intentional policy/GFM/editor-model differences (ten caret-host cases additionally require exact permitted-difference and source/canonical round-trip proofs); it never compares native ASTs or ships a reference parser. Marker-relative list collection and export additionally preserve multi-digit indentation, lazy nested containers, and exact code whitespace; a recorded public-demo runbook covers rich paste, nested editing, Enter, undo/redo, and export/reimport. The earlier baseline was certified by the complete 564-test package gate and green Chromium/Firefox/WebKit/mobile [CI run for `0a7aef6`](https://github.com/eddolo/fountainjs/actions/runs/34004963074), plus the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34004963046). Full CommonMark/GFM conformance and deeper-structure source mapping are explicitly not claimed. |
| FORMAT-04 | Plain-text projection | Delivered | Preserve as a deliberately lossy boundary. |
| FORMAT-05 | DOCX, PDF, ODT, and EPUB workflows | Partial | The isolated DOM-free `fountainjs-editor/docx` entry imports/exports a bounded Word subset with archive/XML/media limits, caller-schema validation, immutable fidelity reports, verified embedded PNG/JPEG/GIF/WebP relationships, safe default data URLs, explicit host-owned URL-to-bytes resolution, block/inline images, text alternatives, dimensions, captions, and external/unsupported-media fallback. Pure-Node ESM/CommonJS, independent `python-docx`, recorded browser download/re-import, and side-by-side independent visual-render coverage remain permanent gates. The visual comparison has already corrected heading scale, paragraph spacing, image alignment, quote styling, table borders, and font fallback. The media batch passed 669 behavioral tests, 382 browser checks with 14 deliberate capability skips, and seven recorded human-use/export audits in [CI run `69091cf`](https://github.com/eddolo/fountainjs/actions/runs/34067541278); its [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34067541261) also passed. Existing page entries provide measured print-quality PDF projection, Chromium byte/text verification, and a recorded real-PDF/Poppler page-image audit. Deeper Word layout/revision fidelity remains, while ODT and EPUB are still explicitly unclaimed. See [DOCX.md](DOCX.md) and [PAGINATION.md](PAGINATION.md). |
| SURFACE-01 | Plain DOM integration | Delivered | Add lifecycle stress and multi-editor tests. |
| SURFACE-02 | React integration | Delivered | Add server-rendering guidance and concurrent React coverage. |
| SURFACE-03 | Standards-based Web Component | Delivered | Add form association, attributes/events completeness, and browser tests. |
| SURFACE-04 | Native Vue, Svelte, and Angular bindings | Partial | Optional `/vue` composables/component, `/svelte` lifecycle/store/action and `/angular` signals/partial-Ivy directive; real compiled framework demos with ownership, SSR and browser editing checks. [Vue](VUE.md), [Svelte](SVELTE.md), [Angular](ANGULAR.md) guides. All three are unreleased. Equivalent optional framework UI suites, broader Angular-major/form integrations and further production evidence remain open. |
| SURFACE-05 | Headless/server document processing | Delivered | `fountainjs-editor/core` exposes the model/schema, logical selections, transactions, editor state, commands, history, portable extension composition, generic collaboration, formats, migrations, stable IDs, and structured attributes behind a 50-module import gate. A real package consumer compiles with only `ES2023`, no ambient types, and `skipLibCheck: false`; packed ESM/CommonJS execute generic and Yjs collaboration with `document` and `window` absent; `html/server` supplies bounded HTML parsing. The complete 455-test package gate and 289-pass Chromium/Firefox/WebKit/mobile matrix are certified in [CI run `2c7ff4c`](https://github.com/eddolo/fountainjs/actions/runs/33979389234), with the corresponding [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33979389243). Native UI renderers remain explicitly outside this delivered server outcome. |

### Production readiness and ecosystem

| ID | User outcome | Status | Work required for parity |
| --- | --- | --- | --- |
| PROD-01 | Cross-browser desktop confidence | Partial | A Chromium/Firefox/WebKit Playwright lane now covers core input, cross-block and semantic selections, mapped decorations, input-rule undo, and the React playground; expand it across every editing capability. |
| PROD-02 | Mobile and IME confidence | Partial | Cross-engine composition order, replacement input, deletion, history, and responsive-layout contracts run in Pixel/Chromium and iPhone/WebKit emulation; add physical iOS/Android device-farm runs for real virtual keyboards and autocorrect. |
| PROD-03 | Accessibility conformance | Partial | Establish WCAG 2.2 AA targets, automated checks, manual screen-reader scripts, and fixes. |
| PROD-04 | RTL and localization | Partial | Logical replacement inside mixed Hebrew/Latin/Arabic content is covered across browsers; add explicit block direction, bidi-aware visual navigation checks, translatable UI strings, and locale packages. |
| PROD-05 | Performance and memory budgets | Delivered | Reproducible production-build curves cover local, incremental-remote, and untrusted full-JSON updates through 10,000 blocks; heap gates cover a 2,000-edit live session and forty destroyed editors; raw startup-size ceilings remain enforced; immutable subtree validation, top-level DOM reconciliation, zero-churn React NodeViews, direct remote transactions, and text-only Yjs deltas prevent avoidable whole-document work. The 1,000-block input gate retains 999 block elements and caps input-to-paint in every desktop engine. Opt-in top-level virtualization now keeps fewer than 100 DOM blocks mounted in a real 100,000-block editor while preserving distant selection/editing, Japanese IME, rich copy, decorations, NodeViews, collaboration, scroll anchors, print, and mobile behavior. This is covered by 452 behavioral tests, the complete 289-pass Chromium/Firefox/WebKit/mobile [CI run for `8a6264e`](https://github.com/eddolo/fountainjs/actions/runs/33977243766), and the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33977243779). Measurements and explicit limits are in [the performance contract](PERFORMANCE.md) and [virtualization contract](VIRTUALIZATION.md). ProseMirror + Tiptap still has much deeper production evidence. |
| PROD-06 | Extension authoring and compatibility tooling | Delivered | Versioned SemVer manifests, exact extension-API compatibility, ordered requirements, hard duplicate/contribution conflicts, a non-destructive TypeScript package scaffold, a framework-neutral checked example, headless document/command/teardown conformance, and installation-wide `fountainjs-editor doctor` diagnostics ship in the public source and package. The generated package was packed, installed, built, tested, and diagnosed in an isolated consumer; the full gate passed with 319 behavioral tests; all 190 Chromium/Firefox/WebKit/mobile checks passed in the [CI run for `b11eb75`](https://github.com/eddolo/fountainjs/actions/runs/33926458877); the [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33926458876) succeeded; and the deployed developer guide was verified with the manifest, scaffold, conformance, doctor, and source links visible. The authoring contract and trust boundaries are documented in [EXTENSIONS.md](EXTENSIONS.md). This delivers tooling, not ecosystem-size parity: ProseMirror + Tiptap still has far more third-party extensions and maintainers. |
| PROD-07 | Stable releases and migrations | Delivered | Explicit API stability, deprecation, security-support, release, and rollback rules now accompany a DOM-free versioned document envelope; historical bare-v1 reads; deterministic sequential application-owned migrations; hostile-input bounds; host schema validation; and a published structural JSON Schema. A reviewed 344-file public-declaration snapshot detects accidental API changes, while exact version/tag/changelog checks, packed ESM/CommonJS/schema smoke tests, all-entry publint/Are the Types Wrong checks (including `./core`), intended-file inspection, budgets, OIDC provenance, and maintainer 2FA define the release route. This is covered by 326 behavioral tests and the complete 190-test Chromium/Firefox/WebKit/mobile [CI run for `ba7853e`](https://github.com/eddolo/fountainjs/actions/runs/33930475572), the successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33930475596), and live desktop/390px verification of the migration, portability, and release guidance with no console errors or page overflow. The expanded package boundary is rechecked by [CI run `2c7ff4c`](https://github.com/eddolo/fountainjs/actions/runs/33979389234). The contracts are documented in [MIGRATIONS.md](MIGRATIONS.md), [RELEASES.md](RELEASES.md), and [PORTABILITY_AUDIT.md](PORTABILITY_AUDIT.md). |
| PROD-08 | Operable collaboration/document backend | Host boundary | FountainJS deliberately accepts offline, WebSocket, WebRTC, managed, and custom providers instead of requiring one cloud. Ship a hardened self-host reference stack and deployment tests so teams are not forced to design the operational layer from scratch. |
| PROD-09 | Comment/document APIs, webhooks, and notifications | Host boundary | Storage and authorization hooks exist; add reference REST/webhook contracts and notification examples while leaving deployment and identity under host control. |
| PROD-10 | Practical onboarding and one-layer customization | Partial | The developer guide, source tour, API documentation, ten package-backed demos, and extension examples exist. Add copy-paste starter repositories, task-oriented recipes, and independent time-to-first-editor/time-to-first-extension tests so “easier” is measured rather than asserted. |

Ideas collected from current editor-community discussions are triaged in the
[opportunity roadmap](ROADMAP.md). It distinguishes already delivered outcomes
from genuine gaps and treats upstream demand claims as research leads until the
original sources and present status are verified.

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
