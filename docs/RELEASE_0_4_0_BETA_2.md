# 0.4.0-beta.2 checkpoint — 2026-09-08

Published as an unfinished beta at the maintainer's request before pausing work.
The goal remains paused and incomplete; this release is not a parity claim.

## Included

- Discoverable real-world workflow gallery, GitLab-style issue and Todoist-style
  task examples, with implementation guides and reader/export/reopen journeys.
- Markdown source recovery, code/newline/task retention fixes and optional
  document-wide HTML conversion. Reference profiles remain distinct: default
  563/652, identity-preserving 579/652, source-recovery 580/652 and the optional
  combined-container configuration 599/652. Source retention is checked separately.
- Native glossary structures, optional HTML sections and authoring controls.
- DOCX visible content-control import and experimental typed glossary handoff,
  with explicit conversion warnings rather than silent content loss.
- Opt-in native Web Component form association, FormData submission, reset,
  disabled state and restoration handling; root metadata replacement fixes.

## Verification and known limits

Full local `pnpm check`: 1,745 tests in 134 files passed, including build, API,
package, headless/runtime, type, interoperability and budget checks.
Recorded editor/reader/handoff journeys and screenshots were visually reviewed.
The latest native-form five-configuration run passed four configurations but
desktop WebKit timed out after a submit button detached. An earlier five-engine
run passed, and an isolated pre-release WebKit rerun also passed (6.4 seconds).
The inconsistent result remains a stability issue, not waived evidence.

Not complete: CommonMark conformance, arbitrary HTML/CSS fidelity, native
Word/LibreOffice page-layout certification, complete Word control semantics,
required/custom form validity, automatic label activation, and real browser
autofill/session-restoration certification. Emulation is not physical-device QA.

## Resume point

Investigate the native-form WebKit journey and preserve its failure trace under
`artifacts/web-component-forms-final-contracts/`. Continue the documented parity
roadmap only after the maintainer resumes the project. Do not run background
development while paused. The separate local Firefox manifest workaround in
`playwright.config.ts` belongs to the previous agent and is not part of this release.

GitHub release publication triggers the existing npm trusted-publisher staging
workflow. A stage is not a public npm release until a maintainer approves it.
