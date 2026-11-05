# Native selection and deferred toolbar focus

Unreleased follow-up, 2026-11-05. This supersedes the broad focus-restoration
claim in the [structural formatting checkpoint](STRUCTURAL_FORMATTING_AUDIT.md).
It does not certify complete editor parity or authorize a release.

Subsequent CI passed 894 cases in the remaining browser matrix and exposed
three failures in the same table-resize journey. The
[table resize follow-up](TABLE_RESIZE_RETENTION_AUDIT.md) records the owning
selection/attribute-map boundaries and their verified repairs; the earlier
checkpoint below remains historical evidence.

## Failure and boundary

The fresh browser job for commit
`8a9c51f650317b8598356badaa452faec6568ec7` failed 63 cases and passed 834:
[CI run](https://github.com/eddolo/fountainjs/actions/runs/41972730191/job/127064457020).
The earlier targeted checks did not establish full-suite safety. Unconditionally
restoring the model selection after raw host focus overwrote a fresh native
placement, affecting composition, reverse selection, page-shell editing and
toolbar workflows.

`src/view/view.ts` now requests focus restoration only for an explicit local
transaction selection committed while an external control owns focus. Remote
collaboration updates and ordinary model mapping do not create that intent.

`src/view/selection-handler.ts` keeps this pending focus intent separate from
the short-lived model-to-DOM synchronization guard. A pointer placement cancels
the old focus intent. An applied host selection consumes it. Raw host focus
without a pending command leaves the browser's newly placed caret/range alone.

An integration can place native endpoints and dispatch `selectionchange`
explicitly. When the editor owns that range, or its external toolbar button
keeps focus, this explicit notification supersedes an older deferred command
caret. Both endpoints must be inside this editor. Browser-generated events do
not receive this override. Native input/select/textarea ownership and embedded
widget controls remain protected; no keyboard focus is requested by capture.

The public highlight workflow exposed the remaining race: after table editing,
gap placement and task insertion, the host selected the title while the deferred
task caret was still pending. Clearing that pending intent on explicit placement
allows the chosen title range to receive the highlight instead of restoring the
old task caret. The original browser assertions remain unchanged.

## API and verification

The declaration review checks all 423 existing declaration files against the
parent commit. Only the two `SelectionHandler` declarations change: one private
field and a backward-compatible optional `preserveForFocus` parameter on
`requestModelSync`. `EditorView.focus()` and existing call signatures remain
compatible. The review removes exactly those two changes and requires an exact
parent declaration hash; other declaration text cannot drift unnoticed.

Seven added unit cases cover fresh forward/backward native placement, pending
command replacement before/after returning focus, and preservation of an
external native input's focus and selection. Browser verification uses the
built package, headless engines and one worker on a private test server. The
evidence record distinguishes intermediate failures, final results and visual
review. Mobile browser emulation is not physical-device certification.

The unchanged set of 63 previous CI failures now passes locally across Chromium,
Firefox, WebKit and the two mobile emulation projects (63 passed; two existing
non-Chromium clipboard skips). A narrower intermediate repair passed 60 and
still failed all three highlight cases; these results are retained alongside
the final recovery log. Recovery of this set alone does not prove that the
complete browser suite passes.

The additional 27 table/control/RTL checks pass, as do 4,052 unit tests across
275 files, types/API/headless/package/workerd and performance/retention gates.
The actual package archive matches all 881 build files; four source-map entries
match the two changed runtime sources in ESM/CJS. Packed Node consumers exercise
14 existing core/formatting/collaboration cases without DOM globals. This is not
a Node runtime test of the DOM view itself.

Visual review covers 48 stage captures through contact sheets (native colour
controls additionally use a legible top crop), plus 12 sampled frames from three
recordings. Some early video frames show loading, and samples miss brief states;
the explicit stage captures show the selected, highlighted and cleared title.
Continuous playback and physical mobile are not certified. Static root import
payload grows by 992 raw / 209 gzip bytes; consumer tree shaking, external peers
and dynamic imports are excluded, and this does not measure execution speed.
See the [verification record](../artifacts/native-focus-verification-20261105.json).

No document schema, collaboration wire format, runtime dependency or acceptance
limit changes are part of this repair. Existing size failures and unfinished
structural wrapping/collaboration work remain open. No npm or website promotion.
