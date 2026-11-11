# Release and API stability policy

FountainJS is currently a `0.x` public beta. “Beta” is not permission for
unannounced breakage: every release must state what changed, keep persisted data
recoverable, and pass the same public package/browser gates used during
development.

## Stability levels

The published `0.4.0-beta.2` release is an incremental capability preview.
By maintainer choice, npm's `latest` tag points to the public beta. Keep the
beta version suffix, prerelease GitHub flag, and open limitations in release
notes. The same commit must pass full CI before staging. A maintainer approves
the stage using npm 2FA. Prefer the
short-lived OIDC workflow; never commit authentication credentials. npm's
[stage tag is immutable](https://docs.npmjs.com/cli/v11/commands/npm-stage/), so
inspect the version and `latest` tag before approval. An already staged `next`
candidate must be rejected by a maintainer and restaged; its tag cannot be
edited in place. Registry state, not the presence of a staged tarball, proves
publication. Keep ongoing Unreleased work separate from a verified candidate.

Published-artifact verification (2026-09-07): npm's `0.4.0-beta.1` tarball is
3,070,336 bytes and matches the candidate SHA-512 exactly:
`dKLU4PC6q6Jmg0JJfwMOLNczMg0DLrh9xeAdl+Nh3HUF2QeUxaqmDLyXcsEWUYsB+qQlNrU0g8u3du6emNeFjg==`.
The source commit `a8c4890` passed all three CI jobs. A separate consumer installed
the public package with optional peers disabled and ran schema, extension,
transaction, exact Markdown source and full-document server HTML checks in both
ESM and CommonJS without `window`, `document`, or jsdom. This smoke check is not
whole-product parity certification. Use `pnpm --ignore-workspace` for isolated
consumer installations: even a temporary directory can inherit a parent workspace.

| Surface | Current level | Compatibility rule |
| --- | --- | --- |
| Persisted versioned document envelope | Stable format v1 | Readers fail closed on unknown future versions. A format bump requires a sequential migration and fixtures. |
| Bare historical `NodeJSON` | Supported legacy encoding | Interpreted as format v1 by the migration entry. New persistence should write an envelope. |
| Extension manifest/API integer | Versioned beta contract | Incompatible runtime changes require a new `FOUNTAIN_EXTENSION_API_VERSION`; `doctor` rejects mismatches. |
| Exported package APIs and subpaths | Public beta | Patch releases must be backward compatible. Before 1.0, a minor may break an API only with release notes and a migration path; deprecation first is required when practical. |
| Persisted node/mark names and attributes | Schema contract | A breaking shape change requires a document-format migration, not only a TypeScript rename. |
| Files under `src/` not reachable through package exports | Internal | No compatibility promise. Consumers must not deep-import them. |
| Experimental host/provider integrations | Public beta and replaceable | Trust, network, cost, and availability remain controlled by the host adapter. |

After 1.0, ordinary SemVer applies: breaking public API changes require a major
release, additive capabilities a minor release, and compatible fixes a patch.
Document-format and extension-API versions remain independent so consumers can
reason about stored data and extension loading without guessing from npm SemVer.

## Deprecation policy

- Mark a deprecated export in TypeScript declarations and documentation.
- Name the replacement and include a before/after example.
- Keep it for at least one beta minor release when security and correctness
  allow. After 1.0, keep it until the next major release.
- Record removal in `CHANGELOG.md` and provide an automated transform or a
  mechanical migration recipe when possible.
- Security vulnerabilities, data-corrupting behavior, and impossible-to-safely-
  emulate APIs may be removed faster; the release notes must explain why.
- Never silently reinterpret persisted JSON. Use the document migration
  contract in [MIGRATIONS.md](MIGRATIONS.md).

No public API is currently scheduled for removal.

## Required release evidence

A release is eligible for npm staging only when all of the following are true:

1. `package.json` contains a valid SemVer and the GitHub tag is exactly
   `v<version>`.
2. `CHANGELOG.md` contains a heading for that version and the `Unreleased`
   section contains no pending entries.
3. `pnpm check` passes the production build, reviewed public-declaration
   snapshot, packed-package imports, size and performance budgets, TypeScript,
   and all behavioral tests.
4. `publint` and Are the Types Wrong pass for every public entry.
5. `pnpm pack --dry-run` shows only intended public files.
6. the complete Chromium, Firefox, WebKit, Pixel/Chromium, and iPhone/WebKit
   suite passes, including the desktop room recovery checks against the
   compiled package;
7. user-facing documentation and the deployed demos describe the same version
   and limitations;
8. security-sensitive changes include adversarial tests and updated trust
   boundaries.
9. the emitted server HTML entry runs without browser globals in Node, Bun,
   Deno, and Cloudflare `workerd`.
10. changes to the reference Lean checker pass `pnpm test:lean-integration`
    against the pinned real Lean toolchain; mocked provider tests alone are not
    release evidence.

Normal push/PR CI runs every constituent of `pnpm check`, including public API
snapshot review, Node/Worker smoke tests and the independent math-reference
oracle. `tests/release.test.ts` guards this command coverage against drift when
the local gate grows. Bun/Deno, browser, real Lean and package-consumer checks
remain additional jobs/steps. Command coverage is not evidence that an individual
gate adequately tests its claimed behavior, and the math oracle is not visual
rendering or whole-paper fidelity certification.

`scripts/check-release.mjs` enforces items 1 and 2. On a published release,
the GitHub Publish npm workflow first calls the same CI used for pull
requests, using the tagged commit. A failed, canceled, or skipped CI run
blocks staging. The staging job also checks the tag and changelog and runs
the complete package gate. Only that job can request an OIDC token. npm
stages the package with provenance and leaves final approval behind
maintainer 2FA. Manual workflow runs can check the trusted publisher
configuration without staging. No long-lived npm token belongs in GitHub or
the repository.

## Release procedure

1. Finish one ledger outcome and collect its public CI/browser/deployment
   evidence.
2. Move all relevant `Unreleased` notes under a dated/versioned heading.
3. Bump `package.json` and update examples/docs that display the version.
   If the exported TypeScript surface intentionally changed, review SemVer and
   deprecation impact, update the changelog, build, then run
   `pnpm test:api -- --write` and review `api-surface.json`.
4. Run:

   ```sh
   node scripts/check-release.mjs
   pnpm check
   bun scripts/smoke-server-html-runtime.mjs
   deno run --allow-read scripts/smoke-server-html-runtime.mjs
   pnpm test:browser
   pnpm audit:ui
   pnpm dlx publint@0.3.24
   pnpm dlx @arethetypeswrong/cli@0.18.5 --pack . --exclude-entrypoints ./angular ./angular/forms ./styles.css
   pnpm dlx @arethetypeswrong/cli@0.18.5 --pack . --entrypoints ./angular ./angular/forms --profile esm-only
   pnpm pack --dry-run
   ```

   Resolution validation discovers the published export map, including the
   document schema JSON. CSS is a stylesheet asset rather than a JavaScript
   module. Both Angular entries use the separate ESM-only profile. Where
   npm is unavailable locally, create a tarball with `pnpm pack` and supply its
   path to the same validator in place of `--pack .`; do not reduce entry-point
   coverage or ignore resolution errors to bypass packing-tool availability.

   Do not treat `pnpm audit:ui` as another assertion-only test. Watch the
   generated WebM under `artifacts/manual-ui-audit/` and inspect its screenshots
   for clipped controls, invisible state, unexpected scrolling, selection
   discontinuities, or document/output disagreement before approving release.

5. Commit the release on its reviewed branch, create the exact `v<version>`
   tag, and publish the GitHub release from that tag.
6. Inspect the public Publish npm run. If it stages successfully, inspect the
   package name, version, provenance, files, README, and dependency list on npm,
   then approve with maintainer 2FA.
7. Verify registry publication and clean installation in an empty consumer.
8. Merge the verified release source into `master`, wait for the Playground
   deployment, and check the live website and starter downloads.
9. Add the immutable release/run links to the parity ledger.

The Playground workflow deploys automatically on a `master` push. Keep release
preparation on its review branch until the staged package is approved and its
registry installation passes. This ordering lets the versioned starters and
website go live after their package becomes installable. A tag can identify the
verified review-branch commit before the source is merged. Any subsequent code
change still needs the applicable checks before deployment.

Unmerged validation checkpoint, 2026-11-04: the packed schema-resolution repair
passes strict analysis of 40 discovered entries, separate Angular ESM analysis,
package loading, publint and the site build. See
`artifacts/package-schema-verification-20261104.json` and the corresponding logs.
These checks do not certify a release. The measured candidate allowance in
`artifacts/layout-capacity-proposal-20261104.patch`, with exact byte measurements
in `artifacts/layout-capacity-measurements-20261104.json`, received separate user
approval after the smaller theme-language allowance. The exact seven-limit patch
is now applied and the authoritative size gate passes. The original unapplied
proposal, candidate check and pre-approval failure remain historical evidence;
`artifacts/layout-capacity-approval-verification-20261104.json` records the applied
contract. Only those seven raw-size ceilings change, using quarter-KiB rounding;
all other entry, runtime-performance, retention, semantic and reference checks
remain unchanged. This is capacity for implemented fidelity/geometry code, not a
speed improvement or format-parity certification. Fresh full CI is still required.

The release workflow must never publish from an arbitrary branch head or infer
a version from a GitHub release title.

### Local release preflight, 2026-11-10

Runtime commit `66d976ac` passed the local build, API, package, server runtime,
headless, CommonMark, math, DOCX, size, performance, framework type and full
source gates. The source run passed 5,163 tests in 322 files. Packed entry
resolution passed for the general package and for the Angular ESM entries.
The host lacked the npm CLI, so the packed type checker read the tarball
produced by `pnpm pack`. Publint exited successfully with the known DOCX
format warning. The package smoke check loaded the CommonJS DOCX entry.
Local logs are under `artifacts/release-preflight-66d976ac/`.

The subsequent site change places the retained-room rollout checklist on the
developer guide itself. The two previous GitHub guide targets returned 404 on
the default branch. The site builds under the GitHub Pages path, and the
rollout link and XML compatibility example pass in Chromium, Firefox and
WebKit.

The [registry tags](https://registry.npmjs.org/-/package/fountainjs-editor/dist-tags)
read `latest: 0.4.0-beta.2` and `next: 0.4.0-beta.1` on this date. The latest
open [draft](https://github.com/eddolo/fountainjs/pull/22) still points to
`1a9e1640`, whose [hosted CI run](https://github.com/eddolo/fountainjs/actions/runs/42104477777)
failed. A fresh hosted matrix and release approval remain open for the
current candidate.

### Local integration preflight at 2e10151a

The `2e10151a` runtime passed `pnpm check` on Windows with two source-test
workers. All 5,226 source tests in 322 files passed. Build, API surface,
packed-entry smoke checks, Node/workerd, the headless boundary, Markdown
profiles, math references, DOCX interoperability, existing size limits,
performance/retention and framework type checks passed in the same run.
The log is `artifacts/release-check-2e10151a.log`.

All 24 recorded desktop integration checks pass across Chromium, Firefox and
WebKit. The batch covers backward and cross-container selection, empty-document
Enter/Backspace, clipboard history, multiline math, table deletion/sizing,
quote exit and native footnote recovery/export. This is a focused regression
batch; the complete hosted browser matrix remains outstanding.

The complete 58-check mobile-emulation matrix passed in Android/Chromium
and iPhone/WebKit profiles with one browser worker. This covers the actual
framework demos, Enter/Backspace, math, DOCX handoff, review/version controls,
menus, block controls and bounded 100,000-block mounting. Physical virtual
keyboards and real-device IME remain unverified.

The website builds under `/fountainjs/` with its existing large-chunk warning.
A fresh local tarball passes the
general entry-resolution check and the separate Angular ESM-only profile.
Publint exits successfully with the existing DOCX CommonJS-format warning;
the packed runtime smoke checks load that CommonJS entry successfully.
These checks use the existing acceptance limits.

GitHub's draft #22 still points to `1a9e1640`, and the published registry
tags remain `latest: 0.4.0-beta.2` and `next: 0.4.0-beta.1` on November 10.
The local preflight does not certify the hosted release matrix. GitHub CLI
authentication is currently unavailable on this machine.
[Draft PR](https://github.com/eddolo/fountainjs/pull/22) ·
[Registry tags](https://registry.npmjs.org/-/package/fountainjs-editor/dist-tags).

### Local integration preflight at 235b88fd

The `235b88fd` runtime passed `pnpm check` on Windows on November 11 with two
source-test workers. All 5,254 tests in 322 files passed. The same run passed
build, API surface, package imports, Node/workerd, headless processing, Markdown
profiles, math references, DOCX interoperability, existing size limits,
performance/retention and framework type checks.
The log is `artifacts/release-check-235b88fd.log`.

The separate real Lean check initially reached its 15-second request timeout
while the full check was running. An isolated rerun verified both valid and
invalid proofs with the pinned Lean 4.30.0 toolchain. Both results remain in
`artifacts/release-lean-235b88fd.log` and
`artifacts/release-lean-235b88fd-serial.log`. This establishes successful isolated
verification. It does not establish reliability under simultaneous build load.

A tarball packed from this runtime passed general public-entry type resolution
and the separate Angular ESM profile. Publint exited successfully with its
existing DOCX CommonJS-format warning. A clean consumer installed the tarball
with optional peer installation disabled and exercised schema, extension
composition, transactions, exact Markdown source and server HTML in both ESM
and CommonJS without browser globals. The consumer probe and output are in
`artifacts/release-preflight-235b88fd/`. The unchanged server-runtime script
also passed in Bun 1.4.4 and Deno 2.9.6, complementing Node and workerd in the
full check.

The next planned package version is `0.5.0-beta.1`, accounting for the changed
default Yjs storage representation and supported Yjs version range. The
[adoption guide](YJS_DEFAULT_ADOPTION.md) describes the explicit legacy entry
and migration path. The package manifest remains at the published version
until the release candidate is prepared. Downloadable starters continue to pin
the existing published package so their installation remains reproducible.

After installing the missing Playwright browser executables, the broad local
run recorded 187 passes and one failure before it was stopped for a repair.
The image-edit workflow could save attributes, but its immediate keyboard undo
did nothing after focus returned to a toolbar button. The standalone workflow
failed in Chromium, Firefox and WebKit. The run remains incomplete, including
the separate serialized native clipboard batch. Its log is
`artifacts/release-browser-235b88fd-installed.log`.

### Toolbar history repair at 597f5415

The toolbar reuses the existing history-key handler for focused action buttons
while no panel is open. Form fields keep native key handling. Composition and
Alt-modified events are excluded, and cancel still returns focus to the panel's
trigger. The regression checks fail before the repair and cover Control/Command
undo, Shift+Z and Control+Y redo, field ownership and the returned trigger.

The `597f5415` runtime passed `pnpm check` with all 5,257 source tests in 322
files. Public API, package imports, Node/workerd, headless processing, formats,
framework types, latency, retention and existing size limits passed in the same
run. The log is `artifacts/release-check-597f5415.log`.
The initial handler exceeded the aggregate CommonJS cap. Consolidating its
event guards and the panel's enabled-field selector kept the repair within the
existing allowance. No acceptance limits changed.

The final tarball passes the general public-entry type check, the separate
Angular ESM profile, and a clean ESM/CommonJS consumer without optional peers
or browser globals. The consumer files and output are under
`artifacts/release-preflight-597f5415/`.

All 12 recorded checks pass against the final committed runtime across
Chromium, Firefox and WebKit. They cover the complete nested-content/image
workflow, slash-menu scrolling, emoji Tab navigation and panel focus/cancel.
Sampled frames from all three workflow videos and the reader screenshots
received visual review. The recording configuration and log are
`artifacts/toolbar-history-browser-20261111.config.ts` and
`artifacts/toolbar-history-browser-final-20261111.log`. The built website also
passes under `/fountainjs/`.

The complete browser/Yjs matrix, hosted CI, versioned release notes and
publication verification remain open. GitHub CLI sign-in is still pending.
No npm version or public release status changes at this checkpoint.

### Combined browser validation at 597f5415

All 48 compiled-default Yjs journeys pass across Chromium, Firefox and WebKit.
The fixture loads the built `/dist/index.js`, `/dist/yjs.js` and explicit legacy
entry. Its module audit rejects source-module substitution on every passing
journey. Coverage includes offline typing versus wrapping/formatting/splitting,
author undo/redo, empty siblings, ancestor deletion, incompatible room data,
thousand-paragraph native editing, observer annotations, cursor navigation,
blank lines, mounted room replacement, download and JSON reopening.
The log is `artifacts/release-yjs-default-597f5415.log`. Sample reopening and
continued-editing screenshots received visual review.

The startup/detached-draft batch passes all 24 checks and the migration-recovery
selection passes all 21 checks across the same three engines. They exercise
incomplete room data, settings before admission, cancellation, changed private
drafts, blocked local storage, lost save/apply replies, repeated reloads and
explicitly reviewed recovery into a migrated room. The terminal logs are
`artifacts/release-room-recovery-597f5415.log` and
`artifacts/release-migration-recovery-597f5415.log`. Sample recovery/archive
screenshots received visual review. A separate Chromium inspection confirmed
that empty image captions and resize controls have `display: none` and zero
height in a read-only built-package view. It required no implementation change.

All 108 compiled native-presence/navigation checks also pass in the three
desktop engines. This batch compares native text/grapheme behavior with passive
remote presence, including RTL, emoji, combining sequences, range selection,
empty and atomic anchors, and long names at narrow/top-edge boundaries. It
also repeats retained-document editing and recovery checks through the compiled
canary. Those repeated cases overlap the separate default-adapter batch and
must not be counted as additional distinct capabilities. The terminal log is
`artifacts/release-native-presence-597f5415.log`; sample label-placement screenshots
received visual review.

The subsequent broad five-engine editor diagnostic stopped at its failure
limit. The completed collaboration batches do not certify a later combined
release or the separately serialized native clipboard checks. The next section
records the resulting renderer repair.

The broad run also exposed an ambiguous list-button test query. Its substring
match selected both `Bullet list` and the lower demo's `Toggle bullet list`.
Both clicks now use the exact toolbar label; the existing list/paragraph
assertions are unchanged. The repaired check passes in all three desktop
engines. The original failure context and the separate rerun are retained
under `artifacts/release-browser-597f5415/` and
`artifacts/release-list-controls-selector-597f5415.log`. This diagnostic run
includes that test-only correction; it is not a fresh frozen release run.

Remote review inventory on November 11 still shows stacked draft PRs #8–22.
The local branch is ahead of the newest draft's `1a9e1640` head. The prepared
next draft continues `fix/native-focus-intent-20261105`; its description is in
`artifacts/release-pr-body-20261111.md`. Earlier drafts remain prerequisites,
and the proposed body must be updated with terminal matrix results before use.

### Empty-run widget repair at 7961b966

The broad `597f5415` diagnostic stopped after five failures: 628 passed, nine
skipped, one interrupted and 423 did not run. Its three failing scenarios
included the repaired list-button selector, decoration-sensitive text/mark
assertions, and a real duplicate view widget after a native cross-paragraph
Enter. The original terminal log is `artifacts/release-browser-597f5415.log`.

The renderer gave an empty text run and its following sibling ownership of the
same widget position. A nonfinal empty run now leaves that widget to its next
sibling; the final empty run still owns a trailing boundary. Source nodes and
marks remain intact. Fourteen regression cases cover both mapping sides,
leading/middle/trailing and all-empty runs, an adjacent atom and a hard break.
The corrected pre-repair fixture fails 12 cases and passes two controls; all
14 pass after the repair, together with 63 existing view/link/overlay checks.

The browser assertions read rendered document text independently of view-only
widgets and tolerate decoration-driven mark fragments. A negative control
requires genuinely authored `Remote` text to survive. The native range case
also requires exactly one widget and exact restored model text. All 12 recorded
checks pass across Chromium, Firefox and WebKit, including the previously
unreached cross-paragraph Enter/undo sequence. The new mid-edit screenshot and
final restored view received visual review. Recording configuration and results
are `artifacts/decoration-contract-browser-20261111.config.ts` and
`artifacts/empty-widget-browser-reviewed-20261111.log`.

The full `pnpm check` at `7961b966` passes 5,271 tests in 323 files plus the
build, API, package, Node/workerd, headless, format, framework type, performance
and retention gates. Initial new-fixture typing failures are preserved in the
preceding `acd27795` log. The final log is
`artifacts/release-check-7961b966.log`. The renderer adds 63 CommonJS bytes.
Aggregate capacity increases by 64 bytes, from 1,452,800 to 1,452,864 bytes;
the measured total is 1,452,853. Per-entry, ESM, CSS, latency and memory limits
are unchanged. Both original size failure and passing receipt are retained.

A 441-case diagnostic sweep contains cases not passed in the interrupted run,
including the new controls. Its selection is checked against the current
1,069-case non-display-clipboard plan and all 628 prior pass identities.
`artifacts/prepare-browser-remainder-20261111.py` documents the selection.
This is an iteration aid, not a clean full-matrix release run. Fresh complete
CI and separately serialized native clipboard evidence remain mandatory.

The remaining sweep terminates with 421 passes, 19 skips and one failure
(19.5 minutes). Its failed Android/Chrome-emulation journey never reaches the
focus or typing action: Chromium reports `net::ERR_NO_BUFFER_SPACE` loading
`src/pages/index.ts`, leaving `fountainBrowserTest` undefined. The test passes
three unchanged isolated runs. No assertion or runtime code changes in response.
The first-run failure remains a local infrastructure reliability limitation;
the reruns do not turn it into a clean matrix. The terminal log is
`artifacts/browser-remainder-7961b966.log`, the trace/context are in its matching
output directory, and the compact diagnostic is
`artifacts/browser-remainder-diagnostic-7961b966.json`. Actual mobile-Svelte
table and mobile-Vue task/toolbar screenshots received visual review. These
are emulated browser surfaces, not physical-device certification.

The separately serialized native clipboard batch passes all nine selected
Chromium and all nine Firefox workflows. Windows WebKit passes the outbound
copy/cut event-payload check, then fails three native-destination delivery
checks; the failure limit leaves five cases unrun. The batch exits nonzero
(19 passes, three failures). An independent native control records four of
four default-copy transfers and zero of eight event-authored transfers, including
plain text alone. That is consistent with the documented Windows WebKit
limitation, but does not certify these Fountain paths on Safari. No assertion
or skip policy changes. The same unchanged delivery checks remain mandatory
on CI's Linux display. Logs are `artifacts/native-clipboard-7961b966.log` and
`artifacts/native-clipboard-capability-windows-7961b966.jsonl`.

After the diagnostic runs finish, the reviewed seven-file metadata proposal
is applied locally: manifest `0.5.0-beta.1`, versioned changelog and matching
starter dependencies/guide/tests. `check-release.mjs --tag v0.5.0-beta.1` passes
against these real files, following the isolated-preview check. The original
proposal is `artifacts/beta-metadata-proposal-20261111.patch`; it is now an
applied historical receipt and must not be reapplied. The versioned candidate
requires fresh package/consumer and release CI validation. Publication, registry
verification and website deployment have not occurred for this candidate.

## Failure and rollback policy

npm versions are immutable. Do not overwrite or casually unpublish a bad
release. Stop approval while a package is staged. If a published release is
faulty, deprecate that exact version when appropriate, publish a corrected patch
through the full gate, and document affected data/API behavior. For a document
format defect, preserve original records and ship a tested forward repair; do
not destructively rewrite data without backups and concurrency checks.

GitHub Pages may be redeployed from a known-good commit, but documentation must
clearly identify the npm version it describes.

## Security support

The latest published beta minor receives security fixes. Older beta minors are
unsupported unless a release note explicitly extends their window. Reporting,
response expectations, supply-chain boundaries, and disclosure rules are in
[SECURITY.md](../SECURITY.md).
