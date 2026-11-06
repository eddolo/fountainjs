# Collaboration cursor overlay audit

2026-11-06. Local work following `b5dc6be4`. Publishing remains on hold. This
addresses native input and presence rendering, separately from the six known
retention failures in the default Yjs storage adapter. It does not adopt the
experimental retained storage or claim complete editor parity.

Follow-up: the far-edge name-label collision found below is addressed in the
[move, cost and label audit](YJS_RETAINED_MOVE_AND_LABEL_AUDIT.md). Its later
84-journey browser run supplements this historical 78-journey checkpoint;
the earlier receipt and its findings remain unchanged.

## Problem and evidence

The recorded two-editor journey found that three right-arrow presses reached
offset two when another person's cursor was inserted between DOM text nodes.
The native/model endpoints before Enter agreed on that offset, so the resulting
split was not itself evidence of shared-character loss. CSS position/display
changes did not consistently remove the extra stop across engines.

An initial native-movement repair passed the 24 collaboration journeys but failed
17 of 24 broader native-reference cases. It left labels in selected text and
could not undo grapheme fragmentation caused by placing a non-editable element
inside source characters. That repair was discarded; no arrow-key interception
or custom grapheme movement algorithm is shipped by this change.

## Boundary and implementation

- `src/core/decoration.ts`: additive optional `DecorationSpec.overlay`. Mapping
  retains the flag and equality distinguishes a passive overlay from an in-flow
  widget. This is portable view metadata, not a browser dependency in the model.
- `src/extensions/collaboration.ts`: remote caret widgets opt into the overlay.
  Peer range paint edges expand to grapheme boundaries using `Intl.Segmenter`;
  exact UTF-16 presence positions are retained. Without that API, painted ranges
  conservatively expand to text-leaf boundaries. Neither path rewrites text.
- `src/view/dom-renderer.ts`: overlay widgets do not enter editable DOM or split
  text/link runs. Existing in-flow widgets retain their previous behavior.
- `src/view/widget-overlays.ts`: the DOM view owns an inert, noninteractive layer
  outside the editable surface. Collapsed DOM ranges measure anchor coordinates
  without changing the native selection. Mounted owner geometry handles empty
  text and structural gaps; missing virtualized anchors remain hidden.
- `src/view/view.ts`: separate content decorations from passive overlays, so
  presence-only caret updates keep existing text DOM and focused controls.
  Update geometry on scroll, resize, font/image load and view updates; remove the
  layer, observers and pending frames on teardown, removal or factory failure.
- `src/styles.css`: cursor height follows the measured anchor and overlays are
  hidden for print. Public styling hooks are documented in `docs/API.md`.

There is no new package entry or DOM requirement in the headless engine. The
public API addition is one optional decoration field; declaration snapshots also
reflect private view fields. No size, timing, memory or semantic ceiling is
relaxed. The default Yjs storage protocol and the six original acceptance tests
are unchanged.

## Verification results

The complete source run has **4,307 passed, six failed, zero skipped (4,313
total)**. All six failures are the unchanged default-adapter storage cases. The
58 focused presence/view/overlay tests pass. The public build, 423-declaration
API check, 132-module headless boundary, package/server checks and framework type
checks pass. Existing public performance and heap gates pass; they do not certify
the experimental storage adapter's large-document behavior.

All **78 compiled browser journeys pass**, 26 each in Chromium, Firefox and
WebKit, with one worker and no skips, retries or flaky passes. Each journey
records imported module URLs and verifies it loaded the compiled engine rather
than project TypeScript. The canary uses one shared module graph for engine and
experimental adapter, avoiding duplicate selection classes/runtime maps. All
190 project modules in its source maps match current source; its CSS matches both
source and public build. **24 compiled ESM/CommonJS Node journeys pass without a
DOM substitute.**

The CSS gate passes after consolidating redundant cursor styles. All 170 public
JavaScript runtime files remained byte-identical during that CSS-only change;
the final browser matrix was rerun afterward. No limits changed. The size gate
still reports core ESM about 0.1 KiB over, aggregate ESM 74.8 KiB over and
aggregate CommonJS 59.0 KiB over. This remains a release blocker.

The strict CI step and evidence upload are prepared in `.github/workflows/ci.yml`.
Its YAML and required-step configuration were parsed and checked locally.
GitHub has not executed this commit; no push or publication was attempted.

## Verification scope

`tests/manual/retained-adapter-real.spec.ts` retains offline typing against all
six quote/list/mark/split actions, author undo/redo, room replacement without view
remount, blank-line editing, backward selection and actual JSON download/reopen.
The split now uses the original Home/Right path; its earlier End/Left workaround
is removed. The original three-engine arrow regression remains a required test.

`tests/manual/cursor-native-reference.spec.ts` compares complete key-by-key model,
native selected text and resulting document with an otherwise identical plain
editor. Cases cover English, RTL/mixed bidi, joined emoji, combining sequences,
surrogate-interior peer positions, code and empty content, including peer ranges.
It also checks empty blocks, block gaps, images and tables; scroll clipping,
transformed containers, resize, print-media hiding, text-DOM identity and external
keyboard focus. Input uses native keyboard/mouse actions. DOM inspection reads
results and geometry; it does not manufacture editor selections or documents.

`tests/widget-overlays.test.ts` checks decoration mapping/equality, native
selection/export exclusion, DOM retention and resource removal/factory errors.
`tests/collaboration.test.ts` retains untrusted-presence validation and checks
safe range painting without altering the document or original presence values,
with and without `Intl.Segmenter`.

`artifacts/cursor-overlay-verification-20261106.json` records exact source/report
hashes, counts, gate outcomes, all 78 recordings and sampled visual review.
Historical red receipts
remain historical evidence, not the current result. These focused software
browser journeys do not certify physical mobile IME or every host's custom CSS,
and they do not close the storage adoption/performance/migration work.

Visual review included the Firefox Unicode comparison, WebKit transformed/scroll
geometry, Chromium table anchor and sampled recording frames. It also found a
remaining polish issue: at a far-right atomic-media anchor, the name label can
clip against the editor boundary. The caret remains anchored and does not enter
text; collision-aware label placement is follow-up work, not silently marked done.

## Reproduction

```text
pnpm build
pnpm exec vitest run --maxWorkers=1 --reporter=json --outputFile=artifacts/cursor-overlay-unit-20261106.json
pnpm exec playwright test --config artifacts/cursor-navigation-browser-20261106.config.ts
node artifacts/retained-adapter-node-20261106.mjs es cursor-overlay-build-20261106 cursor-overlay-node
node artifacts/retained-adapter-node-20261106.mjs cjs cursor-overlay-build-20261106 cursor-overlay-node
```

The private browser config uses port 4195, headless Chromium/Firefox/WebKit, one
worker, video and traces. It does not reuse or open the user's development
servers. Its server command builds the canary and generated fixtures first.
Existing known storage/size failures remain release blockers.

The receipt verifier uses the saved local gate logs, unit JSON, canary maps and
runtime hashes. Representative images/video and the browser JSON are retained
with the checkpoint; the complete unit JSON and other raw traces/recordings stay
local and are regenerated by their test commands.
