# DOCX fidelity checkpoint

## Completed scrolling and flow desktop matrix 2026 10 06

The cold-start, one-worker, zero-retry Chromium/Firefox/WebKit matrix completes
with **592 passes, 17 explicit skips and zero failures** in 35.2 minutes.
`artifacts/scroll-flow-full-desktop-matrix-20261006.log` retains the terminal
result; recordings/traces are under the same-named artifact directory.
The automatic final source check reports 654 current/recorded files, no changes
and a matching digest in
`artifacts/scroll-flow-desktop-matrix-source-check-20261006.log`.
This closes the previously failed broad desktop run for the scrolling,
announcement, import-readiness and literal-flow corrections in that snapshot.

The associated complete package gate remains 2,383 tests / 181 files plus the
unchanged runtime/type/format/resource checks. The matrix is desktop browser
evidence, not physical mobile, assistive-technology, native Word/LibreOffice or
full format fidelity. Visual capture findings above are not automatically closed
by the behavioral pass. Subsequent Markdown delimiter source work starts only
after this terminal result and needs its own verification; this matrix does not
test that new implementation. No parity row or percentage is promoted.

## Independent native renderer availability 2026 10 06

The local workspace dependency loader resolves bundle 26.909.12148 with Node,
Python, Git and other native tools, but no LibreOffice executable. A read-only
inventory finds no `soffice` executable under the returned dependency root;
its native directories are Git, jxrlib, libheif, Poppler and PowerShell.
The current packaged `render_docx.py` explicitly states that LibreOffice is
bundled only on macOS/Linux and its Windows branch resolves a system executable
from PATH. The documents skill requires the bundled-renderer route rather than
substituting the user's desktop installation. No native rendering is performed
or claimed in this check.

An independent office-rendering test environment is still required for the
outstanding source/editor/export typography, page layout and table comparisons.
LibreOffice rendering will establish LibreOffice behavior, not certify identical
Microsoft Word output; Word-specific evidence remains a separate requirement.
This is a verification dependency, not a runtime requirement for FountainJS
consumers, and it does not prevent the active browser/engine work. Browser
preview disagreements remain retained rather than treated as native truth.

## Native control scrolling follow-up 2026 10 06

The named-status follow-up below finished with eight passes and one WebKit
failure, not a broad pass. Its eight-iteration output-format journey reproduced
the earlier missed HTML activation at 390px: the normal click returned, but
`aria-pressed` stayed false. The retained trace records unstable/out-of-viewport
targets and output-navigation interception during scroll-into-view. The site
root's global `scroll-behavior: smooth` animated native focus/action scrolling.

`examples/react-app/src/index.css` now uses immediate root scrolling while
retaining the 88px sticky-header offset. The permanent format journey asserts
this policy, ordinary pointer activation, native Enter/Space activation and
complete JSON retention over eight alternating desktop/narrow iterations.
The policy assertion fails before the CSS change in
`artifacts/native-control-scroll-policy-baseline-20261006.log`; the original
natural missed-click recording remains separately retained. No forced click,
custom action retry, delay or reduced document assertion is added.

The repeated three-engine glossary, wrapper, format-selection and DOCX-handoff
batch passes all 24 cases in `artifacts/native-control-scroll-fixed-20261006.log`.
The six output-panel images from its second repetition have been inspected.
All show selected HTML and the expected body at both widths; Firefox's tall
element capture still includes a sticky-header band over unused panel space.
The earlier viewport probe attributes that capture effect to camera-induced
scrolling; it is not a normal-use blocked-button pass or a fix for all other
sticky-header findings. A separate direct in-app-browser handover exercise
checks real pointer HTML selection, Enter to JSON, Space to HTML and Markdown
output; the selected controls and source are visibly correct. This inspection
is Chromium-based, not physical-device or native-Word certification.

The original paragraph-recovery journey separately passes all six repeated
three-engine cases in `artifacts/native-control-scroll-paragraph-fixed-20261006.log`.
The new complete `pnpm check` passes **2,383 tests / 181 files**, 407 declaration
files and 88 headless modules in `artifacts/scroll-flow-complete-gate-20261006.log`.
Packed ESM/CommonJS, Node/workerd, independent CommonMark/math/DOCX, framework
types, size, performance and memory gates pass. Server HTML p95 at 1,000 blocks
is 53.58 ms against 120 ms; server/local/remote median growth is
8.91x / 5.75x / 9.84x against unchanged 15x limits. ESM is 1562.9 / 1563 KiB,
CommonJS 1299.5 / 1300 KiB and CSS 86.3 / 86.4 KiB; no ceiling was raised.

A fresh full desktop matrix is running in
`artifacts/scroll-flow-full-desktop-matrix-20261006`. It starts with a private
dependency cache, one worker, no retries and retained videos/traces. Its pre-run
snapshot covers 654 source/test/build/configuration files, including the root
Vite config; documentation and diagnostic artifacts are explicitly excluded.
The source hashes must be rechecked at completion. The earlier interrupted and
failed matrices remain separately retained. This is an active run, not a pass.
Scoped evidence makes the
scrolling fix testable but does not retroactively pass either earlier matrix.

## Separate import and export announcements 2026 10 06

The replacement 606-case run was interrupted after it exposed a strict-selector
failure in the Chromium glossary journey: `.headless-status[role="status"]`
matched both the newly announced import readiness and the export warning. Both
messages were present; this is not evidence of lost glossary content. The
retained partial run is `artifacts/recovery-full-desktop-matrix-20261006`. Only
the verified owned Playwright process tree was stopped; its session is terminal
with exit 1 and its port is no longer listening. All 653 recorded source hashes
still matched before subsequent edits. This interrupted matrix is not a pass.

The UI now names the existing announcements **Document import status** and
**DOCX export status**. The glossary journey selects the actual export region
by its accessible name, retains the full native-Word certification warning,
and separately asserts the imported four-block document is ready. It does not
pick an arbitrary first status or suppress strict-mode errors. The ninth UI
case proves both named messages coexist after actual schema/import/export
processing, with full document JSON unchanged; only the download boundary is
mocked. It fails before the names are added. The fixed batch passes nine UI
plus 13 conversion cases in `artifacts/headless-status-names-fixed-20261006.log`.

The recorded three-engine glossary/DOCX-handoff/output-selection follow-up in
`artifacts/headless-status-names-browser-20261006` finished with eight passes and
one WebKit output-selection failure, investigated above. All three glossary and
all three DOCX-handoff cases pass. The new complete package gate passes as above.
A new full browser matrix must use
a new source snapshot and retain the interrupted run separately. No release,
parity-row or percentage claim changes.

## Cold cache HTML recovery follow-up 2026 10 06

A controlled startup with a new private Vite dependency cache reproduces the
registered-wrapper import's `Execution context was destroyed` failure. The
first diagnostic attempt failed before serving the application because its
web-server working directory resolved `artifacts/artifacts`; that setup error
is retained separately, not counted as an editor reproduction. The corrected
baseline is `artifacts/wrapper-cold-baseline-config-corrected-20261006.log`.

The lazy source import of `src/html/server.ts` introduces `css-select`, `parse5`
and `parse5-htmlparser2-tree-adapter`. The broad-run trace showed late dependency
optimization followed by another document request during this import. Explicitly
including those dependencies in `vite.config.ts` prevents that first-use graph
replacement in the controlled follow-up. The source import and its schema/node
constructor boundary remain unchanged; this is not a parser rewrite or a switch
to a different compiled constructor. The browser helper waits for the actual
bridge and guards import navigation without catching/retrying failed imports.

`artifacts/wrapper-cold-fixed-20261006.log` passes the original editing,
Undo/Redo, HTML reopening and narrow-layout journey in all three desktop engines.
All six desktop/narrow editor images were opened and inspected: the title and
two-line text remain visible without overlap; WebKit's narrow title wraps to two
lines. The single server starts cold; later projects share its warmed cache,
so this is not three independently cold startups. The new permanent
`pnpm test:browser:cold-import` command uses a separate port, rebuild and private
temporary cache instead of deleting/reusing a live demo cache. Its literal
invocation passes all three projects in
`artifacts/cold-import-command-20261006.log`; the current complete package gate
also passes as documented below.

The original 603-case matrix remains failed, not retroactively green. The
WebKit output-tab failure is still open: pointer recording and repeated real
journeys are being investigated, with the first diagnostic's incorrect
30-second limit retained separately from the original 60-second journey limit.
No blanket visual, parity-row, release or percentage promotion follows.

The corrected diagnostic in
`artifacts/output-tab-pointer-corrected-baseline-20261006.log` passes six WebKit
cases: three complete paragraph-recovery journeys and three eight-iteration
pointer/Enter/Space format-selection journeys, alternating desktop/narrow
viewports. Retained pointer evidence in the traces shows actual HTML-button
targets. It does not reproduce or explain the original broad-run missed click;
the original failure remains open, not fixed by changing a timeout or forcing
the click. `tests/browser/output-format-journey.ts` adds the permanent complete
document comparison, and paragraph recovery now asserts the selected output
mode at the implicated HTML transitions.

The new permanent cold-audit configuration passes all 12 selected journeys in
`artifacts/recovery-readiness-cold-followup-20261006.log`: registered-wrapper
recovery, eight-iteration format selection, paragraph recovery, and DOCX
handoff in Chromium/Firefox/WebKit, with recordings and complete-document
comparisons. The literal `pnpm test:browser:cold-import` command also passes in
its separate recorded run. All 12 scoped import-control/output images and six output-mode
images were opened and inspected. Import filenames, bounded-fidelity notices,
ready counts and output controls are visible at both widths. Firefox's tall
desktop output-element capture contains a sticky-header band over empty panel
space; viewport/hit-test diagnosis remains necessary before classifying it as
normal-use overlap versus capture auto-scroll. Large blank output space and
WebKit typography differences are visible, not a blanket visual pass. These are
developer inspection panes, not native Word or rendered-document fidelity proof.
The complete serial package gate passes in
`artifacts/recovery-readiness-complete-gate-20261006.log`: 2,373 tests / 181
files, 407 declarations, 88 headless modules, compiled package/Node/workerd
runtime checks, independent format/reference oracles, framework types and size,
performance and memory gates. Server HTML p95 is 72.99 ms against the unchanged
120 ms budget; 1k→10k median growth is 9.24x server, 7.98x local and 10.80x
remote against 15x. Heap checks pass at 0.00 / 0.06 / 14.29 MiB against
8 / 16 / 48 MiB. No size/performance limit is increased. This is not a new broad
browser pass, native Word proof or closure of the remaining visual findings.

The follow-up `artifacts/firefox-output-viewport-probe-20261006.log` passes one
eight-iteration real-action journey with viewport snapshots and geometry before
and after the element capture. All four viewport images were inspected. At
1440px, the focused HTML button is initially visible and its centre hit-tests to
the actual button; the header is at y=0..72 and the output navigation at
y=512..549. The tall `locator.screenshot()` then moves scrollY from 292 to
997.8, placing that navigation at y=-193.8..-156.8 and recording the header
through the blank part of the element. At 390px, scrollY stays 2836 and the
active button still hit-tests correctly after capture. This diagnoses the new
output-panel band as capture-induced scroll, not a normal-use blocked button.
It does not close the earlier table-tools image finding or the WebKit click
failure. Future interactive captures must retain viewport/hit-test evidence and
avoid silently treating the camera's scroll as an application-state transition.

The replacement full desktop matrix subsequently started with the permanent cold-audit
configuration in `artifacts/recovery-full-desktop-matrix-20261006`, one worker,
zero retries, and recorded video/traces. It was interrupted after the selector
failure described above; no completion or passing result is claimed. The
pre-run snapshot `artifacts/recovery-desktop-matrix-source-20261006.json` contains
653 files and includes root Vite/Playwright/type configs and handwritten tools,
unlike the earlier snapshot that omitted root `vite.config.ts`. An immediate
check matches every recorded hash; completion still requires a post-run check.
Dependencies/caches, documentation and diagnostic artifacts are outside the
stated scope. No rebuild or runtime/test source edit should occur while this
recorded matrix owns its server.

## Headless file readiness follow-up 2026 10 06

The frozen 603-case desktop matrix is terminal: **583 passed, 17 skipped,
three failed**, in 35.1 minutes. The source fingerprint's 634 recorded files
were unchanged at completion; root `vite.config.ts` remains outside that
fingerprint. Failures are the Chromium wrapper-recovery reload and DOCX
premature read, plus WebKit output-tab selection during paragraph recovery.
The recorded matrix remains failed; targeted follow-ups do not replace it.

New `tests/headless-docx-demo.test.tsx` uses the actual compiled schema, DOCX
adapter and output UI, mocking only unrelated editor workshops. All five initial
cases fail: idle claims validity, loading is hidden, slower old completion
overwrites the new document, old errors replace successful results, and export
remains enabled for the previous document during replacement. The baseline is
retained in `artifacts/headless-docx-readiness-baseline-20261006.log`.

`HeadlessRuntime` now reports idle/loading/ready/error explicitly, announces
reading the chosen filename, clears stale export status, and refuses to export
the prior document during replacement. A request generation owns asynchronous
reads and errors, invalidated on schema replacement and unmount. File selection
can be retried with the same name. Output-format controls expose `aria-pressed`
without changing their button semantics. The existing browser handoff waits for
actual validated import readiness and selected output mode, then keeps its full
JSON/default-style/page-settings comparison; no exception or field is erased.

The expanded eight UI cases plus 13 conversion-adapter cases pass in
`artifacts/headless-docx-readiness-expanded-verified-20261006.log`. Two new
output-mode oracle mistakes are retained separately: the expected plain text
ignored native font spans, then literal HTML comparison mistook JSON object-key
order for semantic loss. The corrected check validates complete paragraph
layout data and HTML text, followed by the existing complete document JSON
comparison. Current read failure/retry, announced mode retention and schema
invalidation are included. The recorded three-engine DOCX handoff follow-up
passes in `artifacts/headless-docx-readiness-browser-20261006`, retaining the
complete document comparison. Six full-page UI images are retained; that does
not establish native Word rendering or visual inspection of every export.
The current complete package gate is running; the original whole-browser matrix
remains failed. The cold-cache reload has a scoped fix above, while scrolling
and visual follow-ups remain open.
No publication, row or percentage promotion.

## Configuration panels and external focus follow-up 2026 10 06

The supplied React toolbar now gives all nine configuration forms a name and
unique trigger ownership (`aria-expanded` / `aria-controls`). Keyboard opening
focuses the first enabled field/action; Escape respects composition and handled
events, closes the non-modal form and returns to its own trigger. Close/Cancel
do the same. Two independent toolbars cannot claim one another's form IDs.
Native and host-provided editable fields keep arrow/Home/End behavior instead
of entering command-button traversal. These private changes add no public API.

Real recorded use found a deeper focus defect: native colour inputs retain an
old contenteditable Range after focus leaves the editor. A host/capture style
mutation invokes view repair, which previously treated that range as ownership
and stole focus back from the field. `src/view/selection-handler.ts` now checks
the owning document's active element before claiming the range. Four focused
cases cover colour, textarea, select and button ownership, exact document and
logical-selection retention, mutation repair and explicit `view.focus()`.
The 74-case five-file focused batch passes in
`artifacts/toolbar-panels-focus-safe-units-20261006.log`.

The controlled English saved-comment reader now has a complete document with
language, title and a main landmark. Its empty sandbox and restrictive CSP stay
unchanged; it still has no scripts. The hidden head/title test reads actual DOM
`textContent`, not visible rendered text. This wrapper does not rewrite the
saved source or supply language metadata to arbitrary imported documents.

Failures are retained, not rewritten: the initial panel units fail 12 cases,
the external-focus baseline fails four, and the recorded
`artifacts/toolbar-panels-human-regression-20261005` batch has 24 passes and six
failures. The pre-hover-fix focus-safe batch then passes all 30 recorded cases
across Chromium, Firefox and WebKit. Its screenshots include native field
navigation, focus during host/capture mutation, Escape, exact JSON retention,
real image/media/link/code/table editing, menus and saved-reader source/history.

The pre-hover-fix interactive scan in
`artifacts/accessibility-interactive-focus-safe-20261006/summary.json` passes 72
states: nine forms plus three readers, at 1280px and 390px in all three engines.
Only 66 states run pinned axe-core; six empty-sandbox reader states get actual
DOM metadata/ARIA inspection without weakening the sandbox. Incomplete/manual
findings remain in 66 states. No rule is disabled, and this is not assistive
technology, physical-device or WCAG certification.

Visual inspection found that a header-row command still had low-contrast text
on pointer hover despite the earlier pressed-state fix. The new recorded
regression waits for painted frames/finite transitions before measuring native
computed colours: all three engines fail at 3.91:1 against 4.5:1 in
`artifacts/toolbar-table-hover-painted-baseline-20261006`. The earlier
unsynchronized probe (two passes, one failure) is retained separately. Shared
toolbar hover/pressed text now uses the dark ink foreground, retaining soft
accent feedback. The post-hover recorded batch in
`artifacts/toolbar-panels-human-final-20261006` passes all 33 cases; the six
desktop/narrow hover images were opened and inspected across all three engines.
Its 72-state accessibility scan also passes reported rules but predates the
horizontal-containment assertion added after visual review.

That review found clipped desktop Link and Find/Replace actions. The new
containment probe in `artifacts/toolbar-panel-containment-baseline-20261006`
fails all six desktop states and passes all six narrow states: the destination,
Apply/Cancel or Replace/Close controls extend beyond the form. Configuration
forms now wrap their controls, and fields use border-box sizing and bounded
width. The permanent recorded panel/hover follow-up in
`artifacts/toolbar-panels-contained-human-20261006` passes six three-engine
cases, with unchanged complete JSON, native field navigation, focus ownership,
Escape and horizontal geometry assertions. Actual desktop Link and Find/Replace
captures show all actions after wrapping. The strengthened scan in
`artifacts/accessibility-interactive-contained-final-20261006/summary.json`
passes all 72 states, including control containment and retained focus after
capture. It still has only 66 axe states and six DOM-only sandbox states, with
incomplete/manual findings in 66 states. Twelve representative final captures
(one per panel/reader scenario, across Chromium and WebKit at both widths) were
opened and inspected. This is not inspection of every captured frame or a
substitute for real screen-reader/mobile-device use.

The subsequent complete serial gate in
`artifacts/toolbar-panels-contained-complete-gate-20261006.log` passes 2,365
tests / 180 files, the 407-declaration public surface, 88-module headless
boundary, compiled package consumers, Node/workerd contracts, framework types,
independent format oracles, size, performance and memory checks. The final raw
runtime totals are 1562.8 KiB ESM, 1299.5 KiB CommonJS and 86.3 KiB CSS, against
1563 / 1300 / 86.4 KiB. The named-form/focus work adds approximately 1.7 / 1.5
KiB to the aggregate JavaScript compared with the previous source-safe batch;
only the measured aggregate/CJS React allowances were expanded in this batch.
React ESM remains within its existing 90 KiB cap; no runtime dependency, public
API, headless or performance limit was changed. The server HTML 1,000-block p95
is 54.89 ms against 120 ms; server/local/incremental-remote median growth is
8.04x / 8.80x / 11.57x against 15x. Live-session, destroyed-editor and retained
server-document heap growth is 0.00 / 0.06 / 15.16 MiB against 8 / 16 / 48 MiB.
The audit servers and browser runs were terminal before the gate; its complete
behavioral suite finished successfully without runtime edits. This is not a
replacement for earlier failed results or the new whole-browser matrix. No row,
percentage, full-matrix or release status is promoted.

A fresh 603-case, one-worker, zero-retry Chromium/Firefox/WebKit recording ran
through `playwright.input-audit.config.ts`, with its own rebuilt server on 4194.
It subsequently finished with 583 passes, 17 skips and three failures. Results are in
`artifacts/toolbar-full-desktop-matrix-20261006.log` and the matching artifact
directory. The pre-run 634-file source/test/demo/check fingerprint is retained
in `artifacts/toolbar-desktop-matrix-source-20261006.json`; verify it after the
run before attributing results to this source; all recorded files were unchanged.
This run is not a pass and
does not replace the earlier 585-case failures or certify physical devices.

### Live matrix diagnostic evidence 2026 10 06

The frozen run has exposed two Chromium failures so far. They remain failures;
no source, test, Vite configuration or demo change has been made during the run.

- Registered HTML wrapper recovery loses its JavaScript execution context inside
  `tests/browser/markdown-custom-wrapper-journey.ts:8`. The trace records the
  lazy raw-source `src/html/server.ts` import, new optimized parser/selector
  dependencies, then another same-URL document request without a test `goto`,
  before the evaluation fails. This is evidence pointing to development-server
  dependency reoptimization and reload, not proof of a model conversion failure.
  Confirm with a controlled cold-cache reproduction before changing the Vite
  boundary; do not delete shared caches or retry an entire interaction to hide it.
  Keep the source test harness and its importer in the same module graph:
  `src/html/server.ts` checks `segment.node instanceof FountainNode` at the
  inline and block source boundaries (currently lines 1434 and 1820). Merely
  changing this helper to the independently bundled public importer risks a
  different node constructor and rejected source segments. The installed Vite
  optimizer explicitly emits `full-reload` when late dependencies change its
  optimized graph. Its local source supports prebundling the source import's
  `css-select`, `parse5` and `parse5-htmlparser2-tree-adapter` dependencies as
  the bounded development-server candidate; cold isolated-cache verification
  is still required, and no configuration change has been made yet.
- The literal-address DOCX handoff reads the output before asynchronous file
  import completes. In its trace, `call@2875` finishes `setInputFiles` at
  172549.971 ms, `call@2877` finishes the JSON tab click at 172599.303 ms, and
  `call@2879` returns an empty string at 172612.895 ms. The immediate `JSON.parse`
  inside `expect.poll` throws before any full-document comparison. The retained
  failure snapshot subsequently contains the imported four-block document,
  explicit Word page defaults and the original Help centre link. This establishes
  premature observation, not complete fidelity: the strict comparison still
  needs to run after genuine import readiness. `HeadlessRuntime` in
  `examples/react-app/src/DemoPage.tsx` also has a real UI gap: DOCX state has no
  loading flag, and the generic status can say `Valid document` when its document
  is undefined. Add honest idle/loading/error/success states and protect against
  stale asynchronous file completion, rather than only delaying the test.

The read-only forensic check
`node --experimental-strip-types artifacts/inspect-autolink-handoff-failure-20261006.mjs`
also compares the complete pre-export trace JSON with the later failure-snapshot
JSON using the existing independent `withDOCXExportDefaults` fixture. The full
tree matches: content, link marks, Word style declarations and root page settings
are retained in this captured four-block case. Input hashes are printed to bind
the finding to those artifacts. This narrows the diagnosis to premature reading
for this assertion; it does not complete the interrupted browser journey, prove
arbitrary DOCX fidelity or excuse the missing user-facing loading state.

Evidence stays under `artifacts/toolbar-full-desktop-matrix-20261006/` in the
`editor-edits-registered-HT-e74fa-er-Markdown-source-recovery-chromium` and
`editor-chooses-literal-add-787e9--links-through-DOCX-handoff-chromium` directories.
The 634-file pre-run fingerprint does not include root `vite.config.ts`; it is
not an exhaustive workspace/configuration snapshot. These diagnoses do not
promote browser, format or release status. Finish the unchanged matrix before
implementing and recording the fixes.

The later WebKit phase adds a third retained failure: paragraph HTML recovery
at `tests/browser/editor.spec.ts:127`, in
`tests/browser/markdown-paragraph-recovery-journey.ts:145`. The requested HTML
view remains JSON. The trace for `call@3589` records repeated unstable-element
and outside-viewport checks, then a pointer click at (1130.17, 815); the following
recovery-option check succeeds but the output is still JSON. Original recorded
frames before/after that click and after the option change were extracted and
opened using `artifacts/inspect-webkit-output-click-20261006.mjs`. They show
large scroll-position changes around the click. The site sets global
`html { scroll-behavior: smooth }` in `examples/react-app/src/index.css:5`.
This is a candidate focus/auto-scroll interaction, not a proven root cause or
an excuse to retry/force the click. Reproduce and record real pointer plus
keyboard selection after settled document readiness, expose the output mode
as accessible state, and verify no navigation/remount silently resets it.
The failing artifact is
`editor-recovers-paragraph--2eea3-locks-and-a-reopened-reader-webkit`; all expected
recovered text and follow-on editing/reader assertions must remain intact.

### Complete captured-surface visual review 2026 10 06

All 72 original `active-surface.png` images from
`artifacts/accessibility-interactive-contained-final-20261006` have now been
opened and inspected: nine panels and three readers, both widths, all three
desktop engines. This extends the earlier twelve representative-image review;
it is not every video frame, native OS picker, expanded disclosure or physical
device. `artifacts/record-interactive-visual-review-20261006.mjs` records the
exact image hashes and observations. It deliberately does not issue a blanket
visual pass despite the scanner's 72 passing states.

Three follow-ups emerged. The Firefox narrow table-panel capture places the
sticky navigation over its title/description; the equivalent Chromium/WebKit
images do not. Reproduce ordinary viewport focus/scroll and hit testing to
distinguish a user-facing obstruction from locator-screenshot auto-scroll.
WebKit placeholders in enabled Link/Find/media fields look faint and require
actual computed/painted contrast measurements, not assumed compliance or a
ratio guessed from antialiased pixels. All three narrow code forms separate
the line-number checkbox from its wording more than necessary; keep their
visible association together in the layout follow-up. Windows WebKit's native
colour-input hex fallback remains a platform limitation, not Safari device
certification. The fixed Link and Find actions are visibly contained in these
captures, and the captured readers retain their headings, tasks, tables, code
and text. Manual accessibility findings and production readiness remain open.

## Keyboard and source safe accessibility follow-up 2026 10 05

This follow-up supersedes the open code-region and empty/split-link items in
the historical table-control checkpoint below; it does not certify the whole
editor, exported readers or native Office layout.

`src/view/dom-renderer.ts` projects consecutive standard linked text leaves
with equal link attributes into one anchor, retaining each original text path,
other marks and decorations. Different targets and interactive widgets end the
run. Whitespace-only text links have no actionable `href` in the view, while
document JSON, source and exporters keep their original metadata. Typing visible
text restores the action, and exact undo restores the original whitespace link.
The six `tests/inline-link-view.test.ts` cases cover editable/read-only rendering,
attributes, native range replacement, decorations and widget separation.

`src/extensions/nodes/code-block.ts` supplies a labelled, tab-focusable scrolling
region. `src/view/input.ts` distinguishes region browsing from a source caret:
plain Left/Right scroll, Tab exits natively, and Enter/typing/paste deliberately
enter the first source leaf. Browsing cannot delete/cut a stale paragraph range.
Existing extension event precedence and normal caret editing remain intact.
Seven `tests/code-region-keyboard.test.ts` cases include childless code,
read-only scrolling, paste targeting, history and plugin precedence.

Real Chromium copy/paste exposed two genuine problems beyond synthetic events:
without a source caret Ctrl+V did not emit paste, and after caret entry the
automatic hashtag paste rule converted `# copied` into a link and lost its
trailing newline. The input bridge now establishes the caret before native
paste. `src/extensions/link-behavior.ts` declines automatic link input/paste in
any code-semantic ancestor, including nested code; two StarterKit regression
cases retain literal URLs, hashtags and trailing whitespace. Explicit link
commands are not removed. `src/styles.css` adds a visible code focus ring and
uses inset tint shadows for full-block feedback rather than replacing source
backgrounds, preserving dark code and custom node appearance.

The frozen nine-case, three-engine recorded batch in
`artifacts/accessibility-human-input-source-safe-20261005` passes 25 checks with
two deliberate skips: the native clipboard case is Chromium-only. It covers
backward linked-text selection/replacement and exact history, actual code Tab
navigation/scrolling/typing, code paste, structural block feedback, table resize
and merged-table operations, React link controls and HTML-flow editing. Code and
link captures and the real paste result were opened and visually inspected.
Earlier failed batches remain in `artifacts/accessibility-human-input-final-20261005`
and `artifacts/accessibility-human-input-frozen-20261005`; no assertion or retry
relaxation turns them into passes. The focused five-file unit batch passes 79
cases, separately from the complete package gate.

The final pinned axe-core scan in
`artifacts/accessibility-rendered-transitions-final-20261005/summary.json`
passes all 36 initial main-page states: six routes, two viewport widths and three
desktop engines, with a real Markdown import in the conversion lab. No rules are
disabled. The scanner waits for observed finite animations on painted targets
instead of evaluating intermediate CSS transition colours; pending transitions
inside closed Firefox details are not painted. Earlier two-timeout reports
remain retained. All 36 final states still have incomplete/manual checks.
Author dialogs/menus, sandboxed reader frames, assistive technology and physical
devices are not certified by this scan. The fresh whole-browser matrix remains
open; PROD-03 stays Partial.

The measured runtime totals are 1561.1 KiB ESM, 1298.0 KiB CommonJS and 86.3 KiB
CSS. The bounded aggregate caps are 1561.5 / 1298 KiB and the CSS cap is 86.4 KiB;
individual JavaScript entry, public API, headless and performance limits remain
unchanged. No runtime dependency or public API was added. The original complete
gate in `artifacts/accessibility-source-safe-complete-gate-20261005.log` failed
the 1,000-block server HTML p95 budget at 127.71 ms against 120 ms. The isolated
diagnostic in `artifacts/accessibility-source-safe-performance-diagnostic-20261005.log`
passed at 60.08 ms without source, fixture or limit changes. This is variability
evidence, not an established root cause or a performance fix. The subsequent
complete serial gate in
`artifacts/accessibility-source-safe-complete-recheck-20261005.log` passes
2,345 tests / 178 files, all 407 public declarations, 88 headless modules,
compiled ESM/CommonJS package consumers, Node/workerd, framework type checks,
size, performance and memory gates. Its server HTML p95 is 64.98 ms against the
unchanged 120 ms limit; server/local/incremental-remote median growth is
7.63x / 8.56x / 6.49x against 15x. Live-session, destroyed-editor and retained
server-document heap growth is 0.00 / 0.06 / 14.31 MiB against 8 / 16 / 48 MiB.
The gate stopped only after terminal success; no runtime edits occurred during
it. It is not substituted for the retained failure or the full browser matrix.

## Accessibility and table control follow-up 2026 10 05

The initial pinned axe-core 4.14.0 Chromium scan fails all twelve states: six
public routes at 1280px and 390px. Retain
`artifacts/accessibility-initial-20261005`, including complete rule/node reports,
ARIA trees and images. The oracle comes from the official npm archive with its
integrity verified and license retained by `scripts/prepare-accessibility-oracle.mjs`;
it is test-only, not a shipped dependency or runtime parser.

The actual fixes include initial/min/max/pixel resize announcements, merged-cell
logical column widths, cancelled preview restoration, shared private WeakMap
geometry/widths for immutable tables, contrast on the demo/Lean badges, 24px task
and policy checkboxes, focusable labelled host recipe panels and clearer visible
action names. The first parenthetical icon labels still fail the independent
checker, which strips parenthetical text in its matching algorithm; explicit
prefixes such as `H1 — Heading 1` retain the visible abbreviation instead.
Imported document headings remain independent of the lab's control sections.

Real keyboard/pointer use exposed more than missing ARIA attributes. Initial
handle focus dispatched a cell selection whose browser range stole focus.
Control-owned cell selection now keeps its markers without replacing that
control's DOM selection. Pointer resizing after undo/redo then exposed an old
queued selection running after a nested newer transaction. View synchronization
now accepts only the current immutable state and ignores destroyed views.
Pointer activation focuses the handle before its selection/resize workflow.
No waiting/retry relaxation replaces these behavior fixes.

`tests/table.test.ts` checks initial and merged widths, preview/cancel/history,
movement with widths supplied by another row, 300-cell bounded geometry builds,
and the obsolete-gap/latest-cell range ordering. The new range regression fails
before the queue guard and passes after it; the focused table/view/toolbar batch
passes 65 cases. Three-engine browser tests retain the original merged-table,
header and clipboard-grid workflow and add actual handle focus, Shift+Arrow,
pointer drag, retained cell selection and complete-document undo assertions.
Final six cases pass with recordings/traces in
`artifacts/table-accessibility-current-selection-20261005`; all six final PNGs
were opened and inspected. Earlier failing focus/pointer batches remain in
`artifacts/table-accessibility-browser-20261005` and
`artifacts/table-accessibility-final-20261005`, rather than being overwritten.

The page scanner `scripts/check-browser-accessibility.mjs` checks real editor
readiness, imports a Markdown file into the conversion lab, reports main-document
asset errors, saves full rule results/ARIA trees/images and returns nonzero for
any violation or runtime/readiness failure. No rule is disabled. Its scope is
initial main documents, not author menus/dialogs or sandboxed reader frames;
incomplete contrast/ARIA/frame checks stay visible. One discarded server attempt
encountered missing compiled CSS during a concurrent rebuild; its retained
readiness failures are not accessibility passes. A subsequent Chromium load
timeout is retained in `artifacts/accessibility-postfix-20261005`. Navigation
now waits for DOM content and actual editor readiness, not unrelated external
resource completion. Final labels/heading reports are stored separately in
`artifacts/accessibility-labels-followup-20261005`.

The measured bounded runtime increase is about 1.4 KiB ESM and 1.1 KiB CJS,
including resize projection and view ownership. Aggregate ceilings increase by
1 KiB each (1558.5 / 1296 KiB); individual entry, CSS, public API, headless and
performance limits are unchanged. The 2,325-test gate below predates this work;
2,329 and the first 2,330 gates predate the final accessible-name refinements.
Remaining code-region focus, empty/split links, manual checks, real screen-reader
use, mobile devices and the fresh broad browser matrix are still open. No WCAG,
whole-matrix, PROD-03, percentage or release certification follows from this
focused work.

## Source owned quote appearance and desktop audit 2026 10 05

Current follow-up status: the durable 585-check recorded desktop run finished:
568 passed, 15 explicitly skipped and two failed, with no retries. Chromium
completed its 195 cases. Firefox exposed a 60-second timeout at the final
narrow reader capture in the HTML-comment workflow: the trace waits to enter the
reader frame after repeated saved snapshots/viewport change, while the failure
image visibly shows the reader. Earlier source, editing and history assertions
completed. The artifact and trace remain in
`artifacts/desktop-confidence-durable-20261005/results/editor-preserves-inert-HTM-d7426-ng-source-and-reader-output-firefox`.
A new `tests/html-comment-workshop.test.tsx` initially failed because changed
saved snapshots reused the same iframe. After the broad run was terminal, the
reader received `key={frame}`: changed snapshots own fresh frames; identical
saves keep their frame, and unsaved author edits do not change a saved reader.
The four-file focused quote/DOCX/lifecycle batch passes 33 cases. This does not
establish the cause of the intermittent Firefox failure. The subsequent complete
serial `pnpm check` passes 2,325 tests / 176 files, 407 declarations, 88 headless
modules, compiled Node/workerd and isolated ESM/CommonJS quote/core/Yjs consumers,
all type and size checks, performance and memory. The earlier 2,322-test count
below is historical. Server/local/remote median growth is 7.86x / 7.68x / 6.69x
against the unchanged 15x limits; live/destroyed/server-document heap growth is
0.00 / 0.06 / 14.29 MiB against 8 / 16 / 48 MiB limits. This gate does not replace
the failed broad browser report or prove a Firefox root cause.
Runtime/demo code was not edited during the broad run, preserving its subject.

WebKit's second failure is `Unexpected end of JSON input` at the initial read in
`math-files-journey.ts`, before adding an equation or saving any file. The static
`pre` exists before React's initialization effect commits its document. The
journey now waits for both initial equation blocks and the actual serialized
document, not a fixed delay. Every complete downloaded/reopened JSON, metadata,
history, invalid-file refusal and Markdown-source assertion remains unchanged.
Failure screenshot/trace/recording remain in
`artifacts/desktop-confidence-durable-20261005/results/editor-saves-and-reopens-e-80e36-ferences-and-history-intact-webkit`.
The final report and `results/.last-run.json` mark the broad run failed; it must
not be replaced by a clean targeted rerun. The original two workflows pass all
18 three-repeat, three-engine recorded checks in
`artifacts/reader-and-equation-followup-20261005`; its terminal status is passing.
Twelve representative narrow author/reader and reopened equation author/reader
images (four per engine) were opened and inspected. All actual files, recordings
and traces remain. The Chromium full-region author capture shows a blank
off-screen iframe, while the subsequent frame-body capture renders the correct
saved prose; treat that stitched capture as a capture limitation, not standalone
proof of the reader's visible state. Firefox/WebKit full-region captures and all
three body captures show the expected text. The original broad matrix still
failed; this focused evidence is not an updated whole-matrix pass.

The independent `scripts/check-reader-frame-lifecycle.mjs` diagnostic isolates
sandboxed `srcDoc` saving/restoring and narrow-screen captures without Fountain,
React, network content or clipboard use. Both reused and replaced frames pass in
Chromium, Firefox and WebKit (six cases), with unchanged deny-by-default CSP and
sandbox. All six narrow reader images were opened and show the expected prose;
events, recordings and traces are retained in
`artifacts/reader-frame-lifecycle-20261005`. This does **not** reproduce the broad
Firefox failure and therefore does not prove iframe reuse caused it. The actual
workshop journey, including its final frame-body capture, was subsequently rerun
in the 18-case batch above; neither a timeout increase nor this independent
diagnostic substitutes for that workflow. The ownership change was applied only
after the broad run finished.

Before any candidate fix, `scripts/check-comment-reader-workshop.mjs` also ran
three separate Firefox contexts against the existing public workshop. Actual
typing, comment-property edits, invalid-data refusal, two undos, removal/undo,
repeated saves and the final 390px author/frame-body captures pass three times,
with no page errors. All six author/reader narrow images were inspected. Artifacts
remain in `artifacts/comment-reader-workshop-before-20261005`. This diagnostic
deliberately avoids the system clipboard so it can run without interfering with
the broad audit; it is not the complete original clipboard-containing journey.
Both the isolated frame diagnostic and this actual-workshop evidence therefore
leave the broad Firefox timeout unresolved. A future pass after changing iframe
ownership would establish that tested workflow, **not** establish causality for
an intermittent failure that already passes before the change.

The retained failure trace narrows the symptom further: the final screenshot's
frame-body lookup starts at 648,938ms and remains unresolved for approximately
44 seconds before the test's after hooks. This is not simply the screenshot
starting at an already-exhausted deadline. The parent snapshot still refers to
the comment reader `frame@5b1dc11d55ee4d07f8f69c44b851ccd8`, but its last child
snapshot is `input@call@494` at 647,002ms, immediately before saving the restored
original content. All later parent/other-reader snapshots continue, while this
child disappears from subsequent trace snapshots. This supports a lost
frame-association/navigation hypothesis, not proof that the document was lost
or that a browser/driver root cause has been established. Fresh immutable saved
frame ownership is a bounded defensive change to verify after the broad run;
the earlier failure and passing-before-change evidence must remain visible.

Unreleased: opening the actual export comparisons exposed a real visual defect:
an imported Word quote had its original paragraph border and indentation **plus**
the editor's default blockquote decoration. The optional built-in
`blockquote.appearance: "explicit"` now neutralizes only the semantic container;
the child paragraph keeps the source-owned border, spacing, indentation and font
context. Ordinary Fountain quotes keep their existing JSON and DOM defaults.
Browser/server HTML preserve the strict flag. Ordinary Markdown reports its
styling loss instead of implying exact visual retention.

Native export uses a neutral `FountainExplicitQuote` paragraph style rather than
Word's decorated `Quote` style. This also prevents a deliberately borderless
source quote from acquiring a border/indent during export. A receiving host
schema without the optional attribute receives `quote-appearance-not-imported`;
its visible content survives, but doubled host decoration remains a reported
limitation. This is a bounded source-appearance fix, not native Word certification.

The caption comparison was a different issue: the legacy caption string becomes
editable rich content carrying the native Caption/Normal font and paragraph
defaults. The test now declares this complete expected projection independently
and checks the entire reopened tree, including all image attributes and embedded
bytes. It does not strip caption/layout metadata from actual results. Native
semantic table-header tags and the default header fill are likewise checked in
the untouched archive and complete reopened model.

The independent browser DOCX viewer still omits the fixture's two header labels
(`Feature`, `Result`), despite rendering four cells. That disagreement is visible
in the comparison and explicitly tested. No header text is injected into the
preview and no archive is rewritten to make the reference look correct. The
audit's default stacked layout now exposes complete 816px Letter page surfaces
instead of clipping the right-hand page. A wide viewport can still show both
surfaces beside each other. Different typography, image corner styling, quote
geometry and native page layout remain observable fidelity gaps.

Evidence:

- `tests/quote-appearance.test.ts`: six contracts cover ordinary defaults,
  browser/server HTML, strict invalid-mode rejection, independent Word quote
  import, borderless native reopen, Markdown losses and receiving-schema warnings.
  `tests/docx.test.ts` adds a complete legacy-caption/pixels retention contract.
  A subsequent two-contract follow-up checks Enter/join/quote unwrapping and
  Undo/Redo with complete expected trees, plus Yjs propagation/local undo that
  preserves a peer text edit and paragraph appearance. All 32 tests in the
  focused quote/emphasis/DOCX batch pass. The join expectation preserves the
  engine's two mapped text leaves and the existing trailing caret paragraph;
  neither is normalized away. These additional tests postdate the full-gate
  count below and do not change the runtime code used by the broad browser run.
- `scripts/check-docx-quote-appearance.mjs`: compiled ESM and CommonJS exercise
  bordered and borderless quotes, actual OOXML styles, complete reopened JSON,
  immutable source and neutral HTML with `window`/`document` absent. This runs
  permanently in `test:docx-interoperability`, not only against saved artifacts.
  The subsequent compiled follow-up also uses the shipped `/core` entry for
  Enter/Undo/Redo and Yjs propagation/local undo on both bordered and borderless
  documents, retaining the peer's text and complete paragraph data. ESM and
  CommonJS run in separate Node consumers so the harness does not manufacture
  a duplicate-Yjs constructor warning. Both consumers pass without a DOM shim.
- `artifacts/docx-complete-preview-20261005`: six caption/list workflows pass;
  nine full-page captures were inspected and exposed the doubled quote border.
- `artifacts/docx-quote-appearance-20261005`: six quote/caption and list workflows
  pass across Chromium, Firefox and WebKit. The final strengthened close-up
  batch, `artifacts/docx-quote-appearance-final-20261005`, passes all three engines;
  all nine final images were opened and inspected. Real caption clicking, typing,
  Undo/Redo, native re-export and complete reopening are checked. Original and
  edited DOCX files, traces and recordings remain alongside the captures.
- The earlier broad Chromium baseline retained 184 passes / 11 failures in
  `artifacts/desktop-confidence-chromium-20261005`. The focused follow-up retained
  10 passes / one failure. The subsequent three-engine batch retained 28 passes /
  two explicit clipboard-capability skips / three caption-projection failures.
  Those failures are not erased; corrected expectations now verify native
  materialization and editable caption retention rather than ignoring fields.
- `artifacts/desktop-confidence-chromium-final-20261005`: **195 passes**, before
  the later source-owned quote change. This is not a full-suite certificate for
  that subsequent code. A new complete three-engine current-tree run is separate
  from the focused quote checks and must be assessed on its own terminal result.
  The first attempt in `artifacts/desktop-confidence-current-tree-20261005` was
  interrupted: its process/session disappeared and no terminal report exists.
  Its retained recordings are not counted as a completed run. A separate durable
  run stores machine-readable results and logs in
  `artifacts/desktop-confidence-durable-20261005` without overwriting that attempt.

The final serial `pnpm check` passes **2,322 tests / 175 files**, 407 public
declarations, the 88-module headless boundary, compiled Node/workerd, CommonMark,
math, independent DOCX interoperability, packaging, framework typing and budgets.
CommonMark remains 563 default / 611 opt-in out of 652. Server/local/remote median
growth is **8.51x / 8.92x / 11.25x**, within unchanged 15x limits; live/destroyed/
server-document heap growth is **0.00 / 0.06 / 14.30 MiB**, within 8 / 16 / 48 MiB.

The first size gate failed; the small feature cost is accounted for explicitly,
not described as unchanged size budgets. Shared validation is reused. Measured
DOCX raw ESM/CJS is **182.7 / 147.6 KiB**, with narrowly increased **183 / 148 KiB**
ceilings (each +0.5 KiB). Aggregate output is **1556.7 / 1294.4 KiB**, with
**1557.5 / 1295 KiB** ceilings (each +1.5 KiB). No dependency was added, and other
entry, CSS, performance and memory ceilings are unchanged. An overlapping
build/typecheck attempt failed because Angular declarations were being rebuilt;
the final serial full gate includes passing Angular/Svelte/TypeScript checks.

Native Word/LibreOffice page comparisons, wider layouts, physical-device input,
full CommonMark and FORMAT-05 remain incomplete. No parity row, percentage,
release, or whole-format fidelity claim is promoted by this checkpoint.

## Table owned text formatting 2026 10 05

Unreleased: supported table text now enters the existing Word run/paragraph
cascade, without a second parser, browser dependency or portable Word-style
binding. `src/docx/table-style.ts` keeps base and regional `rPr`/`pPr` ancestry;
`src/docx/table-text.ts` reuses strict namespace-aware decoding. The caller selects
regions using the same grid/look/Office order as appearance. `style-cascade.ts`
applies table values between document defaults and paragraph/character styles,
then direct formatting. Word table toggles are absolute resets; repeating true
does not accidentally turn bold off, and false explicitly clears it.

Supported text fonts, sizes, colour, pitch and marks become editable run values.
Paragraph spacing, alignment, indentation, supported borders and keep/break
intent become existing portable paragraph data. Conditional spacing attributes
inherit independently. Nested tables replace rather than leak the containing
table's text context. Reserved TableNormal child declarations, including a
cyclic basedOn, are ignored according to Word's documented special rule.

This remains a bounded conversion, **not native Word certification**. The native
Normal/document-default equivalence exception is not resolved by a guessed
equal-value filter: applicable Normal ancestry emits a located
`table-normal-style-precedence-unverified` warning. Unsupported used properties
and receiving-schema limitations remain explicit losses. Numbering style levels,
live binding/provenance, table row/RTL/conflict rules, original-source rendering,
native font geometry and four known unknown-font failures remain open.

Evidence:

- `tests/docx-table-text.test.ts`: **16 pure-Node contracts**. All initial eight
  cases failed before implementation. They now cover base/conditional styles,
  Word toggle semantics, paragraph/character/direct precedence, independent
  spacing attributes, nested-table isolation, native reopen, located losses,
  TableNormal, warned Normal precedence, omitted-grid refusal, true-default/off
  resets, receiving-schema marks, namespaces/ambiguity, unused malformed regions,
  invalid values and marked hard breaks. One later expected mark-order assertion
  was corrected to the existing `letter_spacing`-before-`em` order; no product
  formatting was dropped to pass it.
- `scripts/check-docx-table-text.mjs`: compiled **ESM and CommonJS** entries
  exercise actual table import/export/reopen without window/document or jsdom.
  The runtime gate is part of `test:docx-interoperability`, not artifact-dependent.
- `scripts/create-table-style-fixture.py --conditional --text` supplies an
  independent python-docx source with parent/child text styles, table-derived
  header bold/size/alignment, status alignment, slate body colour and a direct
  black override. Its explicit empty `AuditTableBody` paragraph style separates
  this verified case from the unresolved native Normal exception. Previous
  inherited/conditional fixtures remain unchanged.
- `artifacts/docx-table-text-20261005`: **six recorded workflows pass** in
  Chromium/Firefox/WebKit: new table-text and prior conditional appearance cases.
  Actual upload, cell typing, Undo/Redo, JSON backup, DOCX download and reupload
  compare complete reopened JSON against declared export materialization. Header
  size/weight/colour, paragraph alignment and body colour are checked via the
  rendered editor. All **30** new source/imported/edited/reopened/export images
  were opened and inspected; recordings, traces, originals and exports remain.

The independent source viewer skips conditional cell/text styles and substitutes
heading/body typography. The exported direct styles are visible, including header
weight/alignment, but wrapping and width metrics still differ. These screenshots
are **not pixel or native Word equivalence**. The actual Chromium DOCX download
was passed to the documents skill's packaged renderer with bundled-only paths;
it exited 1 because `LibreOffice soffice.exe was not found on PATH`. No native
PDF/PNGs were created, and the user's desktop LibreOffice was not used. The
skill's native verification gate remains unfulfilled.

The complete local `pnpm check` passes **2,283 tests / 172 files**, 407 public
declarations and the 88-module headless boundary. Node/workerd, CommonMark,
math-reference, independent DOCX interoperability, package, framework, size and
performance gates pass. The added compiled table-text script also passes in both
module formats. CommonMark scores remain unchanged (563 default / 611 opt-in out
of 652). Performance growth is server/local/remote **8.63x / 7.84x / 10.84x**,
against unchanged 15x limits. This does not erase the earlier 16.89x failure
retained below; repeated-run confidence remains a production concern.

The first size attempt failed at DOCX 182.1 / 147.1 KiB and aggregate 1551.8 /
1290.2 KiB. The text feature adds about 1.9 / 1.5 KiB, with no new dependency or
public export. Narrow ceilings are now DOCX 182.5 / 147.5 KiB and aggregate
1552.5 / 1291 KiB; unrelated entry/CSS and performance limits are unchanged.

FORMAT-05 and FB-04 remain incomplete. No release, delivered row or percentage
promotion. Next require native Normal/default and typography evidence, then
broader row/section/layout support; unfinished CommonMark remains in scope.

## Inherited and conditional table appearance 2026 10 05

Unreleased: `src/docx/table-style.ts` indexes actual default table styles and
bounded parent chains separately from paragraph/character styles. The existing
namespace-aware ZIP/XML reader owns identities, bounds and source-part routing.
Supported table/cell borders and physical margins merge by edge; fill, width and
layout retain explicit resets. Invalid ancestry warns without dropping editable
content/direct declarations. Source XML trees are not mutated or made executable.

Conditional cell appearance now resolves row/column bands, edge rows/columns and
corners in Office precedence, not source order. Parent/child declarations merge
within each region before geometric regions combine. Table-look masks/named off
flags, row exceptions, bounded band sizes, horizontal grid spans and Word's
row-wide conditional-margin semantics are covered. Current geometry is used
instead of stale `cnfStyle` optimization annotations. Unsupported/ignored
regions, text/row/table-level properties, incomplete grid-offset rows and distinct
merged-continuation appearance remain explicit diagnostics. The bridge does not
invent header roles or row-repeat intent from styling.

These are **materialized values**, not live Word rules. The resulting portable
document can be edited and exported with effective direct native properties;
moving/inserting rows does not recompute the imported band/style rules. Live
style bindings, original style XML, full provenance and third-party save retention
are not delivered. Table text styles, row height/wrapping, RTL/native conflict
rules and exact page layout still need their own implementation/evidence.

Evidence on this code:

- `tests/docx-table-styles.test.ts`: 14 pure-Node base/inheritance/default/edge/
  schema/ambiguity contracts. Before implementation, seven of the original eight
  base tests failed. The style-reader expectation now distinguishes supported
  table indexing from still-unimplemented style text behavior.
- `tests/docx-table-conditions.test.ts`: 18 pure-Node regional contracts. All six
  first tests reproduced missing conditional appearance before implementation.
  Added cases cover row-wide margins, span-aware edge membership, single-cell
  precedence, look exceptions, stale annotations, unsupported properties,
  invalid/ambiguous declarations, grid-offset refusal, merged-continuation fill,
  foreign namespaces, aliases and explicit false overrides.
- `scripts/create-table-style-fixture.py` produces independent python-docx
  sources, not a Fountain export fed back to itself. Named parent/child styles
  contain real inherited/conditional declarations; explicit yellow/clear fill
  and zero padding exercise direct overrides. The template's decorative Title
  border was removed as fixture-authoring cleanup, not by changing editor CSS.
- `artifacts/docx-conditional-table-initial-20261005`: **six recorded workflows
  pass** across Chromium, Firefox and WebKit, covering inherited and conditional
  sources separately. Real upload, cell typing, Undo/Redo, JSON backup, actual
  native DOCX download and reupload are used. Complete reopened JSON is compared
  with declared export materialization; actual attributes/content are not stripped
  to manufacture equality. All **30** source/editor/edited/reopened/export page
  captures were opened and inspected. Recordings, traces and downloads remain.
- The earlier inherited-only recorded run exposed an expected-harness mark-order
  omission: `withDOCXExportStyles` did not include `letter_spacing`, placing it
  before native fonts. Its ordering now retains the complete pitch/font/mark
  data. This was a comparison-harness fix, not a missing product pitch value.

The independent source browser preview misses the conditional rules and renders
base fills instead. It also substitutes source fonts/heading color and wraps
differently from the editor/native-export preview. Exported direct appearance
is visible in that independent viewer, but the screenshots are **not pixel or
native Word equivalence**. The actual Chromium conditional DOCX download was
passed to the packaged renderer with bundled-only paths; the renderer raised
`FileNotFoundError: LibreOffice soffice.exe was not found on PATH`. No native PDF
or page images were created; the user's desktop LibreOffice was not used. The
document-verification skill's native-render gate remains unfulfilled.

The behavioral suite passes **2,267 tests / 171 files**. The earlier complete
`pnpm check` passed 2,264 tests before three final edge-case additions. A later
complete attempt stopped at incremental-remote performance growth **16.89x**
against the unchanged **15x** limit. The isolated unchanged-gate rerun passed
at **9.39x** (server/local 9.22x / 10.68x); this does not explain or erase the
failed observation. API/package/Node/workerd/headless/reference/interoperability/
size/framework checks retain their existing boundaries: 407 declarations,
87 headless modules and unchanged CommonMark scores.

This optional boundary adds runtime code, not a dependency or public API. Base
inheritance measured 175.7 / 142.2 KiB ESM/CommonJS; conditional rules add about
4.5 / 3.5 KiB, yielding 180.2 / 145.6 KiB. The previous size check failed before
narrow explicit allocations: DOCX ceilings are 180.5 / 146 KiB, aggregate ceilings
1550.5 / 1289.5 KiB, measured aggregate 1549.9 / 1288.8 KiB. Unrelated entry/CSS
and all performance limits remain unchanged.

No release, whole-format certification, delivered-row or completion-percentage
promotion. FORMAT-05 remains Partial. Next advance table-owned text formatting
and adjudicate native layout/typography with real native rendering; retain the
four known unknown-font geometry failures and unresolved CommonMark differences.

## Row repetition and empty run retention 2026 10 05

Unreleased: native Word repeat-on-page intent is now separate from semantic
header cells. Import stores `table_row.attrs.repeatHeader`; ordinary repeated
cells no longer acquire invented purple fill or bold text. Explicit false
survives export/reopen. Nonleading on flags remain retained but warn because
Word ignores them. Legacy unspecified rows keep the all-header-cell default,
with a located report when native export materializes it. Strict behavior-free
versioned controls retain Fountain header scopes separately from repetition;
their survival after third-party editing/saving remains unverified.

The public conversion lab now exposes contextual table controls, including a
separate **Repeat row on pages** action. Actual clicks, typing, Undo/Redo, cell
role toggles, JSON backup and native DOCX download/reopen pass in Chromium,
Firefox and WebKit. The first recorded run failed in all three: native export
and import discarded an explicitly empty text leaf. The fix writes/reads an
actual empty native text element and supported run marks, without inventing a
leaf for childless paragraphs, property-only runs, deleted text or empty field
instructions. Complete-model assertions retain the published Word-style
materialization; no actual attributes/content are stripped to manufacture equality.

Evidence on this code:

- `artifacts/docx-row-repetition-initial-20261005`: the three original failures,
  recordings, downloads and full-model differences remain available.
- `artifacts/docx-row-repetition-verified-20261005`: three recorded public-lab
  import/edit/export/reopen journeys pass; all 15 source/editor/export/reopen
  images were inspected. The source/export browser previews have readable plain
  rows with no invented header emphasis/fill. Editor margins and line spacing
  still differ from that independent viewer; this is not pixel equivalence.
- `artifacts/docx-row-repetition-explicit-pages-20261005`: six recorded page
  journeys pass, with all 12 whole-sheet-stack captures inspected. Ordinary
  cells explicitly repeat across six sheets; semantic headers explicitly off
  do not repeat across five. Actual typing and history refresh clones while
  preserving all 13 canonical model rows and the explicit choice.
- The existing canonical-table/oversized-row and merged-header/body-rowspan
  regressions separately pass nine recorded checks across the same engines, in
  `artifacts/docx-row-repetition-page-regressions-20261005` and
  `artifacts/docx-row-repetition-merged-regressions-20261005`.

The final serial `pnpm check` passes **2,235 tests / 169 files**, including the
package, Node/workerd, 86-module headless, reference, independent python-docx,
build-size, performance and framework type gates. There are 407 declaration
files; the toolbar action ID is an intentional additive union member. An earlier
whole run passed 2,234 tests and failed one glossary expectation that deliberately
discarded empty text. That expectation now requires the complete retained empty
leaf and its marks; the final full run is the passing evidence.

This feature adds measured runtime code, not a new dependency. Narrow size
allowances were explicitly allocated after the previous size check failed:
DOCX ceilings are 170.5 / 138 KiB, aggregate ESM/CommonJS ceilings 1540.5 / 1282
KiB, and the CJS core alias ceiling gains 128 bytes. Measured aggregate code is
1539.9 / 1281.1 KiB, about 4.3 / 3.8 KiB above the prior checkpoint. Unrelated
entry/CSS ceilings and all performance limits remain unchanged. Final serial
server/local/remote median growth is 8.94x / 7.91x / 10.85x under 15x; retained
heaps are 0.00 / 0.06 / 14.31 MiB under 8 / 16 / 48 MiB.

The packaged renderer was attempted on the actual Chromium DOCX download with
bundled-only tool paths. It fails before conversion because bundled
`soffice.exe` is unavailable. No native page images or PDF were created, and
the user's installed desktop LibreOffice was not used. The document-verification
skill's native-render gate therefore remains unfulfilled. Independent browser
previews and XML/JSON checks do not certify native Word page behavior. Inherited
and conditional table styles, row height/wrapping, broader typography, the four
known unknown-font geometry failures, wider native layout and overall parity
remain open. No release, delivered-row or completion-percentage promotion.

Latest cleared-inline-flow follow-up (2026-10-05, Unreleased): deleting all
unmarked inline text left a valid empty text leaf, but canonical Markdown reopened
it as a childless flow. The new regression first failed on that complete-model
difference. A strictly scoped inert `data-fountain-empty-text="true"` carrier
now retains the cleared leaf. Genuine childless flows stay childless, marked
empty leaves retain their marks, and existing pointer/node-selection typing
fills both without changing their type. Ordinary paragraph normalization and
native HTML's zero-content reader projection are unchanged; JSON remains the
arbitrary-model backup. The public workshop adds sample selection and explicit
save/reopen; unsupported active/invalid carrier attributes are still declined.

The complete serial `pnpm check` passes **2,206 tests / 167 files** (12 additional
unit regressions; 27 flow tests in two files), 407 declarations and the 86-module
headless boundary. Compiled Node/workerd contracts include childless, unmarked
empty and marked empty canonical reopening. CommonMark profiles are unchanged,
including the 611/652 opt-in profile. Aggregate ESM/CommonJS code is 1535.6 /
1277.3 KiB under the existing 1536 / 1278 caps; no budget or dependency changed.
Serial server/local/remote median growth is 9.40x / 6.71x / 5.99x under 15x, with
retained heaps 0.00 / 0.06 / 14.26 MiB under 8 / 16 / 48 MiB. A prior parallel
attempt failed performance limits and interfered with the browser audit by
rebuilding its consumed `dist`; that browser run was discarded and its owned
process tree stopped. The later complete serial run is the passing gate evidence.

The independent `scripts/check-browser-clipboard-capability.mjs` diagnostic
reproduces the Windows Playwright WebKit limitation without Fountain: native
textarea copying transfers, but event-authored `setData`/`preventDefault` copies
paste as empty payloads even with text/plain alone. Chromium/Firefox transfer
native, plain-handler and plain/HTML/custom-MIME-handler copies. The affected
Windows/WebKit real-clipboard test has an explicit capability exclusion; ordinary
cut/edit/save/reopen continues to be tested there. This is not real Safari
certification, and does not justify a production-browser workaround based on UA.

A separate serial Firefox journey completed editing but timed out resolving a
reader frame after changing samples and rapidly saving its srcdoc. Snapshot
previews now create a fresh cloned sandboxed iframe with the same CSP; the empty
reader assertion also waits for that CSP document, not a previous blank body.
The isolated recorded Firefox rerun passes. The observed timeout and its trace
remain in `artifacts/html-flow-retention-serial-20261005`; an internal Firefox
root cause is not asserted. Final combined-browser evidence is recorded below.

Final recorded run: `artifacts/html-flow-retention-verified-20261005` has **14
passed / 1 explicitly excluded** journeys. Default scope conversion, inert
comments, flow spacing/Enter/join/undo and clear/cut/save/reopen/continued typing
pass in Chromium, Firefox and WebKit. Both childless and cleared-leaf scenarios
run at a narrow viewport. Real internal paste and Fountain-to-external-textarea
paste pass in Chromium and Firefox; the exclusion is only Windows WebKit's
independently reproduced event-authored clipboard transfer. All 22 new retention,
clipboard, reader and actual mobile-viewport control screenshots were inspected.
Source, engine, native reader and external-destination text agree in these bounded
cases; arbitrary-format/pixel equivalence is not implied. Final demo typechecking
and the independent nine-case clipboard diagnostic also complete successfully;
the diagnostic still reports the two unsupported WebKit handler-transfer cases
as failures of that capability, not successful clipboard certification.

Native Word/font layout, unsupported formats, arbitrary HTML tree identity,
physical mobile/IME and the broader parity programme remain open. No publication,
release, delivered-row or completion-percentage promotion.

Latest shared-engine/anonymous-flow follow-up (2026-10-05, Unreleased): the
explicit `HTMLFlowExtension` preserves anonymous inline HTML instead of creating
an authored paragraph. In the cross-paragraph link fixture, linked whitespace
remains in the model while editor and native reader both have two paragraphs.
Native HTML omits synthetic separators beside flows and at standalone document
edges; canonical Markdown uses an inert same-schema carrier. Actual typing into
the flow, a visible Enter break, Backspace join and four-step undo pass in all
three desktop engines. The public Node Markdown page includes the optional
policy and a separate editing/reader workshop. Word conversion remains a
readable fallback with an explicit `block-fallback` warning, not native support.

The complete check passes 2,194 tests / 167 files (15 new flow regressions),
407 public declarations, and an 86-module no-DOM source boundary. Node and real
workerd verify supported native/canonical complete-model reopening and exact
untouched source. The separate opt-in container/comment/flow profile remains
611/652 on both LF/CRLF plus 1,304 exact-source checks; default 563/652 and older
profiles are unchanged. No comparator normalization or permissive URL/HTML
policy was introduced.

Recorded artifacts are in `artifacts/html-flow-three-engine-20261005`: six tests
pass (comment and flow journeys in each desktop engine), with seven flow PNGs
per engine and video/trace. All 21 flow captures were inspected. Reference/native
paragraph geometry is equal at desktop and narrow widths; the editor's paragraph
spacing is 40 CSS pixels. Decoded original reader/reference pixels match exactly
in Firefox and WebKit, but Chromium has 1,803 differing text-region pixels in a
751×137 capture. No universal pixel-identity claim is made or tolerance relaxed.
The older default-schema scope journey deliberately retains its three-paragraph
fallback and warning; the new schema is separately opt-in.
That unchanged default-schema scope journey also passes all three recorded
desktop projects in `artifacts/html-flow-default-scope-regression-20261005`.

The first full run failed a new test's incorrect `DOCXExportResult.issues` access;
it now checks the actual `report.issues` and the full rerun passes. Aggregate
code measures 1535.1 / 1276.9 KiB, bounded at 1536 / 1278; the sole 93-byte normal-
whitespace CSS rule adds a precisely bounded 128-byte stylesheet allowance.
Entry/performance/memory ceilings are unchanged. Final server/local/remote median
growth is 8.83x / 9.91x / 11.66x under the existing 15x caps. No dependency was added.
This does not resolve native Word/font-layout limitations, arbitrary HTML tree
identity, all input combinations or the overall format/parity programme. Nothing
has been published or counted as a newly delivered parity row. See
[the flow contract](MARKDOWN_DOCUMENT_FLOW.md#optional-anonymous-inline-flow-2026-10-05-unreleased).

Latest shared-engine/CommonMark follow-up (2026-10-05, Unreleased): optional inert
HTML comment retention adds twelve reference-semantic matches (611/652 in a new
opt-in profile), without altering the default 563/652 or container-only 599/652
profiles. The complete gate now passes 2,179 tests / 165 files; 34 new unit cases
cover comment/source/security/clipboard boundaries. The Node/workerd compiled
contracts, 405 public declarations and 85-module no-DOM graph also pass. Final
aggregate sizes are 1533.7 / 1275.6 KiB, bounded at 1534 / 1276; only measured
new-code aggregate allowances changed, not entry/CSS/performance limits. Remote
growth is 11.69x and server HTML growth 9.26x, both below unchanged 15x caps.
An earlier complete run failed the unchanged diagnostic-order assertion; the
implementation now keeps the original order and the test remains unchanged.
The default fallback unit case exposed an absent `innerText` surface and now
safely falls back to `textContent` without overriding explicit text projections.

Recorded browser evidence: twelve scoped regressions pass under
`artifacts/html-comment-and-scope-final-20261005`. A strengthened comment journey
passes three engines under `artifacts/html-comment-keyboard-verified-20261005`,
including actual keyboard typing/copy, click/Backspace removal, undo, safe data
editing, rejection, canonical source and narrow controls. The copy test exposed
author badge text being substituted for an explicitly empty `toText` contract;
the generic clipboard fix preserves the legacy fallback when no contract exists.
The first demo run exposed an ambiguous textarea label, fixed with explicit
label association. A later Firefox instant-fill run retained initial content;
the final journey types through real keyboard events and verifies input/output
convergence before changing options rather than relying on an instant fill.

Eighteen final captures plus videos/traces are retained. Author views and nine
dedicated original/edited/narrow reader images were inspected; the final reader
images match the independently reviewed reader run byte-for-byte. Oversized
whole-workshop captures can contain an off-screen unpainted iframe and a sticky
navigation overlay. They are not used to certify reader rendering: dedicated
captures scroll the real iframe into view and capture its rendered body.
This follow-up does not fix the native Word/font-layout limitations below, and
does not authorize publication or a roadmap percentage increase. See
[the comment/source contract](MARKDOWN_DOCUMENT_FLOW.md).

Latest 2026-10-05 HTML page-settings follow-up: standalone HTML now retains the
validated physical `pageSettings` object as inert body metadata. Both browser
and DOM-free document import restore it. Fragment exports/imports deliberately
do not transfer document settings; malformed/oversized metadata leaves text
intact and is reported by the server importer. This supersedes the earlier
HTML page-settings-loss findings below, not the wider native-layout limitations.

Direct Word paragraph-mark pitch and inherited pitch on empty paragraphs now
produce located `paragraph-mark-spacing-not-imported` warnings. They remain
unsupported caret/empty-line formatting, not silently inherited text styles.
Eight additional regressions cover direct/zero/invalid/foreign/duplicate and
inherited-empty declarations; 24 HTML tests cover complete/sparse settings,
malformed/unsafe inputs, document ownership and clipboard isolation.

The complete serial `pnpm check` passes 2,145 tests / 163 files with 403 public
declarations and the 83-module headless boundary. The new metadata contract also
runs against compiled package exports in real Node 24.19.0 and Cloudflare
workerd, without a fake DOM. An earlier run stopped on a source/package test
typing mistake (fixed); a subsequent run failed the unchanged remote-growth
15x limit at 15.32x. The successful complete rerun measures 10.62x. These are
distinct runs, not one uninterrupted green result; performance limits did not
change. A second complete run after adding the runtime contract passes again,
with the remote-growth ratio at 10.56x. Measured DOCX entries: 168.0 / 136.1 KiB; narrowly bounded at 168.5 /
136.5. Aggregate ESM/CJS: 1530.6 / 1272.7 KiB, ceilings 1531 / 1273. No dependency
or CSS change; editor/framework entry ceilings and performance limits are unchanged.

Three recorded browser journeys pass under
`artifacts/html-page-settings-cross-browser-final-20261005`. Actual HTML and
DOCX exports must both match the ENTIRE edited JSON, with no page-settings
exception or filtered fields. Actual browser HTML import is checked separately
from Node import; reopened text widths/heights stay within 1/64 px. Standalone
HTML is opened and captured too. All 24 source/editor/control/reopened/export
images were inspected, including rechecks of two initially blank-looking
previews: the actual PNG files contain text and are byte-identical to the final
foreground/paint-synchronized captures. There is no reproduced blank-editor
defect here. A new screenshot-pixel assertion rejects truly blank captures;
visibility/focus/text-colour diagnostics, videos and traces are retained. Final
standalone-HTML measurements use the actual rendered text leaf, not an outer
font span; all three engines verify 2 px / 2.66667 px / zero physical pitch. All
24 final PNGs are byte-identical to the reviewed captures. The
normal toolbar's separately recorded three-engine style regression also passes
under `artifacts/character-spacing-main-toolbar-20261005`.

Three final downloads independently load with `python-docx` as the exact edited
text, Arial 12 pt, native signed pitch 30/40/0, Letter dimensions and 72 pt
margins. The documents-skill packaged renderer was retried on the actual WebKit
download and still fails because `soffice.exe` is unavailable. The independent
browser DOCX viewer ignores run pitch; neither structural equality nor its
preview certifies native appearance. The four earlier unknown-font geometry
failures, native layout/kerning, empty-line pitch, CommonMark completion and wider
parity remain open. No publication or percentage promotion.

2026-10-05 character-spacing follow-up: signed Word run pitch now resolves
through defaults, paragraph/character ancestry and direct zero resets into the
validated `letter_spacing` mark. The editor shares apply/remove, mixed-selection,
caret, history and collaboration behavior with the other text-style commands.
Browser/server HTML retain it; the new round-trip test found and fixed Markdown's
text-style importer dropping the newly exported property. Native export retains
physical values and reports rounding, pixel normalization or unsupported relative
units. Kerning and native typography are separate, still-open requirements.

The complete serial `pnpm check` passes 2,113 tests / 161 files, including all
package, framework, API, runtime, reference, headless, size and performance gates.
There are 403 public declarations and 83 modules in the headless boundary.
Thirty-seven additional unit regressions cover the new property and interchange.
Measured DOCX entries are 167.8 / 135.9 KiB ESM/CJS; their narrow ceilings increase
167/135 to 168/136 KiB. Aggregate output is 1529.6 / 1271.9 KiB, with ceilings
1530/1272. No dependencies, CSS or performance limits changed. The first full run
overlapped another build and failed Angular import resolution while `dist` was
being replaced; the later complete serial run passes without that race.

The strengthened recorded browser journey passes in Chromium, Firefox and
WebKit under `artifacts/docx-character-spacing-cross-browser-verified-20261005`.
It uses an independent native-style fixture, real backward selection, invalid
value feedback, apply/remove, Undo, typing, JSON/HTML/DOCX downloads and public
file reopening. Each actual DOCX matches the ENTIRE downloaded edited Fountain
JSON, including page settings; text widths and paragraph heights stay within
1/64 px on editor reopening. HTML matches the complete expected projected tree,
but its physical-page-settings loss remains explicitly reported and visible in
the lab. It is not exact source retention. The earlier strict comparison failures
remain as evidence; no actual attributes or mark order were filtered to hide a
difference. CSSOM serializes explicit zero pitch as `normal`; the test separately
requires the zero declaration and full native/model retention.

All 21 original/imported/edited/control/reopened/exported PNGs were inspected.
On the strengthened final run 19 are byte-identical to those reviewed captures;
the two changed control captures were reviewed again. Three actual downloads
independently load with `python-docx` as the expected three paragraphs, Arial
12 pt, and signed `w:spacing` values 30, 40 and 0. The independent browser viewer
does NOT render run character spacing: its `spacing` branch handles `pPr` only.
Both original and exported preview images therefore omit pitch, unlike the
editor. This is not a native Word oracle. The packaged native renderer was
attempted on an actual download and fails because `soffice.exe` is unavailable.
Native appearance remains uncertified, as do the four earlier unknown-font
geometry failures. CommonMark remains 563 matching / 72 pending / 17 intentional
by default and 599/652 in the optional-container profile. No publication or parity
percentage change.

2026-10-05 WebKit input follow-up: the recorded native event diagnostic proves
that Shift+Enter arrives as `insertParagraph` in WebKit, creating a second
paragraph instead of a hard break. `src/view/input.ts` now carries the unhandled
keyboard intent into the next `beforeinput` event. Plugins still receive both
events first; code blocks retain literal newlines. Intent is consumed once and
cleared on keyup, focus loss, composition start, other input and destruction.
Read-only and stopped custom-node controls are not modified. Sixteen additional
view regressions cover both native input types, marks/history, ordinary and
modified Enter, IME, plugin precedence and stale intent. The existing custom
NodeView test also checks stopped Shift+Enter/input events.

The full `pnpm check` passes 2,076 tests / 160 files, including the package,
framework, API, headless, runtime, reference, size and performance gates. The
browser-only input fix adds approximately 0.6 KiB; aggregate CommonJS measures
1268.5 KiB and its ceiling increases from 1268 to 1269 KiB. ESM, individual
entries, CSS and performance ceilings are unchanged in this input follow-up.

The rebuilt recorded line-break journey passes in Chromium, Firefox and WebKit:
real typing, Undo/Redo, Shift+Enter, HTML/DOCX downloads and public file reopening.
All 18 original/imported/edited/HTML-reopened/DOCX-reopened/export-preview PNGs
were visually inspected. Three actual DOCX downloads independently load with
`python-docx` as one paragraph containing exact `Before\n\nAfter. Reviewed.\nFinal line.`
text and three Courier New 9 pt bold/italic breaks. Evidence lives under
`artifacts/docx-break-cross-browser-20261005`; native event diagnostics, videos,
traces and the original/exported bytes are retained. The independent browser
viewer renders the source's `cr` differently from the normalized exported `br`;
it is not native Word evidence. The packaged native renderer was attempted on
the actual WebKit download and fails because `soffice.exe` is unavailable.
Native appearance therefore remains uncertified. The four unknown-font geometry
failures below remain open; no source fixture, editor CSS or strict assertion was
changed to conceal them. No publication or parity-percentage change.

A separate recorded editor regression run passes all 18 cases across Chromium,
Firefox and WebKit: typing/deleting/history in imported empty documents, quotes
and lists; composition/replacement input; editable code; rich/multiline paste;
repeated visible empty paragraphs and Backspace; quote exit/unwrapping. Videos
and traces live under `artifacts/shift-enter-editor-regression-isolated-20261005`.
The first attempt could not start because port 4173 was occupied; no existing
server was stopped. `playwright.input-audit.config.ts` uses a fresh built package
and isolated port 4194. These focused passes do not supersede the four conversion
geometry failures or certify every editor feature/platform. After strengthening
the one-shot intent and stopped custom-control assertions, all 45 view tests
were rerun successfully.

2026-10-05 line-break follow-up: the recorded audit exposed a genuine run-mark
loss on Word text-wrapping `br`/`cr` import, followed by a separate Shift+Enter
command loss. Both now retain active font/emphasis marks on the break itself,
not just its subsequent text. Explicitly empty stored marks remain empty.
Paragraph-mark font projection also checks breaks with unknown run fonts.
Three pure-Node DOCX regressions and two command/history regressions cover the
boundary. The final full `pnpm check` passes 2,060 tests / 160 files, API checks
across 401 declarations, the 83-module headless boundary, framework/package/
runtime/reference and performance gates. The optional DOCX ESM ceiling increases
166 to 167 KiB and aggregate ESM 1525 to 1526 KiB for measured additional code
around 0.3 KiB; CJS, CSS and performance ceilings are unchanged in this follow-up.

Unknown paragraph fonts are a separate, unresolved fidelity boundary. Native
export now emits the located `paragraph-font-defaulted` warning when a typed
paragraph layout lacks family or size. Generated Word styles fill the gaps;
inline overrides remain but geometry can change. The original three paragraphs
without paragraph font declarations still fail strict physical-height checks
in Chromium and Firefox (first failing difference: 1 CSS pixel). The assertion
remains at 1/64 px; no input or demo CSS was changed to hide it. Diagnostic JSON
and reopened screenshots are now written before that assertion so failures
retain the actual measured difference.

The preceding full 48-journey browser run has 44 passes and four spacing
failures, not an all-green fidelity result. All 21 paragraph-context PNGs from
that run were visually inspected: edited/HTML-reopened/DOCX-reopened geometry
agrees, while original preview handling of empty/paragraph-mark lines and
generated heading colour still differ. Six additional original/edit/reopen
captures from the unknown-font Chromium/Firefox cases were inspected.

The audit configuration now builds the package before starting Vite: demos
consume `dist`, so a source-only command fix otherwise records stale behavior.
Both failed break recordings and the stale-build rerun remain as evidence;
neither establishes behavior of the rebuilt fix. The later three-engine rerun
above verifies the break fix, not native layout equivalence. Native application
appearance remains uncertified, and CommonMark,
native line layout, remaining format support, ecosystem, production and naming
requirements remain open. No publication, version or parity-percentage change.

2026-10-05 paragraph font-context follow-up: paragraphs and image captions now
retain a validated family and physical font size in their portable layout,
separately from inline overrides. Word document/paragraph style defaults and
paragraph-mark font declarations resolve independently from actual text-run
fonts. The importer never guesses a default from the first run. It declines a
paragraph-mark font projection with a located warning when unknown text-run
fonts would otherwise inherit that mark's formatting. Empty paragraphs keep
their known font context. Font/script/theme limits remain explicit; fonts are
not embedded or downloaded.

`src/core/paragraph-layout.ts` owns the generic data/projection/validation;
`src/docx/index.ts` owns the native paragraph/run boundary. Browser and server
HTML import no longer turn known paragraph font projections into inline marks.
HTML export constructs font wrappers in the original mark sequence. Native
export writes defaults on unmarked text, breaks and fields as well as on the
paragraph mark, including plain/rich image captions. The same recorded workflow
exposed imported headings acquiring generated keep flags. Resolved native off
values for keep-with-next, keep-lines and page-break-before now export explicitly.
The independent source was not changed to hide that defect.

The final full `pnpm check` passes 2,055 tests / 160 files, including six new
pure-Node paragraph-font/off-flag regressions and a plain-caption regression;
existing caption, browser/server HTML, history/splitting and Yjs checks include
the new context. API checks retain 401 declaration files; the DOM-free boundary
retains 83 modules. Framework/runtime/reference, package and performance gates
pass. The DOCX/aggregate bundle ceilings increase by 3 KiB per module kind for
the measured implementation growth; unrelated entry/CSS/performance limits are
unchanged. Native rendering was retried on a downloaded context document and
still fails because bundled `soffice.exe` is unavailable. There is no native
certification, publication, version bump or parity-percentage change.

Three targeted recorded workflows pass in Chromium, Firefox and WebKit under
`artifacts/docx-paragraph-font-context-verified-20261005/`: an inherited heading,
mixed-size paragraph, empty paragraph and paragraph mark with different font
from its body. Real typing, Undo/Redo, Enter/Backspace and HTML/DOCX downloading
and reopening retain the tested font context/geometry. Independent `python-docx`
reading of all three actual downloads confirms all 12 paragraph font groups,
explicit off flags and independent 18 pt body text under a 26 pt paragraph mark.
Failure recordings remain: the first run had an over-specific XML child-order
assertion; the next exposed the real generated-heading keep-flag bug.

This is not a native line-layout claim. Word's paragraph mark participates in
per-line layout, while CSS paragraph fonts establish a general line strut.
The independent preview's empty-paragraph/mark handling and normal line metrics
still differ from the editor/export. Generated heading colour defaults can also
affect an otherwise unspecified source colour. Preserve these differences as
open evidence, together with at-least spacing, mixed-font natural metrics,
adjacent paragraph spacing, inherited table styles and native pagination.

2026-10-05 paragraph-default follow-up: Word spacing is now materialized only
after resolving supported document defaults, paragraph-style ancestry and direct
declarations. Never-declared before/after values become zero and line spacing
becomes the portable single-line multiple, instead of inheriting the browser
editor's margins/1.7 line height. Native export writes these effective values
explicitly, preventing its generated Normal stylesheet from adding spacing on
reopen. JSON and DOM-free HTML retain them. Original XML omission and live Word
style bindings are not retained; unsupported automatic/line-unit spacing remains
reported, not promoted to supported fidelity.

This policy follows Microsoft's [OOXML spacing hierarchy and omission rules](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.spacingbetweenlines?view=openxml-3.0.1).
It does not substitute CSS for Word's font-dependent line metrics. Native single
spacing becomes `240/auto`; the current portable multiple projects to numeric
CSS line-height. The independent original preview uses its normal font line box
when the native value is omitted, so original/export line metrics still visibly
differ. A native renderer must adjudicate that next boundary before making a
pixel-equivalence claim. Browser parent font struts, mixed font sizes, at-least
line spacing and adjacent paragraph spacing interactions also remain open.

Six targeted recorded workflows pass in Chromium, Firefox and WebKit under
`artifacts/docx-spacing-defaults-final-20261005/`: omitted spacing without a
stylesheet and partial inherited spacing. They exercise real typing, Undo/Redo,
Enter/Backspace, HTML download/reopen and actual DOCX download/reopen. Document
values and CSS declarations compare exactly; physical paragraph heights allow
at most one 1/64 CSS-pixel layout quantum. All 36 original/editor/edit/HTML-reopen/
DOCX-reopen/export PNGs were inspected. Independent `python-docx` reading of all
six downloaded DOCX files confirms all 18 native before/after/line/rule groups.
The canonical renderer was retried on an actual download and still fails with
`LibreOffice soffice.exe was not found on PATH`. No native certification,
publication, version or roadmap percentage change follows.

The final full `pnpm check` passes 2,048 tests / 159 files, including five new
source-default, cascade, unsupported-property-report and pure-Node JSON/HTML
regressions. API verification retains 401 declaration files and the headless
boundary retains 83 modules. Build, package/runtime/reference/framework checks
and unchanged bundle/performance ceilings pass.

The first broad browser rerun under `artifacts/docx-spacing-defaults-full-20261005/`
passed 42 journeys and failed only the three scientific journeys at an outdated
title-spacing XML assertion (omitted `before` rather than the new explicit zero).
After correcting that expected native declaration, the three unchanged scientific
journeys pass in all engines under `artifacts/docx-spacing-scientific-final-20261005/`.
No runtime change followed the 42 passes. This is 42 broad passes plus three
corrected reruns, not a claim that the first broad suite passed all 45 together.
Its latest Chromium original first page, imported top/table, reopened table and
both exported pages were inspected. That does not imply every wider-suite capture
was visually reviewed. Initial assertion/rounding/click-position failure
recordings remain available.

2026-10-05 default-width follow-up: omitted native `tblW` now becomes an
explicit automatic preference on import, including fixed-layout tables. Fresh
Fountain tables without a preference instead export the standard full-width
policy as 100% of page text width, or a physical grid sum for a complete fixed
grid. Incomplete fixed grids do not establish a whole-table physical width.
Export does not mutate the source document and reports this default projection
as located informational `table-width-defaulted` data. Custom host CSS and
original XML omission are not retained by this effective-preference bridge.

The first recorded rerun exposed a real 2 px discrepancy in every engine:
fresh fixed grids counted the outer table border outside the stored total.
Shared DOM/HTML projection now uses border-box tables and grid ratios when
the whole width follows the grid (including a matching physical preference
after export/reopen). Different explicit preferences keep independent absolute
columns. No lab-only CSS or relaxed geometry assertion was used.

The final full `pnpm check` passes 2,043 tests in 159 files, including eight new
default-policy/grid-projection regressions. API checks retain 401 declaration
files; the headless boundary remains 83 modules. Individual entry, CSS and
performance ceilings remain unchanged. The measured aggregate ESM increment
is about 0.7 KiB (1521.2 KiB total); only its ceiling increases by 1 KiB.

All 12 recorded default-width workflows pass in Chromium, Firefox and WebKit:
omitted Word width, omitted fixed Word width, fresh full-width Fountain tables
and fresh fixed-grid Fountain tables. All 42 original/editor/reopen/export PNGs
were inspected under `artifacts/docx-default-width-final-20261005/`. The fresh
fixed grid stays 300 CSS px before/after editing and reopening; the full-width
case stays at the host extent. Independent `python-docx` reading of all 12 actual
downloads confirms exactly one native width declaration with the intended
automatic, 100% or 225 pt preference.

The subsequent full recorded conversion audit passes all 39 journeys (13 per
engine) on this code under `artifacts/docx-default-width-full-20261005/`. The
unchanged scientific source passes in each engine. Its latest Chromium original
and exported first pages, imported top, imported/reopened table and exported
measurement page were also inspected; the wider suite is not described as a
complete visual inspection of every capture.

This is not a 1:1 appearance claim: paragraph spacing, fresh rounded corners
versus native border projection, cell padding, fonts and page contexts still
differ. The minimal omitted-width source preview has no explicit page geometry;
it is an independent browser preview, not evidence of Word's layout algorithm.
The canonical document renderer was retried on the actual fixed-grid download
and failed because `soffice.exe` is unavailable. Native visual certification,
style inheritance, row-specific widths and full table layout remain open.
No publication, version or roadmap percentage change follows.

Next typography adjudication: the unchanged source's `Normal`, `Title` and
`Heading1` styles explicitly declare Arial and RGB black. Its unstyled heading
run references `Heading1` at the paragraph level, not `Heading1Char`. Fountain
imports black Arial at 16 pt for that heading; the independent original preview
shows blue. Linked `TitleChar`/`Heading1Char` styles still contain blue/theme
declarations. The installed viewer's `renderStyles` implementation appends
linked-style rules after the primary style (`node_modules/.vite/deps/docx-preview.js`
around line 6194). This is a concrete suspected viewer-precedence difference,
not proof that Fountain must turn the heading blue. Microsoft describes the
pair as [independent paragraph/character styles applied according to context](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.linkedstyle?view=openxml-3.0.1).
Adjudicate with native rendering before changing engine or fixture. Theme
colors and live linked-style semantics still need their own supported contract.

2026-10-05 preferred table-width follow-up: optional validated `preferredWidth`
retains direct native physical/percentage/auto/nil declarations independently
of column grid and layout mode. JSON, live transactions/history, Fountain HTML
and DOCX retain the supported preferences. Native export no longer replaces a
stored preference with auto or a fixed-grid sum. Shared cell border-box
projection includes padding/borders inside grid widths. Unsupported lengths,
row exceptions, receiving-schema gaps and rounding receive located reports.

The full `pnpm check` passes 2,035 tests in 159 files, 401 declaration files,
83 headless modules, framework types, package/runtime/reference checks and
unchanged performance ceilings. Twenty-seven new width regressions pass.
Recorded physical and percentage source/edit/Undo/Redo/download/reopen journeys
pass in Chromium, Firefox and WebKit. All 24 captures from these six journeys
were inspected under `artifacts/docx-preferred-width-20261005/`. Physical 360 pt
width remains 480 CSS px; 60% remains 60% of the host content surface before and
after reopening. Independent source/export previews retain the respective
physical/percentage widths. These are bounded preference/geometry checks, not
native layout certification.

The final broader rerun on this preferred-width code passes all 27 recorded
journeys (nine per engine) under `artifacts/docx-preferred-width-full-20261005/`.
Independent `python-docx` reading of the six targeted downloads confirms exactly
one `tblW` with 7200/dxa or 3000/pct as appropriate. The unchanged scientific
fixture passes again, and its latest Chromium table/edit/HTML-reopen/DOCX-reopen
views and exported measurement page were inspected. The table no longer expands
to the entire lab editor; typography and native visual certification remain open.

The source fixture was not repaired to manufacture matching output. Paragraph
defaults, row heights/wrapping and dotted internal border rendering still
differ between the editor and independent preview. CSS percentages refer to
the host surface; Word percentages refer to page text extents. Native grid/
content conflicts may override preferences. Inherited widths/table styles,
row-specific preferences and full native layout still require work. The
canonical renderer was retried on the actual downloaded preferred-width file
and failed because `soffice.exe` is unavailable. No 1:1 or percentage claim,
publication or version change follows from this increment.

The default-width boundary identified at this earlier direct-declaration
checkpoint is addressed by the follow-up above. Effective default-policy
retention does not establish original XML or native appearance fidelity.
Continue with source/export typography, paragraph-default materialization and
the still-open table-style/native-layout requirements, preserving visual gaps.

2026-10-05 direct table-appearance follow-up: optional validated appearance data
now retains direct table/cell borders and physical padding, including explicit
zero and distinct `none`/`nil` declarations. JSON, browser/server HTML and DOCX
carry the same supported data. Importing the unchanged borderless fixed-table
source no longer adds Fountain's grid or padding. Fresh Fountain tables retain
their existing defaults. Parent-only changes refresh reused cell views through
the existing post-reconciliation hook; no engine redesign was needed.

The full `pnpm check` passes 2,008 tests in 157 files, 399 public declarations,
package/runtime/headless checks, reference gates, measured performance and
build budgets, and framework type checks. Twenty-five focused regressions cover
validation, JSON/HTML retention, logical spans, parent-only refresh/history,
table commands, native property order, rounding, schema gaps, namespaces and
distinct merge-fragment reports. Both the fixed-table regression and a new
independent direct-appearance fixture pass recorded edit/undo/export/reopen
workflows in Chromium, Firefox and WebKit (six browser tests).

The broader audit caught three real-file failures: the unchanged scientific
source contains three identical border groups on a merged cell. Import now
coalesces identical declarations with a located warning; conflicting appearance
declarations omit only the ambiguous property rather than discarding the file.
The scientific workflow subsequently passed in all three engines. All original
and exported scientific pages and the imported, HTML-reopened and DOCX-reopened
table views were visually inspected across those engines. Fonts, heading colors
and spacing still differ; the source fixture and independent previews were not
altered to hide those differences.

The final broader rerun on that appearance checkpoint passed all 24 recorded
workflows (eight journeys across Chromium, Firefox and WebKit), with evidence in
`artifacts/docx-appearance-final-20261005/`. Subsequent preferred-width work is
tracked separately below; this result does not certify later code changes.

All 24 captured source, edited, reopened and exported images were inspected.
Evidence is retained under `artifacts/docx-table-appearance-20261005/`. The
earlier source was not changed, and no lab-only styling or preview repair was
used to conceal differences. Independent `python-docx` reading of all three
appearance downloads confirms six border declarations, zero table top margin,
table-side lengths and the cell-specific `nil`/2 pt margin override. These checks
are structural evidence, not native layout certification. The canonical renderer
was run against the actual downloaded DOCX and again failed because `soffice.exe`
is unavailable.

The source/export previews still differ from the live editor: dotted internal
borders are not projected the same way, automatic table width changes with text,
and paragraph-default materialization changes spacing on reopen. The fixed-table
preview still clips long content due to its recorded layout-attribute bug.
Table-style inheritance/conditional rules, row exceptions, logical/diagonal
borders, implicit native margins, full border-conflict rules, merge-fragment
geometry and preferred-width policies remain open. Detectable unsupported
properties receive located reports. No full fidelity or percentage claim changes.

2026-10-05 fixed-table follow-up: the explicit fixed/automatic table mode now
survives portable JSON, browser/server HTML and DOCX. The fixed view derives
HTML columns from logical cell widths and keeps them stable during long-text
typing, column resizing and Undo/Redo. DOCX export writes `tblLayout` and the
fixed preferred width. Invalid layout values, row exceptions and receiving
schemas without the attribute produce located warnings.

All 1,983 tests in 155 files and the full `pnpm check` pass. The public-lab
fixed-table journey passes in Chromium, Firefox and WebKit; edited/reopened
screenshots were inspected. Independent `python-docx` reading of the downloaded
file confirms fixed layout and 120/180 pt columns. This is the seventeenth
recorded journey, with a remaining native visual acceptance gap.

Evidence is retained under
`artifacts/docx-paragraph-layout-20260912/conversion-real-document-a-950ac-nt-and-reopening-the-export-{chromium,firefox,webkit}/`.
The independent preview expands the long-content export because its
`valueOfTblLayout` implementation reads `w:val` instead of native `w:type`.
The original/export previews were kept unchanged, including the failure.
`fixed-table-native-verification-pending.json` explicitly records the gap;
neither the browser workflow nor correct XML is used to certify native layout.
The skill renderer failed with `LibreOffice soffice.exe was not found on PATH`.
Source/editor/reopen wrapping also differs when source font defaults are absent
and exporter defaults become materialized. Neither typography defaults nor
native Word/LibreOffice visual fidelity is declared closed here.

The 2026-10-05 follow-up reports incomplete fixed grids on import and each
defaulted fixed-column width on export. It also fixes a direct repeated-header
bug: `tblHeader` with `0`, `false` or `off` was incorrectly creating header cells,
which could introduce header fill and repeat declarations on subsequent export.
Direct enabled values retain the existing projection; invalid values warn at the
row path, foreign namespace lookalikes are not trusted, and duplicate declarations
are rejected. Nine new regressions cover these cases without a DOM. This does
not yet separate semantic header cells from native repeat-on-print roles or
establish inherited/conditional and multi-page table header fidelity.

The expanded seventeenth journey passes in all three desktop engines. Its
unchanged earlier evidence remains separate; the new recordings, source/export
files, screenshots and traces are under `artifacts/docx-table-header-20261005/`.
Every captured original, edited, reopened and exported page was inspected in
Chromium, Firefox and WebKit. The editor/reopened columns stay stable and the
disabled row stays ordinary. The raw independent export preview still clips
the long content, and export materializes font, border and cell-margin defaults
which the source did not declare. Independent `python-docx` reading confirms
fixed mode, 120/180 pt columns and no invented repeated-header declarations.
The canonical skill renderer was retried on this actual download and again
failed because `soffice.exe` is unavailable. No native visual acceptance claim.

2026-10-05 caption follow-up: supported image captions retain their independent
alignment and portable paragraph layout instead of inheriting an invented
centred/italic Word Caption appearance. `captionAlign` and `captionLayout`
survive JSON, DOCX and browser/server HTML. The recorded caption journey covers
direct typing, bold runs, hyperlinks, downloaded DOCX and reopen in Chromium,
Firefox and WebKit. Its source, editor and exported pages were inspected.
Blank space on the caption line remains clickable for editing; inline atoms
inside other editable regions retain their own node selection. Native Word
layout certification, caption fields and arbitrary caption block content remain
outside this verified increment.

The final `pnpm check` passes all 1,966 unit tests in 154 files, public API and
package checks, DOM-free server checks, reference/conformance gates, measured
performance budgets, TypeScript and framework type checks. The new caption
workflow adds a sixteenth recorded journey to the earlier fifteen; it passes
in all three desktop engines. Native Word/LibreOffice visual certification is
still required before claiming exact application rendering.

2026-09-12, local Unreleased work on top of `204186b`.

The [independent source audit](CONVERSION_REAL_DOCUMENT_AUDIT.md) remains the
baseline. This follow-up fixes table readability, improves omission reporting,
and adds native footnote and single-section header/footer interchange;
it does not establish full DOCX fidelity or complete the format-bridge plan.

## Table readability

`src/docx/index.ts` reads direct RGB shading, including cell-over-row-over-table
precedence, explicit `nil`, and solid foreground fills. Export carries supported
cell fills into merged continuation cells. Theme references and pattern fills
produce warnings while retaining an available explicit RGB fallback.

`src/core/table-background.ts` normalizes safe opaque RGB values. Shared cell
attributes, DOM NodeViews, HTML export and browser/server HTML import now carry
the background. Table command reconstruction preserves it. Header conversion,
undo and width/background updates have model and DOM regressions.

An expanded whole-document HTML test caught a second defect: both HTML importers
were copying the cell fill into a text-highlight mark. The fill now belongs only
to the cell; genuine nested highlights remain intact. The simple shaded-table
fixture retains exact Fountain JSON through both HTML importers. Independent
text-color/highlight combinations retain their full mark sets, but equivalent
HTML nesting can reorder mark arrays; this is not an exact mark-order guarantee.

Recorded cooling-report workflows passed Chromium, Firefox and WebKit. Inspected
editor and exported DOCX-viewer screenshots show readable white labels on dark
blue headings and retained alternating row fills. Actual typing and undo were
checked, not just attribute presence. This includes export/download/reopen.

Initial shading evidence: `artifacts/conversion-shading-20260912/` and
`artifacts/conversion-shading-{unit,journey,build}.log`. Each browser directory
contains `imported-table.png`, `exported-page-1.png`, `video.webm`, `trace.zip`,
the downloaded DOCX and reports. The independent viewer is docx-preview, not
Microsoft Word. It renders this export as one long section; that is not a native
page-count result. Native Word/LibreOffice verification remains unavailable.

## Intake and lab reporting

The importer inventories archive entries without interpreting skipped parts and
distinguishes successfully imported image assets from unrepresented media. It
locates omitted stories using document relationships and conventional package
names, and reports missing body note markers. The original remains the only
retained copy of omitted content. It does not decode arbitrary unsupported assets,
recover headers/notes at that checkpoint, inventory every semantic feature, or
prove exact retention. The subsequent native-footnote work is described below.

The conversion lab exposes this inventory and source locations. A successful
current-draft round trip keeps the original-import finding count and an explicit
independent-visual-verification limitation beside its result. Diagnostic report
version 2 includes package handling/counts; package paths require the existing
content opt-in. Existing warnings may still contain source fragments and must be
reviewed before sharing. No data is uploaded automatically.

Final intake checkpoint: **1,774 tests in 138 files pass**, full package build,
production website build and TypeScript pass, and **three recorded browser workflows pass**. The workflows
verify 2 imported media files and 1 unrepresented media file in the independent
fixture, located header/footnote warnings, retained table shading, editing/undo,
actual export/reopen, and both privacy-default and content-opted-in reports.
They also reopen HTML and check that shaded cells did not acquire spurious text
highlights (`html-reopened-table.png`). The website build retains a chunk-size
warning; this checkpoint does not claim that production bundle budgets are closed.
Evidence: `artifacts/conversion-intake-20260912/` and
`artifacts/conversion-intake-{unit,journey,types,build}.log`.

Regression entry points: `tests/docx-package-inventory.test.ts`,
`tests/docx-cell-shading.test.ts`, `tests/table-background.test.ts`,
`tests/conversion-lab.test.ts`, and the recorded independent fixture journey in
`tests/manual/conversion-real-document-audit.spec.ts`. Reproduce the latest local
journey after `pnpm build` with
`pnpm exec playwright test -c playwright.conversion-audit.config.ts`.
It starts its own server on port 4193, leaving existing lab drafts untouched.
The independent fixture must exist first; its builder/footnote procedure is in
the original audit. Missing fixtures cause an explicit skip, not a fidelity pass.

## Native footnote follow-up

FB-03 has a verified local footnote slice, not full story/layout coverage.
The DOCX adapter now reads the native footnotes relationship and part, preserving
linked reference IDs and rich editable definitions in the existing Pages model.
The lab now composes Pages into import, editing and read-only preview schemas.
Insert/edit/remove controls expose the existing engine commands without a core
redesign. Export uses native note XML, markers, separators and relationships.

The independently authored fixture initially failed: its helper omitted explicit
separator types. Recognition now requires the reserved ID plus the actual native
separator element, reports the recovery, and writes explicit types on export.
Malformed ordinary IDs and duplicate definitions remain rejected. Missing note
references are visible placeholders; orphan note text is retained and reported.

**1,788 tests / 139 files pass**, including 11 pure-Node footnote tests and three
additional lab round-trip tests. TypeScript, the full package build and production
website build pass. The existing large website chunk warning remains.

**Three recorded journeys pass**: Chromium 12.9s, Firefox 13.5s, WebKit 16.3s.
They exercise direct note editing, undo/redo, removal of reference and definition,
undo restoration, insertion/editing/removal of another note, actual download,
DOCX reopening, HTML table regression checks and diagnostic-report privacy.
The independent DOCX viewer shows the exported numbered marker and edited note.
Editor note screenshots and the exported full page were visually inspected in
all three engines. Body image hashes still match the original and the export.

Evidence: `artifacts/docx-footnotes-20260912/`, plus
`artifacts/docx-footnotes-{full-unit,journey,types,build,site-build}.log`.
Each browser has video, trace, `edited-footnote.png`, `footnote-controls.png`,
the independently rendered original/exported pages, downloaded DOCX and reports.
The Chromium directory also has `structure-check.json`: one native reference and
the note part survive, and the two original body-image hashes remain identical.
Source SHA-256 remains
`52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495`.

The real workflow correctly reports **non-equal Fountain JSON**: after editing,
the trailing editable paragraph can follow a definition, while DOCX stores notes
in a separate story and reimport appends definitions after body blocks. The
`footnote-definition-position-normalized` finding explains that change; the lab
does not relabel this as exact equality. The note text and native reference remain.

This is independent browser-viewer evidence, not Microsoft Word/LibreOffice
layout certification. The workspace dependency bundle has no LibreOffice renderer;
native page layout verification remains open. Source note fonts, custom numbering,
endnotes, and full rich-note combinations need wider coverage. A dimensions-free
note-image fixture exposed existing fixed default export sizes; explicit dimensions
round-trip, but automatic-size preservation remains an open image defect.

## Header and footer follow-up

FB-03 now also has a local single-section template bridge. Default/active-first/
active-even header/footer parts become the existing editable Pages templates,
using part-local raster image and hyperlink relationships. The lab has explicit
buttons for editing each template. Native export writes section references,
template parts, relationships, content types and variant switches.

The independently authored cooling report now retains its header-logo bytes,
header text, footer text and simple PAGE field structure. All three raster assets
are represented; the inventory reports zero unrepresented media for this fixture.
This is an asset count, not zero document loss: native equations and original
styles/page setup still do not survive. The source is unchanged.

**1,796 tests / 140 files pass**, including eight new pure-Node template tests.
TypeScript, full package build and production website build pass; the existing
large-chunk warning remains. **Three recorded journeys pass**: Chromium 17.8s,
Firefox 18.6s and WebKit 21.3s. They check the recovered logo, direct header text
editing with undo/redo, footer editing and preserved page-field node, real export
download/reopen, plus the existing footnote and shaded-table workflows.

Editor header/footer screenshots and the independent exported page were visually
inspected for all three engines. The logo and edited text are visible without
overlap. The browser DOCX viewer leaves the dynamic page number blank, so page
field *structure* is verified but displayed page-number fidelity remains open.
Export warns that recalculation is required. There is still no native Word or
bundled LibreOffice layout certification, and the one long viewer section is not
proof of native pagination.

Evidence: `artifacts/docx-templates-20260912/` and
`artifacts/docx-templates-{full-unit,journey,types,build,site-build,structure}.log`.
Each browser has videos, traces, `edited-header.png`, `edited-footer.png`, original
and exported page renders, actual exported DOCX and privacy-aware reports.
Chromium `structure-check.json` confirms the original header-logo hash occurs in
the export and both body-image hashes are still identical.

Multi-section inheritance, inactive-template source retention in the converted
document, complex field conversion/evaluation, original header/footer style and
geometry, and a wider source-producer corpus remain open. Import does not flatten
multiple section-specific templates into one misleading global set. No release
or full-format fidelity claim is made by this checkpoint.

## Explicit page-break follow-up

The fixture's explicit `w:br w:type="page"` now becomes the existing Pages
`page_break` node instead of an ordinary line break. DOCX export writes a native
page break again. A standalone break does not create an extra empty paragraph;
leading, trailing and repeated breaks retain their order. Mixed inline breaks
split a source paragraph into Fountain blocks and report that normalization.

The conversion lab supplies insertion and selection controls, a dashed boundary,
and instructions for keyboard deletion. Recorded use selects and deletes the
imported boundary, undoes/redoes that deletion, inserts a second boundary, removes
it with Backspace, exports the actual file and reopens it. The same operations
pass in Chromium (17.1s), Firefox (19.7s) and WebKit (39.7s).

**1,807 tests / 141 files pass**, including eleven new pure-Node page-break cases.
TypeScript, full package build and production website build pass. The existing
large-chunk build warning remains. The source hash is unchanged; independent
package inspection finds one explicit break in both source and export, and all
three unchanged image hashes still survive.

The original and exported documents now each have two sections/pages in the
independent browser DOCX viewer, with “Model and measurements” starting the
second. Selected-boundary screenshots and every exported page were visually
inspected in all three engines; both original Chromium pages were inspected as
the comparison reference. The header logo repeats on both exported pages.
This is explicit-break evidence, **not automatic pagination fidelity**: the
viewer can grow a page beyond its paper height, and does not certify native Word
layout. The package bundle still has no LibreOffice renderer. Equations remain
visible unsupported placeholders, heading sizes and title styles differ, the
source Letter/custom margins still become A4/one-inch defaults, and dynamic page
numbers are blank in this viewer. These remain failures to resolve, not a pass.

`pageBreakBefore`, style-inherited breaks, column breaks, float-clearing rules,
nested list/quote identity after export, table/story pagination and Word
compatibility flags need further work. Direct paragraph break-before and column/
clear losses now have explicit warnings. Without a schema `page_break` node,
import retains a visible `[Page break]` marker and reports the lost behaviour.

Evidence: `artifacts/docx-breaks-20260912/` and
`artifacts/docx-breaks-{full-unit,journey,types,build,site-build,structure}.log`.
Paper geometry and paragraph-layout properties are the next FB-04 boundary; this
does not close FB-04 or authorize a release.

## Physical page-settings follow-up — 2026-09-12

The source Letter size (612 x 792 pt), top/bottom margins (51.85 pt), side
margins (57.6 pt), header/footer distances (36 pt) and zero gutter now survive
import, ordinary editing, DOCX export and reopening. The values live in validated
`doc.attrs.pageSettings`, independent of DOM or Word XML. The lab exposes a
collapsible form with transaction-backed Apply/Undo/Redo. Missing values remain
unspecified until export; default insertion and sub-twip rounding are reported.
Multiple sections and recognized unsupported layout modes are not silently
claimed as a single faithfully rendered layout.

All **1,826 tests / 142 files pass**, including 19 pure-Node settings cases.
TypeScript/framework checks, headless boundary (66 modules), and the production
site build pass. The pre-existing large-chunk site warning remains. Three
recorded Chromium/Firefox/WebKit journeys pass: change top margin to 60 pt,
undo/redo, download and verify native XML says 1200 twips, restore the original,
edit content, export and reopen. Independent package inspection confirms exact
source size/margin values and all three unchanged image hashes in every export.

Every exported page in the three engines and both original Chromium pages were
visually inspected, along with the settings controls. The independent DOCX
viewer's declared paper size and padding now match the source on both pages.
This is **not fixed-height or automatic pagination certification**: page two
still grows beyond its paper height. Original title/font/caption styling and
table widths differ, native equations remain visible unsupported placeholders,
and dynamic page numbers are blank in this viewer. No native Word/LibreOffice
render was available. These observations remain active fidelity failures.

Evidence: `artifacts/docx-settings-20260912/` (videos, traces, page screenshots,
changed-margin and main exports, reports and package inspections), plus
`artifacts/docx-settings-{full-unit,journey,types,headless,site-build,structure}.log`.
Next FB-04 work is original paragraph/run styles and layout properties, followed
by multi-section layout. Native OMML ingestion remains FB-05. No release or new
parity percentage is implied.

## Explicit run-font follow-up — 2026-09-12

Direct Word font families and sizes were another missing boundary: `runMarks`
ignored `rFonts`/`sz`, and export treated Fountain's existing font marks as
unsupported. They now map to/from validated `font_family` and `font_size` marks.
This is an editable model representation, not embedded source XML or demo CSS.
Named Latin faces and physical half-point sizes survive; pixel sizes normalize
to points with a report. Relative sizes, generic/fallback stacks, invalid values,
missing schema marks, unresolved theme fonts and script-specific choices are
reported rather than guessed. Font embedding and inherited styles are not added.

**1,841 tests / 143 files pass**, including 15 pure-Node font cases. Package and
site builds, framework type checks and the unchanged 393-file public API surface
pass. Six recorded journeys pass (font workflow plus the unchanged scientific
fixture in Chromium, Firefox and WebKit). The focused source has a 24 pt Times
New Roman heading and 12.5 pt Courier New prose; typing, Undo/Redo, export and
reopening preserve the actual font marks and computed CSS. The original and
exported font pages were visually inspected in all engines, along with editor
views. Native Word/LibreOffice layout is still unverified.

The initial font fixture accidentally retained an orphan note part from the
scientific package. Export correctly refused it. The fixture was made a separate
self-contained package and all six journeys were rerun successfully; no orphan
validation was relaxed. The original cooling report bytes remain unchanged.
All six scientific exported pages were visually inspected again: its title/style,
math, table-width and automatic page-flow defects remain. This is a prerequisite
for the style cascade, not a fix for inherited title/heading appearance.

Evidence: `artifacts/docx-fonts-20260912/` and
`artifacts/docx-fonts-{full-unit,journey,build,types,site-build,api,structure}.log`.
The next style-resolution contract is recorded in `FORMAT_BRIDGE_PLAN.md`.

## Internal style-cascade groundwork — 2026-09-12

Added a DOM-free internal resolver for normalized Word run styles, with owned
immutable definitions, bounded/cached ancestry, explicit direct overrides and
independent script-font slots. A focused adversarial test caught inherited
prototype containers being read as declarations; that bug was fixed. All **1,867
tests / 144 files pass**, including 26 new cascade cases. TypeScript and the
normal package/Angular build pass; the public API matches its existing snapshot
across 393 declaration files. Checking raw declarations before the build's
specifier-preparation step initially produced a mismatch; the normal build
resolved it without changing the snapshot.

This resolver is not connected to `importDOCX` or the conversion lab yet. There
is no new visual-fidelity claim or browser recording for this internal-only
change. Source style/theme decoding, editable reset representation, paragraph
layout and the Word-specific default-true toggle case remain open. The latter
returns an explicit unresolved value instead of guessing. The unchanged cooling
report still needs its title/heading appearance fixed and independently checked.
See the concrete integration sequence in [the bridge plan](FORMAT_BRIDGE_PLAN.md).

## Direct theme-font follow-up — 2026-09-12

The live importer now resolves direct Latin theme-font references from embedded
major/minor regional defaults, through validated package relationships and the
existing expansion/XML limits. The resulting named face lives in `font_family`
and exports as native run formatting. `theme-font-materialized` explicitly reports
that the live Word theme binding is not retained. Missing, external, invalid and
language-dependent theme selections remain errors or reported fallbacks; no fonts
are embedded or fetched. At this theme-font checkpoint the internal style cascade
still awaited `styles.xml` decoding and editable reset integration; the subsequent
XML-reader checkpoint below addresses decoding only.

All **1,882 tests / 145 files pass**, including 15 new pure-Node theme cases.
TypeScript, normal package/Angular build and the existing 393-file API snapshot
pass. Nine recorded final journeys pass: direct-font, theme-font and unchanged
scientific-document workflows in Chromium, Firefox and WebKit. They exercise
typing, Undo/Redo, export and reopening. All original/exported font pages and all
six scientific export pages were visually inspected, along with reopened theme
editor views and the original scientific source. The two font families and sizes
remain visible and correct within these browser checks.

The focused editor has wider paragraph spacing than the original/exported page;
this is still a layout gap, not a font-fidelity pass for the entire document.
The scientific title/heading, native-math, table-width and automatic-page-flow
defects remain. Native Word/LibreOffice layout is still unverified because the
bundled runtime has no LibreOffice renderer. The source fixture remains unchanged.

The final report-only review found that a rejected unsafe face could initially
receive a misleading successful-materialization message. That message now emits
only after the named-font mark is accepted. The full suite and all nine journeys
were rerun after the fix; the earlier recordings are not the final-build evidence.
Final evidence: `artifacts/docx-themes-final-20260912/`, plus
`artifacts/docx-themes-final-{build,unit,journey,structure-chromium,structure-firefox,structure-webkit}.log`.
The Documents render-and-inspect workflow guided the independent visual audit;
these are QA fixtures, not new publication documents.

## Internal Word style XML reader

The shared DOCX XML parser now feeds `src/docx/style-reader.ts`, which decodes
document run defaults and paragraph/character styles into the bounded cascade.
It validates expanded namespace identities, rejects ambiguous definitions,
retains explicit reset values and reports unsupported declarations. It is **not
yet connected to public import or the editor**. The new tests do not establish
that titles, paragraph spacing or other inherited formatting look right.

Final verification: **1,903 tests / 146 files pass**, including 21 XML-reader
cases. TypeScript, normal package/Angular build and the existing 393-file API
snapshot pass. Logs: `artifacts/docx-style-reader-final-{unit,build}.log`.
The read-only source audit in `artifacts/docx-style-reader-source.json` decoded
63 paragraph/character styles without a DOM and confirmed `Normal -> Title`
resolves to 50 half-points (25 pt), with major theme font references. The source
hash and bytes remain unchanged. Unsupported-declaration counts cover the whole
style library, not just styles used by visible content, and are not loss counts.

No new browser/visual fidelity claim is made for this internal checkpoint. The
earlier recorded journeys remain evidence for the earlier live importer. Next:
relationship-owned style-part loading, effective editable formatting (including
explicit off values), export/undo consistency and fresh visual comparisons.

## Editable explicit emphasis checkpoint

Paragraphs and headings can now carry `emphasis: 'explicit'`: their block view
does not add bold or italics, while inline strong/emphasis marks remain editable.
HTML interchange, block conversion, Enter, history and Yjs preserve this mode.
DOCX writes absolute run and paragraph-mark resets and recognizes complete
direct-reset paragraphs on import. Partial Word overrides still need inheritance
resolution; this is a prerequisite, not a completed styles.xml integration.
Unset optional schema attributes are omitted so ordinary JSON/Yjs documents keep
their existing shape. Markdown reports that the explicit block default is lost.

Verification: **1,915 tests / 148 files pass**, plus TypeScript, the normal build
and the 393-file API snapshot. The full unit suite was rerun without browser
concurrency after the node lookup timing check exceeded its unchanged 1.5-second
limit during a concurrent run. All **12 recorded journeys pass** across Chromium,
Firefox and WebKit. The new journey uses backward keyboard selection, toolbar
bold, undo/redo, Enter, typing, DOCX export and public file reopening.

The new mixed-mark fixture also exposed DOCX mark-order normalization: the lab
correctly reports different JSON. The audit compares the complete trees with
only the fixture's known non-conflicting mark arrays sorted, and saves both the
exact mismatch and that qualified comparison. This is not an exact-JSON pass.

Every final exported font page, emphasis page and scientific page was visually
inspected, along with reopened emphasis editor views and the scientific source.
Normal-weight headings, upright quotes and positive bold/italic marks survive.
Paragraph spacing and quote indentation still differ between editor and export.
The scientific source still loses title/heading styling and native equations;
table width and page flow differ too. Native Word/LibreOffice certification is
still absent; these are independent browser-viewer checks.

Evidence: `artifacts/docx-emphasis-final-20260912/`,
`artifacts/docx-emphasis-final-journey.log`, and
`artifacts/docx-emphasis-serial-unit.log`. No release or broader parity claim.

## Public inherited run styles checkpoint

The public importer now loads relationship-owned style definitions and resolves
document run defaults, paragraph ancestry, character ancestry and absolute direct
formatting. `style-projection.ts` feeds resolved declarations into the existing
safe font/mark projection without rewriting the original document. It retains
same-declaration font fallbacks and reports unresolved used-style properties.
Style libraries and live bindings are not retained as editable Word style objects.

All **1,923 tests / 149 files pass**, including eight public inherited-style
cases. TypeScript, normal package/Angular build and the 393-file API surface pass.
All **12 recorded journeys pass** on Chromium, Firefox and WebKit. Every exported
font, emphasis and scientific page was visually inspected. The scientific editor
and export now show the source XML's **25 pt title and 16 pt headings**, replacing
the earlier 11 pt title and unrelated oversized heading. The source hash is
unchanged. Native Word/LibreOffice rendering remains unverified.

The initial regression run exposed old assumptions that Word defaults remained
absent after reimport. Expected complete trees now explicitly include the known
exporter defaults; actual trees are not stripped of formatting or other fields.
Previously implicit fonts, sizes and colours can now become materialized marks.
This is not exact source JSON retention. The earlier mixed-mark ordering report
remains visible rather than being suppressed.

The visual review still shows different spacing, heading letter spacing, lost
title border, narrower tables and flattened/restyled image captions. Both native
equations remain visible unsupported placeholders. Page flow and native field
rendering remain open. These are next work items, not a document-wide fidelity pass.

Evidence: `artifacts/docx-inherited-20260912/`,
`artifacts/docx-inherited-second-unit.log`, `artifacts/docx-inherited-build.log`,
and `artifacts/docx-inherited-journey.log`. No release or parity percentage change.

## Paragraph layout follow-up — 2026-09-12

The supported effective paragraph-style subset now becomes validated Fountain
block data and returns to native DOCX: spacing before/after, automatic/exact/
at-least line rules, logical start/end and first-line/hanging indents,
keep-with-next, keep-lines, page-break-before, explicit RGB shading and supported
solid borders. Paragraphs, headings and code blocks carry the same neutral value;
HTML retains it and Markdown reports the presentation boundary. Block conversion
and splitting preserve it.

The unchanged cooling report remains byte-identical at source SHA-256
`52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495`.
The recorded journey asserts the exact 1 pt title border in model data, visible
paint in each engine, title/heading spacing, heading keep behaviour, list
indentation and the existing manual page break. It performs real editing,
Undo/Redo, DOCX download and reopening. Exporter defaults are represented in the
expected complete tree rather than deleted from actual results to obtain equality.

All **1,931 tests / 151 files pass**. All **12 recorded journeys pass** across
Chromium, Firefox and WebKit. Original and exported two-page views and the
imported/reopened editor views were visually inspected for each engine. That
inspection found a host-page selector leaking negative letter spacing into
imported headings even though model assertions passed; the selector was scoped,
default editor heading tracking was normalized, and a regression assertion now
guards the visual boundary. Modern/legacy CSS break aliases are both projected
because engines expose equivalent keep semantics differently; typed model data is
the source of truth.

Evidence: `artifacts/docx-paragraph-layout-20260912/`,
`tests/docx-paragraph-layout.test.ts`, `tests/paragraph-layout.test.ts`, and
`tests/manual/conversion-real-document-audit.spec.ts`.

This is not whole-document visual parity. At this paragraph-layout checkpoint,
native equations still reopened as placeholders; the later equation checkpoint
below supersedes that result for its bounded subset. Table row/layout details and rich caption
structure still differ, character spacing/kerning is not represented, and no
native Word/LibreOffice renderer certified layout. Multi-section geometry and
conditional/table styles also remain open. No release or parity percentage is
implied.

## Table column geometry follow-up — 2026-09-12

The independent source's three 3312-twip columns now import as three 221 px
platform-neutral column widths. The merged heading retains all three widths;
ordinary cells retain their individual width. Export writes a native three-column
grid and matching preferred widths for cells and spans, and reopening the actual
downloaded DOCX restores the same Fountain geometry.

All **1,937 tests / 152 files pass**, including dedicated no-DOM tests for
spans, deterministic conflicts, rounding, ambiguous inputs and fixed-layout
reporting. All **12 recorded journeys pass** across Chromium, Firefox and WebKit.
The unchanged original, editable table, exported pages and reopened tables were
visually inspected in all three engines. The independent viewer measured the
same overall source/export table width; auto-fit redistributed less than 0.5% of
that width in each column after the document edit and format materialization.

This is a column-geometry bridge, not whole-table layout parity. Fountain does
not yet model Word fixed/auto layout mode, row height, table positioning,
percentage/preferred table width, conditional styles, complete borders or native
pagination. Fixed layout is reported as unsupported while its grid is retained;
exports remain auto-layout rather than silently inventing stricter semantics.
The 2026-10-05 fixed-table checkpoint at the top supersedes this older layout-mode
limitation. The native-equation checkpoint below supersedes the older unsupported
equation statement for the documented bounded OMML subset.

## Still open

FB-01 still needs wider border/style/theme fidelity. FB-02 still
needs deeper semantic coverage and useful recovery of omitted data. FB-03/04/05
remain open for broader notes/section templates and fields, remaining style/page-layout preservation and broader
OMML coverage. FB-06 now distinguishes the claims more clearly but still lacks
independent original-format comparison inside the public lab. Both body images
survive the existing fixture; its footnote, header logo and header/footer text now
survive too. Complete Office Math, title character spacing/kerning and multi-section
page layout are not fixed by these checkpoints. No release or parity claim is
authorized by the narrower passing tests.

## Bounded native-equation follow-up — 2026-09-12

Supported native Word equations no longer become placeholders. The no-DOM OMML
parser accepts the documented run/style, row, fraction, radical, script,
delimiter, n-ary, rectangular-matrix, combining-accent, function-application,
upper/lower-limit and equation-array subset. It creates a real inline/display
math node with generated editable TeX and a validated
platform-neutral `MathExpression` attribute. DOCX export prefers that retained
tree directly; it does not reinterpret its own generated TeX through MathJax.

Changing the TeX source clears the retained expression in the same history-aware
transaction, and Undo restores both. Fountain JSON and browser/server HTML retain
the expression; Markdown emits TeX and an explicit semantic-loss report. The
validator rejects unknown properties, invalid geometry/symbols, cycles, excessive
depth/nodes and oversized interchange input. Unsupported or foreign OMML still
becomes a visible placeholder with a located warning rather than misleading
flattened text.

Verification: **1,965 tests / 154 files pass**, including direct native
DOCX→Fountain→DOCX export without a resolver, exact-source metadata restoration,
edit/Undo invalidation, HTML/server round trips and adversarial limits. The
reviewed public API snapshot contains 397 declaration files. All **15 recorded
real-document workflows pass** across Chromium, Firefox and WebKit. The journey
asserts two rendered KaTeX equations in the imported and reopened editors, two
native OMML display equations in the actual downloaded DOCX, and two equations
in the independent viewer. Source, editor, reopened-editor and exported-page
screenshots were visually inspected; subscript, superscript and fraction
structure remain visible.

An additional four-equation DOCX verifies function application, lower and upper
limits, and equation arrays through public-lab import, KaTeX rendering, native
OMML export and reopen in all three engines. `docx-preview` omits the upper-limit
glyph arrangement from both the original and exported fixture even though each
contains `m:limUpp`; Fountain renders it on both editor passes. That is recorded
as independent-viewer disagreement, not hidden as export success.

This evidence does not certify every Office Math construct, exact original OMML
styling/source, Word's equation numbering/references, or a native Word/LibreOffice
edit/save cycle. `docx-preview` remains an independent browser viewer with known
math/layout limits. These gaps remain open and are not hidden by the supported
subset.
