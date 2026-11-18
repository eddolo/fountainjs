# Beta candidate qualification — 2026-11-17

Initial revision: `4c66f386d1a3754eceb1cd0f97db45a0c4e6a72c`.
[Draft review](https://github.com/eddolo/fountainjs/pull/25),
[first hosted CI](https://github.com/eddolo/fountainjs/actions/runs/44192678347),
[independent native DOCX job](https://github.com/eddolo/fountainjs/actions/runs/44192678583).
This checkpoint prepares a follow-up; it is not a release or full-product acceptance.

## Initial qualification

All 7,030 unit tests / 407 files, strict framework types, build, API/package,
server/headless, Markdown conformance, math-reference, DOCX interoperability,
bundle limits and direction/position retention checks pass locally. Hosted
package verification, performance and the real pinned Lean integration pass.

Local HTML parsing p95 at 10,000 blocks first fails at 942.93 ms against 900 ms.
Hosted performance passes at 671.25 ms. After the local suite/upload finish, one
idle control passes at 428.08 ms. All attempts are retained; no limit, sample count
or parser implementation changes. This does not prove every desktop meets the
latency target under arbitrary load.

## Browser failures and corrections

The first hosted recorded suite has seven passes / one failure. A native drop
indicator is visible but marks another paragraph. The exact trace records only
one move to the final destination; Playwright documents that native dragover may
need a second move. A local unchanged control passes, so it is not evidence for
an engine defect. The correction emits a second real move and keeps the original
indicator assertion. A stronger final-order check then exposes recording-time
native auto-scroll: the target moves during the recording pause, and release
lands before the title. Re-entering the intended target with native hover before
release passes without weakening that final-order check.

The first hosted migration selection has 17 passes / four failures. Three engines
insert the follow-up text before the wrapped final word: the helper's End key
means visual-line end. The helper now measures the last rendered text line,
clicks it using native pointer input, presses End and verifies a collapsed native
caret at the intended paragraph end before typing. It never injects document
content. A separate WebKit capture is 1,403 CSS px tall in a 1,400 px viewport;
compact comparison-heading margins remove fixture overflow without clipping
content or changing the exact no-overflow assertion.

Six unchanged Windows controls pass. The repaired selected migration suite passes
21 journeys across Chromium/Firefox/WebKit. All eight recorded release journeys
and a fresh strict TypeScript check pass. Earlier red attempts remain evidence;
these are interaction/fixture corrections, not four newly repaired engine bugs.
The final dropped order, reopened text and expanded review PNGs are inspected.

[Playwright's native-drag guidance](https://playwright.dev/docs/input#dragging-manually).

## Export review and boundaries

The independent native DOCX job passes on the initial revision. Both original
pages and both exported pages, editor top and an equation/table state are viewed.
Figures, chart images, table geometry and equations remain visible; the intended
ending/footnote edits appear in export. The report explicitly leaves
`pixelFidelityCertified` and `microsoftWordCertified` false. Selected position
checks, required content and successful rendering do not certify arbitrary Word
files, every font/glyph or the continuous editor as an identical paginated view.

Raw downloaded videos/traces/PDFs remain local, with digests in the evidence
manifest. Curated PNGs and loss/report receipts are preserved. Review is selected
states, not a claim to have inspected every video frame.

## Native cut ownership follow-up

The broader Linux display-backed matrix on `9cd1d7b3` and `22fd4a98` reaches
36 passes / three failures in its native clipboard group. All three failures
are the same byte-string expectation: a cut payload was required to equal the
copy payload, although successful cuts now add an opaque ownership token for
footnote moves. The document JSON itself is unchanged. This is stale test
coverage of an existing feature, not three newly repaired engine defects.

An unchanged recorded Windows control fails in Chromium/Firefox/WebKit. The
updated case requires the complete cut JSON to equal the copied payload plus
one nonempty token, exact matching plain text, and exact copied HTML inside the
wrapper bearing that same token. Ordinary copy must have no token in either
format. Existing cut deletion, undo and paste assertions remain in place.

All three recorded Windows cases now pass. Chromium additionally checks actual
OS paste into an independent contenteditable, paste back into Fountain, and
continued typing after the image. The cut, external paste and internal paste
PNG states receive visual review. The existing ownership/refusal/forged-token/
history suites pass 25 unit cases, and fresh strict types pass. A related native
assertion search finds no other copy-versus-cut byte-string expectation.

The correction changes no engine, API, dependency, budget, retry policy or
production clipboard behavior. Fresh headed Linux display-backed verification
and all subsequent browser gates remain required. The earlier hosted and local
red attempts, source hashes, recordings and transport observations are retained.

## November 18 browser-matrix follow-up

The full run on `2604c802` ends with 1,132 passes, 18 skips, five failures
and one flaky mobile Angular journey. Its independent display clipboard group
passes all 39 cases. Verification, performance, recorded UI, Lean and independent
native DOCX jobs pass; the whole release remains unqualified because the browser
job fails.

The stalled-image PDF failure is an oracle defect: PDF.js splits `fi` from
`gures`, and the helper inserts spaces between every item. The real Linux PDF
renders the words correctly. The new helper uses the returned spaces and EOL
flags rather than inventing word boundaries. Controls still reject missing or
reordered letters and extra spaces or line breaks within a word, while retaining
actual word spaces and line boundaries.
The final one-page PDF and editor preview receive visual review; arbitrary
PDF/Word fidelity is not certified.

A controlled approved-provider frame reproduces interrupted native typing by
requesting focus midway through input. Editable embeds now retain an empty
`srcdoc` until **Interact with [title]** is activated. Returning to prose unloads
the provider. Reader rendering, document JSON, provider policy and exported
attributes are unchanged. The node view owns its transient iframe/control DOM
mutations, and the asynchronous unit control proves activation preserves the
same iframe rather than being immediately reset by document repair.

Eight final diagnostic journeys pass serially on Linux Chromium/WebKit and both
mobile emulations: protected typing, native keyboard activation, real provider
input, immediate resumed prose, the original Angular lifecycle/history journeys
and the stalled-image preview/PDF. Selected desktop/mobile PNGs and the PDF are
visually inspected. The provider is a controlled fixture, not certification of
arbitrary live third-party players or physical mobile/IME.

Four newer native clipboard journeys were omitted from the existing display
partition. All four reproduce lost rich structure in headless Linux WebKit;
the display-backed cases retain all original semantic assertions. Local WSL GTK display
attempts also stall intermittently before the first click or download; those
failures remain failures. Software-compositing and explicit-front experiments
are retained and are not applied to CI. The normal hosted display must still
pass the complete group. No forced clicks, skips, extra retries or changed
content expectations are introduced. The inventory registers all 1,200 cases:
51 display-backed and 1,149 headless, including five new focus regressions.

Visual capture leaves the caret visible. The earlier screenshot helper injected
caret-color styles into atomic media, causing the editor's defensive repair to
replace the iframe. That recording artifact is retained. Earlier local results
from a server kept alive across library rebuilds are nonqualifying; the final
run verifies that served imports match the rebuilt module set. The final local
diagnostic server omits only its build-information banner to avoid the slow
cross-filesystem Git scan. Hosted qualification keeps the complete normal
configuration.

Build-size limits are unchanged. Comment compaction offsets the added CSS;
existing declarations and UI behavior in those compacted rules are unchanged.
No package dependency, public API, performance limit or retry policy changes.
The final source passes 7,035 unit cases in 409 files, strict framework types,
public API/package checks and the existing bundle limits. Exact raw-log bytes,
media hashes and reviewed PNGs are in the [follow-up evidence](../artifacts/release-qualification-20261117/223905Z/matrix-followup-20261118/validation.json).

## Next gate

Push the tested follow-up and require fresh exact-revision hosted CI before
publication. The candidate remains `0.5.0-beta.1`, public npm remains
`0.4.0-beta.2` at the initial checkpoint, and the roadmap remains 61/74 delivered.
Physical mobile/IME, broader native-app/browser/role matrices, endurance and
unresolved format/product acceptance are not closed by this release exercise.

[Retained measurements and file digests](../artifacts/release-qualification-20261117/223905Z/validation.json).
