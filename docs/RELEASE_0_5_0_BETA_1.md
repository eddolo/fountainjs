# FountainJS 0.5.0-beta.1

These beta notes describe the 0.5 upgrade and its known limits, prepared in
[PR #25](https://github.com/eddolo/fountainjs/pull/25). Check
[npm versions](https://www.npmjs.com/package/fountainjs-editor?activeTab=versions)
and [GitHub releases](https://github.com/eddolo/fountainjs/releases) for actual
publication state. The full [changelog](../CHANGELOG.md) records the changes.
Neither a version number nor publication certifies completed product parity.

## Upgrade persisted collaboration rooms deliberately

The default `fountainjs-editor/yjs` entry now uses retained storage. Existing XML
rooms need `fountainjs-editor/yjs/legacy` or an explicit migration; changing the
import alone does not migrate stored documents. Supported Yjs versions start at
13.6.32. Follow [default-adoption and migration guidance](YJS_DEFAULT_ADOPTION.md)
before upgrading a persisted room. Preserve recovery copies and verify the
migration/rollback workflow with the application's own backend.

## Release highlights

- Authoring embeds load provider content only after explicit interaction and
  unload it when returning to prose; reader playback is unchanged.
- Rich editing and clipboard fixes preserve structural selections, footnotes,
  mixed ordinary/task lists, numbered checkboxes and authored blank content.
- Markdown and HTML interchange retain more source/container intent and report
  representational loss. DOCX work improves supported document semantics; it
  does not certify arbitrary Word documents as visually identical.
- Retained collaboration adds recovery and migration workflows. Stable-ID
  collision indexing avoids quadratic array copying. Selected retained indexes
  are reused only after their existing validation checks.
- The private native GitLab integration exercises actual issue/MR/wiki workflows
  with GitLab's backend. Recorded original/replacement comparisons keep parity,
  improvements, regressions and shared limitations distinct. These results are
  not a claim of full GitLab compatibility or overall Tiptap superiority.
- Native GitLab rich/source mode switching retains the owned model and undo
  history for unchanged source, including after access removal. Unauthorized
  server operations remain denied; changed source still uses GitLab conversion.

## Qualification status

Commit `b1161fd5` passed all five qualification jobs. The final matrix
passed 51 display-backed clipboard cases and 1,131 headless cases, with
18 skipped. The independent native DOCX job passed. The GitHub prerelease
and published npm package use this commit. The website first deployed this
revision and reports later development builds separately.
[GitHub prerelease](https://github.com/eddolo/fountainjs/releases/tag/v0.5.0-beta.1) ·
[CI](https://github.com/eddolo/fountainjs/actions/runs/44218762181) ·
[Native DOCX](https://github.com/eddolo/fountainjs/actions/runs/44218762064).

### Earlier candidate checks

The initial review revision is `4c66f386`; follow-up `9cd1d7b3` corrects native
recording interactions and prepares these notes. Fresh local checks pass build,
API/package validation, server/headless operation, Markdown conformance, math
references, DOCX interoperability, bundle limits and strict framework types.
All 7,030 unit tests in 407 files pass, as do the direction and position retention
checks. A local 10,000-block HTML p95 sample failed at 943 ms against the unchanged
900 ms limit; the hosted performance job passes at 671 ms and an idle local
control passes at 428 ms. All three results remain part of the evidence.

The first hosted run passes package verification, performance and real Lean
integration. Recorded UI and migration jobs expose platform-sensitive interaction
and fixture-layout failures. Follow-up native-interaction corrections pass all
21 desktop recovery journeys, eight recorded release journeys and strict types
locally. On `9cd1d7b3`, hosted verification, performance, Lean, eight recorded
journeys, 33 production checks, 48 GitLab bridge checks, six installed-starter
checks and independent native DOCX all pass. The npm trusted-publisher
diagnostic passes, with package staging explicitly skipped.

On `2604c802`, those non-browser jobs and native DOCX pass again. The display
clipboard group passes all 39 cases, including the corrected cut-token contract.
The remaining headless matrix finishes with 1,132 passes, 18 skips, five failures
and one flaky mobile Angular case. The five failures are the stalled-image PDF
text checker and four WebKit native clipboard workflows. November 18 follow-up
work adds a real provider-focus regression and repairs the text-run oracle and
display partition. The completed run above verifies both repairs.

The initial native DOCX audit’s two source/export pages and selected
editor states were visually inspected; this is not pixel-fidelity or Microsoft
Word certification.

## Remaining acceptance work

Collaboration endurance, broader native browser/mobile/IME and accessibility/RTL
coverage, format fidelity and complete professional product workflows remain
open. Missing roadmap capabilities include editable charts/source-backed diagrams,
authorable template fields and a structured whiteboard. Capability coverage is
61/74 delivered; that percentage is not a production-readiness score.

## npm publication

On November 18, 2026, a clean install of `fountainjs-editor@latest` resolved to
`0.5.0-beta.1`. The public tarball matched the registry and lockfile SHA-512.
In Node 24.22.1, both ESM and CommonJS consumers created a document, applied a
text transaction and validated the result without a browser or DOM shim.
The installed Yjs adapter accepted a native Y.Doc and a local user identity.

npm verified the registry signatures and the package's provenance attestation.
Its subject digest matched the downloaded tarball and its source identified
`refs/tags/v0.5.0-beta.1`, release workflow `.github/workflows/release.yml`,
and commit `b1161fd5`. [Public package](https://www.npmjs.com/package/fountainjs-editor/v/0.5.0-beta.1) ·
[Registry attestation](https://registry.npmjs.org/-/npm/v1/attestations/fountainjs-editor@0.5.0-beta.1) ·
[Consumer verification](../artifacts/npm-public-consumer-0.5.0-beta.1.json).
