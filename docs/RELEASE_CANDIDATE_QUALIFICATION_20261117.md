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

## Next gate

Push the tested follow-up and require fresh exact-revision hosted CI before
publication. The candidate remains `0.5.0-beta.1`, public npm remains
`0.4.0-beta.2` at the initial checkpoint, and the roadmap remains 61/74 delivered.
Physical mobile/IME, broader native-app/browser/role matrices, endurance and
unresolved format/product acceptance are not closed by this release exercise.

[Retained measurements and file digests](../artifacts/release-qualification-20261117/223905Z/validation.json).
