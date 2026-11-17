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

## Candidate highlights

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
checks and independent native DOCX all pass. The broader browser job is still
in dependency installation at this checkpoint. The npm trusted-publisher
diagnostic passes, with package staging explicitly skipped.

The initial native DOCX audit’s two source/export pages and selected
editor states were visually inspected; this is not pixel-fidelity or Microsoft
Word certification. This candidate is not yet approved by the complete release
matrix.

## Remaining acceptance work

Collaboration endurance, broader native browser/mobile/IME and accessibility/RTL
coverage, format fidelity and complete professional product workflows remain
open. Missing roadmap capabilities include editable charts/source-backed diagrams,
authorable template fields and a structured whiteboard. Capability coverage is
61/74 delivered; that percentage is not a production-readiness score.

Publication requires green exact-revision release checks, inspection of the final
package, coordinated GitHub prerelease/tag and npm distribution tags. Public npm
still identifies 0.4.0-beta.2 as latest at this checkpoint. Keep beta maturity and
the collaboration storage change visible when announcing the candidate.
