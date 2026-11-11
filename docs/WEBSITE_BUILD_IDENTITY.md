# Website build and release identity

The local candidate adds a build label to all 20 public HTML entry points.
The label distinguishes the development preview from a published npm artifact.
Matching version strings alone never promote a preview to a verified release.

The label and generated `build-info.json` identify the package version, actual
Git commit, working-tree status, preview channel and build-time verified npm
version. Hosted source links are enabled only in GitHub Actions; local commits
are displayed as text. A source archive without Git reports an unavailable
revision. Development servers identify a live working tree and do not query
npm. A production build queries the public registry with a four-second timeout;
failed or invalid verification shows a registry link instead of inventing a
published version. Successful verification includes its timestamp in the JSON.

The label is present in the initial HTML, works before JavaScript, wraps at
390 pixels and is hidden when printing. This is build-information rendering,
not full marketing-page prerendering or assistive-technology certification.
Fixtures outside the public entry list are unchanged. The production test
enumerates every emitted HTML file, so another public entry cannot silently
miss the label. It compares generated Git metadata with the actual checkout.

The gallery now identifies the React, Vue, Svelte and Angular bindings, the
plain DOM view, the optional framework-independent Custom Element, and the
portable-data boundary. The developer facts identify six browser interfaces.
The homepage calls its capabilities a source preview, and the example document
refers to the FountainJS engine without implying it is the published package.
The clipboard/AI sample assertions retain their existing behavior checks with
the corrected sample wording.

The Pages workflow still deploys independently of CI. The label does not imply
deployment approval. Release staging still requires the shared CI and registry
verification; keep the published-version README and adapter availability notes
accurate when publication is actually verified. Do not merge this candidate
into an automatically deployed branch while starter pins remain unpublished.

## Homepage copy and text contrast

The local candidate now shows an alert and a read-only source field when
programmatic copying is rejected or unavailable. **Select output** focuses and
selects that field for native keyboard copying. Failed copying does not alter
the document. Pending requests are serialized and success belongs to the copied
snapshot, so switching output format cannot falsely confirm the new output.
The format buttons also publish their pressed state.

The named dark-surface accent labels, pale outline labels and inactive export
controls now pass normal-text contrast checks. Eleven targets per desktop engine
measure at least 5.15:1. This is scoped computed-style evidence, not whole-site
WCAG, font-readability, screen-reader or mobile certification.

Manual recovery, race handling and contrast pass across all three engines.
The unmocked positive API path passes Chromium with write permission and
Firefox. Windows headless WebKit reports successful API writing but pastes empty
text; an independent native HTML control reproduces it. The source run records
14 passes/one failure, and the built site records 29 passes/one failure. The
positive paste assertion remains required. Linux CI serializes native clipboard
cases on Xvfb and runs production workflows headed on Xvfb; that hosted evidence
is pending, so this is not release approval. No browser assertion is skipped or
weakened to hide the local result.

The November 11 website assessment also identifies remaining work:

- Broader accessibility, contrast and readability audits beyond these named targets.
- Measurement of homepage export-panel work during editing.
- Stronger first-visit navigation and marketing/documentation prerendering,
  including canonical and sharing metadata.
- Independent developer onboarding and physical-device/assistive-technology use.

Optional typography already loads outside the initial render path in the local
candidate. Installed starter preparation/browser tests are also required in CI.
These are local improvements; they are not evidence that an old deployed site
or the current public npm release already includes them.
