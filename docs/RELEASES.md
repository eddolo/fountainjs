# Release and API stability policy

## Homepage live-export selection work — 2026-11-11

The source homepage caches its live export by document identity and format.
Selection-only changes no longer serialize an unchanged document. Nine native
typing/selection/undo journeys across three formats and three desktop engines
pass; output remains immediate for edits and exact after undo. The baseline
recorded 44 unnecessary Markdown exports (about 3.6 ms total on the small sample).
This is scoped host-work evidence, not a large-document or production speed claim.
The initial larger fixture exceeded the demo's configured character limit; the
refusal is resolved as expected policy. The later shorter 502-block fixture
passes nine source journeys within the same limit. The investigation found and
fixed false paste-success reporting: the additive `rejected` outcome is recorded
in the API snapshot and changelog. Three source and three compiled-site native
copy/paste journeys verify refusal, recovery, rich content and exact undo/redo.
The final full local `pnpm check` passes 5,291 tests/325 files and all package,
runtime, type, format, size and performance gates. Acceptance limits did not
change. Fresh hosted CI, final archive/adoption verification and publication
remain pending; the separate WebKit programmatic-clipboard failure is retained.
[Scope and remaining work](WEBSITE_BUILD_IDENTITY.md#homepage-export-work).

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
11. the recorded human release journeys, built production-subpath workflows
    and installed standalone starters pass in the required `recorded-ui` CI job, with recordings, snapshots and
    reports retained for review. Automated passes do not replace visual review.

Normal push/PR CI runs every constituent of `pnpm check`, including public API
snapshot review, Node/Worker smoke tests and the independent math-reference
oracle. `tests/release.test.ts` guards this command coverage against drift when
the local gate grows. Bun/Deno, browser, real Lean and package-consumer checks
remain additional jobs/steps. Command coverage is not evidence that an individual
gate adequately tests its claimed behavior, and the math oracle is not visual
rendering or whole-paper fidelity certification.

The independent `recorded-ui` runner executes the eight `pnpm audit:ui`
journeys, then `playwright.production.config.ts` builds the website and checks
starter downloads, rich image-caption import, offline equation HTML readers
and build/framework identity in Chromium, Firefox and WebKit at `/fountainjs/`
(30 production checks, headed on Linux Xvfb for native clipboard delivery). It then prepares the packed
candidate in three external starter projects and runs six built-consumer browser
journeys plus the Node conversion/probe checks.
[Standalone audit procedure](INSTALLED_STARTER_AUDIT.md). Rebuild-backed runs stay
sequential within that checkout and separate from the main browser runner.
All three evidence uploads run even after failure. The reusable CI called by the
release workflow includes this required job; actual hosted results remain
necessary before staging.

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

### Versioned local preflight at fc3aa39a

The local `0.5.0-beta.1` candidate passes the complete `pnpm check`: 5,271 tests
in 323 files, with the API/package/headless/format/framework type, latency,
memory and size gates. The real Lean 4.30.0 loopback verifies valid and invalid
proofs. Bun 1.4.4, Deno 2.9.6 and the production site build pass separately.
Logs use the `artifacts/*-fc3aa39a.log` suffix.

The packed checkpoint has 1,145 files and 4,882,691 bytes. Both general-entry
type analysis and the separate Angular ESM-only analysis pass. Publint exits
zero with its existing DOCX `.cjs` syntax-classification warning. The initial
type-analyzer `--pack` invocation cannot find `npm`; analysis succeeds against
the actual `pnpm pack` tarball instead, with the same entry/profile scopes.

A fresh consumer installs only this tarball outside the repository, with peer
auto-installation disabled and Node global search paths disabled. It proves
React, Yjs and jsdom cannot resolve, then passes ESM/CommonJS schema, extension,
transaction, exact unchanged Markdown and server HTML checks without browser
globals. An initial user-temp isolation assertion detects React installed in
an ancestor home directory; that failed receipt is retained, and the final
consumer runs under `C:/Temp` outside that ancestor. Version, archive hash and
consumer results are in `artifacts/release-preflight-fc3aa39a/receipt.json`.

Fresh browser batches then pass at the same versioned runtime: 48 public
default-Yjs checks, 24 startup/detached-draft checks, 21 migration-recovery
checks, and 108 compiled cursor/presence and retained-document checks. All
three desktop engines participate. The 108-case batch repeats 48 retained
cases; these are executions, not additive unique capability counts. Logs are
`artifacts/yjs-{default,startup,migration,presence}-fc3aa39a.log`.

The existing starter-download journey also passes against the production site
build in all three desktop engines. Nine actual downloaded ZIPs match source
files and depend on `0.5.0-beta.1`; narrow layout receives visual review.
The new preview harness initially omits the `/fountainjs/` base and fails
before finding the developer page. Correcting only its base configuration
allows the unchanged assertions to pass. The initial diagnostic is retained.
See `artifacts/playwright-starter-release-20261111.config.ts`,
`artifacts/starter-release-reviewed-fc3aa39a.log` and
`artifacts/starter-release-archives-fc3aa39a.json`.

This is a local package checkpoint, not the published artifact. Later packaged
documentation changes require a new archive/hash before staging. The previous
browser diagnostics retain their failures and scope. A clean complete
editor/mobile matrix, Linux display clipboard validation, hosted CI, npm
approval, registry installation and live-site checks
remain open.

### Subsequent full-matrix download diagnostic — 2026-11-11

The clean 1,069-case non-display-clipboard run at `af8401b3` encounters a
missing download after undo restores a 302-block virtual document. The run
is deliberately interrupted to investigate: its log contains 178 passes and
one failure, without a terminal aggregate. It is not release certification.
The first six directed media-range scenarios finish; the seventh times out
waiting for its twentieth download. No console error is recorded.

Two unchanged instrumented journeys pass serially and four pass with two
workers, each delivering all 24 files. A separate native control drops its
eleventh rapid Blob download; spacing that control by 200 ms delivers 24/24.
[Chromium's source](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/frame/local_frame.cc)
independently documents a ten-request burst throttle, but
the original failed journey reaches only three downloads in a sliding second.
The native control therefore does not establish the original cause. Its trace
frames show a viewport shift around the click; late virtual measurement/scroll
adjustment remains a hypothesis requiring a deterministic reproduction.

At the wording-only `e5a3fab4` checkpoint, the demos say a download was requested instead of claiming completion
after `anchor.click()`. All nine existing issue/task/DOCX workflows pass
across Chromium, Firefox and WebKit with unchanged delivery/content assertions.
All 190 emitted library JavaScript/CommonJS/CSS files are byte-identical to
the `fc3aa39a` package checkpoint; only demo wording changes. No input,
download, virtualization or test-acceptance algorithm is changed by this
wording repair. The unresolved delivery failure still blocks a clean matrix.

See `artifacts/download-delivery-audit-20261111.json`, the retained original
trace, `artifacts/download-status-browser-20261111.log`, and the independent
native/instrumented probes. This diagnostic does not waive full hosted CI or
the separate Windows WebKit clipboard limitation.

### Verified virtual host-control repair — 2026-11-11

A focused real-browser fixture reproduces the suspected class of failure
deterministically. It uses public `EditorView`, 300 paragraphs, real CSS
geometry and native mouse-down/up, while controlling only application RAF
delivery. A pending frame moves the external Export button by 48 pixels;
the click count stays zero. The independent non-virtual control passes.
No private renderer method or document mutation drives the reproduction.

The renderer now defers queued virtual viewport and measurement callbacks
while an interactive host control outside its mount is pressed. Pointer
release/cancel and window blur resume that work; destruction removes the
listeners and pending callbacks. Controls within the editor mount, including
its reorder UI, are excluded. Composed event paths recognize controls in open
Shadow DOM. That edge first fails in Chromium, Firefox and WebKit, then passes
after the event-path repair.

All 15 final recorded cases pass in the three desktop engines: non-virtual
control, press/release, pointer cancellation, window blur and open Shadow DOM.
The target stays still during the press, exactly one native release click
arrives, the 300-block model is unchanged, virtual rendering resumes and
teardown clears pending work. The earlier 33-case batch passes the original
eight-scenario issue export, task/DOCX handoffs, native block reordering,
toolbar traversal and 100,000-block IME/selection/copy. It precedes the final
composed-path refinement; the final 15-case batch repeats the ordinary modes.

The 23 existing virtualization unit checks pass. API review finds only five
private class members added in the two `EditorView` declaration files; all
450 declaration hashes are checked after updating those two snapshots. The
final repair adds 791 CommonJS bytes, measuring 1,453,644. Aggregate CJS
capacity increases by 1,024 bytes to 1,453,888; entry, ESM, CSS, latency and
retention limits stay unchanged. Both the original size failure and passing
receipt are retained. The repaired runtime is `07a2c8ac`; full source and
release gates must be refreshed before publication.

`playwright.virtual-host.config.ts` records this bounded preflight in CI; the
ordinary matrix repeats its assertions. Initial recording setup used an
unsupported describe-level video setting; its failure is retained and the
setting is moved to this configuration. A preceding broader run is interrupted
after recording metadata changes, then rerun with files frozen. Neither is
represented as a product failure or a clean matrix.

The compact audit, source/probes, negative/positive frame data and selected
recordings are versioned. The original 11 MB full-run trace remains local,
identified by SHA-256 in `artifacts/download-delivery-audit-20261111.json`.
Fresh complete browser/CI and package validation remain mandatory; focused
passes do not erase the original interrupted run.

### Repaired runtime integration checkpoint — 2026-11-11

At `024ff8fe`, `pnpm check` passes all 5,271 source tests in 323 files,
including build, API/package, Node/workerd, format, framework types, size,
performance and retention checks. The preceding run has two stale test
expectations: download-request wording and the ninth CI browser invocation.
Both are aligned without weakening delivery assertions; its 5,269 passes and
two failures remain recorded. The subsequent complete source gate exits zero.

The fresh `ff11e640` tarball contains 1,145 files and is 4,887,051 bytes. The
only changes from that revision to `024ff8fe` are two unpackaged test files.
Publint passes with its existing DOCX classification warning; both packed type
analyses pass. A clean consumer outside the repository verifies ESM/CommonJS
schema, extensions, transactions, exact Markdown and server HTML with no
browser globals or resolvable React, Yjs or jsdom. The archive receipt records
its SHA-512. Repack after the final packaged-documentation changes before staging.

The complete local editor/mobile matrix terminates after 42.9 minutes:

| Project | Passed | Existing skips | Failed |
| --- | ---: | ---: | ---: |
| Chromium | 342 | 0 | 0 |
| Firefox | 331 | 9 | 2 |
| WebKit | 332 | 10 | 0 |
| Mobile Chrome emulation | 29 | 0 | 0 |
| Mobile Safari emulation | 29 | 0 | 0 |
| Total | 1,063 | 19 | 2 |

The two failures are Firefox's delayed collaboration-module load and failed-load
recovery journeys. Their traces show browser launches around 20–22 seconds and
page creation around 20–24 seconds. Both exact cases pass with one worker,
unchanged assertions and unchanged timeouts (4.4 and 3.3 seconds). The serial
trace records a 480 ms browser launch and first-page creation of 599 ms.
This supports a transient setup/contention hypothesis but does not prove its
cause. The failed full run is retained and is not reported as a clean matrix.
No new skip, retry or timeout allowance is introduced.

Direct visual review of five saved screenshots covers recovered peer content,
merged-table resizing, mobile-width task-reader navigation, and table indentation
in editor/page preview. These captured states do not certify physical devices,
assistive technology or independent Word/PDF fidelity.

Evidence: `artifacts/release-checkpoint-024ff8fe.json`,
`artifacts/release-check-024ff8fe.log`,
`artifacts/release-preflight-ff11e640/receipt.json`,
`artifacts/release-browser-024ff8fe.log`,
`artifacts/firefox-lazy-serial-024ff8fe.log`,
`artifacts/firefox-lazy-startup-diagnostic-024ff8fe.json`, and
`artifacts/release-visual-review-024ff8fe.json`. Large raw reports/traces remain
local and are identified by hashes in the compact checkpoint.

GitHub CLI remains signed out at this checkpoint. Hosted CI, including the
unchanged Linux display-backed clipboard batch, is still required before
tagging/staging. Nothing from this candidate has been published or deployed.

### Supplementary release validation — 2026-11-11

At source checkpoint `b03ad598`, the runtime remains `024ff8fe`. Fresh checks
pass Lean 4.30.0 with valid/invalid proofs, Bun 1.4.4, Deno 2.9.6, and the
production-site build. The unchanged recorded browser batches pass:

| Batch | Passed | Scope |
| --- | ---: | --- |
| Default Yjs | 48 | Native offline editing, author history, room replacement and reopening. |
| Startup recovery | 24 | Incomplete/out-of-order data, restored drafts and cancelled admission. |
| Migration recovery | 21 | Reviewed drafts, lost replies, reloads and blocked local storage. |
| Compiled presence/retained documents | 108 | Native grapheme/bidi navigation, passive overlays, clipping, undo and synchronization. |
| Production starter downloads | 3 | Nine real ZIPs checked against source and candidate version across three engines. |

The 201 collaboration executions include 48 repeated retained-adapter cases;
they are not 201 distinct capabilities. Direct screenshot review covers a
text/media selection, matching mixed-direction reference/presence editors,
and the narrow WebKit Node starter card. These are captured states, not
continuous-video, physical-device or assistive-technology certification.

The complete Firefox project also passes with one worker: **333 passes, nine
existing skips, zero failures**, in 27.2 minutes. It uses the same assertions,
timeouts and native-display clipboard exclusion as the earlier full matrix;
there are no retries. All five projects consequently have failure-free runs
at the same runtime revision, collected across the original matrix and the
complete Firefox follow-up. The original two-worker run still records its two
failures. Serial scheduling is verified evidence, not proof of their root
cause or a waiver of fresh hosted CI.

All 1,008 built distribution files match the tested `2d55f329` archive byte
for byte after these checks. The compact receipt hashes the raw reports and
selected local screenshots: `artifacts/release-supplement-b03ad598.json`.
Logs use the matching `*-b03ad598.log` names. The refreshed complete Firefox
log is `artifacts/firefox-complete-serial-b03ad598.log`.

Read-only remote inspection confirms draft PR #22 remains open at
`1a9e1640ef8d2fd6f955baeac5b078ba9b0db859`, an ancestor of this candidate.
The proposed stacked review has 2,144 changed files at this checkpoint and no
new Git blob over 100 MiB. GitHub CLI remains signed out. No remote branch,
tag, release, npm stage or deployment is created by this validation.

Repack after these packaged-documentation updates. Hosted CI, including
the unchanged Linux display-backed clipboard workflows, remains mandatory.

### Recorded release journeys — 2026-11-11

The fresh recorded audit finds a real demo regression: imported image captions
are preserved as editable inline content, but the headless preview only reads
the legacy caption attribute and displays alt text instead. `1e86e5e0` reads
caption children before the legacy/alt fallback. The unchanged caption check
then passes, and the ordinary three-engine browser journey now checks it too.
The first attempted use of the node's general `textContent` instead returns
its deliberate `[Image: …]` fallback; that failed repair is retained separately.

The audit command had also grown to collect 297 tests in 94 manual files with
different fixture servers. Its original two files are confirmed at `6c4b64d4`.
`pnpm audit:ui` now explicitly selects those files and their eight release
journeys. The generic recording config, normal browser matrix and CI commands
stay unchanged. A new production-specific fixture does not leak into that
selection.

Two audit expectations need separate correction. The DOCX visual fixture now
requires its six exact existing informational codes/severities/paths rather
than an empty report. A script-free native iframe control produces zero
console errors without tracing and the same three sandbox-injection messages
with Playwright DOM tracing. The recorded conversion journey requires exactly
those messages and two script-free frames with empty sandbox permissions;
additional errors fail. No script permission or timeout is added.

Validation passes 22 focused unit checks, all eight recorded journeys, three
desktop source-server caption journeys, and three production-caption journeys
at `/fountainjs/`. The latter verifies real PNG decoding and document/visible
caption retention. Its initial reused harness failed in all three engines
before the test body because its root-only `browser-tests.html` hook ignored
the deployment subpath; that failed run remains recorded. The standalone
production journey fixes fixture ownership without changing those assertions.
The complete `pnpm check` at `1e86e5e0` passes all 5,271 tests in 323 files,
alongside package/API/runtime/type/format/size/performance/retention gates.
Root TypeScript checking also passes after adding the production-only test.
All 1,008 emitted distribution files still match the previous sealed archive;
no library API, format, budget or performance acceptance limit changes.

The final recordings contain 34 stage captures and eight videos. Eight
full-resolution captures and twelve overview sheets sampled at 2 fps are
visually reviewed. Captures now target the actual image/caption, both DOCX
panes and each paged-preview sheet. Continuous playback is not claimed.
The independent DOCX viewer visibly omits table-header labels and changes
spacing; its known limitation is retained rather than called pixel parity.

Both pages of the final PDF are reviewed using bundled PDFium 5.14.0 and
Poppler 26.07.0 from runtime `26-1110`: headers, body, table, footnote and manual
break content appear. System PDFium 5.5.0 and Poppler from the older `26-1104`
bundle omit some repeated header glyphs in batch rendering, despite retaining
the text; older Poppler renders page two correctly by itself. The exact
dependency-level cause is unproven. Preserve that reader/runtime disagreement;
this sample is not universal PDF-reader or document fidelity certification.

The compact report is `artifacts/manual-ui-release-audit-20261111.json`.
It identifies successful/failed logs, native controls, screenshots, video
samples, the PDF and hashes of local raw evidence. Fresh combined hosted CI,
Linux display clipboard checks, final package sealing, maintainer approval
and deployment remain pending. GitHub CLI still reports signed out.

### Research-document CI coverage — 2026-11-11

The browser registration audit finds 298 manual test identities, 77 directly
registered in required CI and 221 without the same file/line/title identity.
This is not a capability-coverage percentage: many remaining wrappers call the
same helpers already executed by the main matrix. Dynamic imports matter too.
The local inventory and static shared-source review are retained under
`artifacts/browser-ci-coverage-20261111/`; individual unresolved fixtures need
review before any additional promotion.

One concrete gap is closed: the actual Word research-paper workflow now runs
in all three main desktop projects. Its shared journey preserves every prior
interaction and assertion: caption and equation edits/undo, table cell edits,
stationary/active resizing, list Enter/deletion/history, actual JSON/HTML/DOCX
downloads, decoded embedded images and DOCX reopening. Attempt-specific output
paths replace the old fixed directory so repeats and CI retries cannot collide.
CI uploads its evidence on success and failure, including videos and traces.

Six local CI-mode executions pass (two per Chromium, Firefox and WebKit), with
one worker, no retries, no skips or flakes. Fourteen release-policy tests, root
TypeScript and parsed workflow checks pass. All 1,008 distribution files remain
byte-identical to the sealed `19f4dca7` archive. Six captured states receive
visual review, including imported/reopened DOCX viewports and the full HTML
reader. The HTML reader still shows equation source and literal page-template
fallbacks; this is retention/editing coverage, not native Word or pixel-fidelity
certification. The report is
`artifacts/docx-research-ci-integration-20261111.json`.

No library/API/budget changes or new complete source/matrix run are claimed.
Hosted Linux CI, authentication and final package/publication checks remain
pending. The packaged docs have changed since the sealed archive.

### Installed standalone starters — 2026-11-11

The earlier starter runner needed manually installed consumer projects and was
not required by CI. `pnpm audit:starters:prepare` now packs the candidate into a
fresh external directory, installs plain DOM, React and Node projects, checks
all 1,008 installed distribution files against the build and verifies unchanged
starter source except for the explicit local-tarball dependency substitution.
The browser starters build and run using their own Vite without repository
aliases. The existing editing/history/JSON journeys now run in required CI,
with uncaught application errors checked and evidence uploaded on failure too.

Six final CI-mode browser journeys pass across Chromium, Firefox and WebKit,
with one worker and no retries. Three production-subpath download journeys also
pass, checking all nine ZIPs against source. The Node starter passes JSON,
exact untouched Markdown, HTML export/reimport and an explicit no-DOM probe
with React/React DOM/Yjs/jsdom resolution blocked. An initial assertion that
React was unresolvable failed because this machine has an ancestor-level React
installation; the corrected instrumentation blocks those imports before the
package and CLI load. It does not change the library's optional peer behavior.

Visual review detects serif shell fonts in Windows WebKit. An independent
native control reproduces the `system-ui`-only fallback; adding `sans-serif`
to both starter pages corrects it, confirmed in the final captures. Fourteen
release-policy tests, root/configuration TypeScript and workflow checks pass.
Existing Vite chunk warnings remain visible. No library/API/acceptance-limit
changes or new full-source/matrix pass are claimed. Local tools are Node
24.22.1/pnpm 11.25.0; required hosted CI pins Node 24/pnpm 11.19.0 and has not
run yet. This proves local archive consumption, not npm CLI or publication.

[Procedure and boundaries](INSTALLED_STARTER_AUDIT.md). The compact report is
`artifacts/installed-starter-ci-integration-20261111.json`; raw evidence is
under `artifacts/installed-starters/`. Final package sealing, combined hosted
CI, registry staging/approval and deployment remain pending.

### Offline equation HTML projection — 2026-11-11

The local Conversion Lab now renders supported equations in its HTML download
using offline native MathML, retaining original TeX/labels/semantic metadata.
The option can be disabled for the original source-only output; changing it
invalidates the old round-trip result. Unsupported/blocked commands and bounded
host rendering limits retain source and report their paths. This changes the
example host, not the library HTML contract or renderer dependencies.
[Contract and limits](CONVERSION_LAB.md#standalone-html-equations).

Fifty focused unit/release-policy checks, root TypeScript and six desktop
journeys pass. Three of those journeys exercise real edits, rendered/source-only
downloads, visible native fraction layout, no HTTP(S) requests and actual file
reopening; three rerun the original Word-paper workflow. An initial selector
error is corrected before these passes. An independent plain-file/MathML
control reproduces Windows WebKit’s failure with Playwright’s offline flag;
the final file-reader check blocks all HTTP(S) traffic instead, without skipping
WebKit or changing its rendering assertions. Four captured states receive
visual review. Browser-native fonts differ; pixel parity is not claimed.

All 1,008 distribution files remain identical to the sealed `19f4dca7` library.
No API, bundle or performance acceptance limit changes. The new journey and
always-upload evidence are wired into CI. The compact report is
`artifacts/html-math-export-integration-20261111.json`. A new full-source check,
the complete matrix, production build, final archive refresh and hosted release
checks remain pending; the previous full-source checkpoint remains `1e86e5e0`.

### Website identity and complete local gate — 2026-11-11

`pnpm check` completes at `e15335c7`: all 5,279 tests in 323 files, package/API,
Node/workerd, headless, conformance, interoperability, type, size, performance
and retention checks pass. The unit phase takes 111.85 seconds; this is not a
performance comparison. Library distribution remains byte-identical to the
sealed `19f4dca7` archive. New website-only work adds five focused metadata tests;
no claim is made that a subsequent full 5,284-test run has completed.

Source `b1cbdcf6` adds generated build labels and JSON metadata, reconciles
framework copy and replaces the misleading npm-package wording in the sample.
Source `72174160` additionally checks compiled equation exports and uses the
non-opening input-audit server for recordings. Fifteen production checks pass
against that clean revision. They include all 20 public pages without JavaScript,
390px wrapping, print exclusion, actual Git identity, framework copy, native
HTML math downloads/reopening, starter ZIPs and rich image-caption import.
Metadata records `0.5.0-beta.1`, clean source `72174160a39b`, and build-time npm
`0.4.0-beta.2`; it does not equate matching versions with identical artifacts.

Nineteen metadata/release-policy checks and root/configuration TypeScript pass.
Six ordinary desktop clipboard-history/AI-review checks pass after the sample
copy changes. All eight recorded release journeys also pass in CI mode. These
batches overlap; they are not additional feature counts. Captured narrow build
labels and compiled equation readers receive direct visual review. No continuous
video, new physical-device, assistive-technology or native Word certification
is claimed. The earlier empty-root assertion is removed so future prerendering
can add marketing content without breaking the no-JavaScript identity contract.

[Website contract and remaining review findings](WEBSITE_BUILD_IDENTITY.md).
The compact report is `artifacts/website-identity-integration-20261111.json`.
The five-project combined hosted matrix, npm-CLI/registry consumption, final
package sealing, staging/approval and deployment remain pending. The published
site and npm package are not updated by these local commits.

### Homepage copy and contrast — 2026-11-11

Source `ef634988` adds caught clipboard failures, a labelled read-only/manual
copy route, snapshot-bound success, serialized pending requests and format
pressed state. Named small-text accent/outline/export colors are repaired.
The two original regression cases fail before the repair; the complete recovery,
race and contrast batch then passes 12/12 across Chromium/Firefox/WebKit. Eleven
computed solid-surface targets per engine now have a minimum contrast of 5.15:1.

An added unmocked clipboard-API positive case exposes separate platform results.
Chromium's independent control initially denies write permission even with focus
and user activation. Granting clipboard-write in the positive-path test makes
that case pass; rejection tests remain. Windows headless WebKit reports successful
API writing but native keyboard paste is empty in both Fountain and an independent
plain HTML control. The final source batch is **14 passes, one failure**, and
production is **29 passes, one failure**. The WebKit assertion is retained
unchanged, with no skip, xfail or retries. The browser/OS bridge cause is not
established by these observations.

Required CI now places the nine new native-copy executions in the existing
serialized Linux display batch and runs all production checks headed on Xvfb.
Collection proves 36 display and 1,096 remaining headless executions form a
disjoint, complete 1,132-case union; these are collection counts, not passes.
Nineteen release/metadata policy checks and root TypeScript pass. All 1,008 library
files remain identical to the sealed archive, with no API or acceptance-limit
changes. Two recovery captures receive direct visual review. The compact report
is `artifacts/site-copy-contrast-integration-20261111.json`.

[Copy contract and scope](WEBSITE_BUILD_IDENTITY.md#homepage-copy-and-text-contrast).
Fresh headed Linux CI, the current combined revision gates and final publication
checks remain pending. The local failed native positive case is not waived for
release; source/production pass counts above remain explicit.

### Runtime editability and actual Vue 2 bridge — 2026-11-11

The local runtime adds `Editor.setEditable(boolean)` without replacing document,
selection or undo history. The DOM view retains its outer element, refreshes
NodeViews and task/drag controls, updates managed read-only accessibility state,
and discards unfinished composition. Read-only native keys and history commands
cannot edit the document; explicit host/remote transactions remain possible.
Mode changes rejected before commit retain the prior mode. Mode changes inside
a command batch are refused to prevent leaking state across a batch rollback.

The complete local `pnpm check` passes **5,300 tests in 327 files**, plus all
existing build/API/package, server/headless, format, type, size, performance and
retention gates. The first full run exposed a read-only source-region scrolling
regression; preserving the existing specialized code-region key path repairs it,
with the original assertion unchanged. Three final recorded native mode journeys
pass in Chromium, Firefox and WebKit. Two captured states receive visual review.
Synthetic composition coverage does not certify physical IME behavior.

The isolated real Vue 2.7.16 component mounts the public package build and keeps
history across mode switches and view destruction/remount. A refused read-only
change removes the surface, emits an error, and can recover. Windows results are
**five passes, one failure**: WebKit's copy event writes 19 expected characters,
but the external native paste receives none. A separate plain HTML control
reproduces this result. Under Ubuntu 24.04/Playwright 1.62.1 WebKit on explicit
X11/Xvfb, **both component cases pass**, with exactly 19 characters reaching the
external textarea. The independent control receives its exact 30 characters too.
The initial WSL display attempts time out on the first click; accelerated-
compositing disablement alone does not help, while selecting X11 instead of the
available WSL Wayland display gives the recorded pass. Failures remain recorded.
No native-copy equality, timeout, retry or skip was weakened. The hosted required
job retains all six component executions and always uploads recordings/evidence.

Four public declaration hashes are refreshed for the additive API and internal
view fields. Only the aggregate CommonJS raw ceiling increases, 1419.8125 to
1421.25 KiB, for measured 1421.1 KiB output. Entry, ESM, CSS, latency and heap
limits are unchanged. Vue 2/compiler dependencies live only in private integration
tooling. The earlier sealed archive is stale because library runtime changed.

This is an integration primitive, not a running GitLab replacement. Its actual
Markdown/services/extensions, authenticated persistence, uploads, collaboration
and complete application workflows still need implementation and verification.
Fresh packed consumers, the combined hosted matrix and publication remain open.
[Integration contract](../integrations/gitlab/README.md).
Compact evidence: `artifacts/editability-integration-20261111.json`.

### GitLab host document lifecycle — 2026-11-11

The private integration now has a serialized-content controller using the real
public Fountain package. Initial/reopened loads reset local undo; templates are
undoable; root document attributes survive replacement/undo/redo. Actual user
document changes notify the host while loads, caret changes and mode updates do
not. Concurrent loads cancel older results. Intervening typing, including typing
followed by undo, causes a conflict instead of overwriting the user's work.
Disposal cancels pending rendering and releases subscriptions without destroying
the host-owned editor. Uncoordinated loads into collaboration sessions are
refused pending the actual session seeding/replacement adapter.

Eleven focused package-backed Node cases pass without jsdom. The full unit suite
passes **5,311 tests in 328 files**, and root TypeScript passes. The expanded
compiled Vue 2 profile finishes **eight passes/one retained Windows WebKit
clipboard failure**; explicit X11/Xvfb Linux WebKit passes **all three cases**.
The new load/edit/template/undo/reopen journey itself passes in all desktop
engines. An additional Firefox capture run passes; recorded Windows/Linux frames
and detailed heading/quote states receive visual review. Overlapping runs are
verification, not additive feature counts. Assertions, retries and timeouts
remain unchanged. Required CI automatically includes the new journey.

The host codec is explicitly required. The fixture uses the real ordinary
Fountain Markdown importer/exporter, which does not establish GitLab dialect or
service compatibility. The source inventory now hashes eight immutable upstream
files and lists the real document/deserializer/asset-service imports and methods.
GitLab application, backend authorization/persistence/uploads, collaboration and
its full editing features are still unverified/unimplemented integration work.

No library runtime, package API, dependency or acceptance-limit change in this
follow-up. The complete `pnpm check` checkpoint remains the preceding runtime
repair, not a newly claimed repeat of every gate. Fresh packaging/consumers and
hosted release verification remain required.
[Controller scope](../integrations/gitlab/README.md#serialized-content-lifecycle).
Evidence: `artifacts/gitlab-serialized-content-integration-20261111.json`.

### GitLab rendered-resource/reference boundary — 2026-11-11

The private asset resolver implements the actual host callback boundary for
canonical/display URLs, iframe source/provider data, placeholders, expanded
references, quick-action explanations and diagram image URLs. It retains safe
canonical fallbacks, uses the public URL gate, and delegates label localization
to the host. Inert parse5 inspection has no DOM, layout, script execution or
resource-loading behavior. The resolver has per-context LRU entry/UTF-8 string
budgets, retryable failures, and cancellation/disposal including pending work
already evicted from cache. These are not total-heap or concurrency guarantees.

Thirty-seven focused Node cases pass using twelve immutable upstream HTML
fixtures with recorded source/license hashes and retained copyright notice.
Combined resolver/lifecycle checks pass 48 cases; root TypeScript passes. The
complete unit suite passes **5,348 tests in 329 files**. This does not claim a
new complete `pnpm check` pipeline or hosted release run. The
actual private resolver builds as browser ESM at 196,701 raw bytes, including
parse5 and the URL gate. That optional prototype is not added to the public
Fountain runtime or counted as a browser human-use journey. No library API,
runtime, dependency or acceptance-limit changes in this step.

An unauthenticated request to GitLab.com's public Markdown API returns 401.
[GitLab's API contract](https://docs.gitlab.com/api/markdown/) requires
authentication. The actual host preview callback also provides quick-action
metadata; a public REST response is not assumed equivalent. The fixture-based
checks are not live-service, authorization, upload, document-conversion or
full-application evidence. Authenticated host integration, the actual dialect
codec, source retention and complete product workflows remain outstanding.

[Resolver scope](../integrations/gitlab/README.md#rendered-resource-and-reference-resolver).
Evidence: `artifacts/gitlab-asset-resolver-integration-20261111.json` and
`artifacts/gitlab-live-render-probe-20261111.json`.

### External source capture, GitLab codec and native atom caret — 2026-11-11

The public additive `MarkdownSourceSnapshot.capture(source, document)` validates
an externally converted root and binds exact source without reparsing another
dialect into Fountain's AST. It does not infer frontmatter/block positions or
promise unchanged-block retention after edits. Four focused cases cover an
external reference node, canonical edited output, invalid roots and live versus
authored caret paragraphs. Actual local ESM/CommonJS public-package imports pass
in Node without browser globals or jsdom. Two declaration hashes change.

The private GitLab codec preserves original reference/placeholder tokens,
canonical image/link destinations, nested task state and tested GitLab HTML mark
syntax. Its corpus expands to 22 pinned upstream HTML literals. Known unhandled
expansions and lossy edited exports produce typed issues with original source
retained on import failure. This is a partial dialect adapter, not complete GFM,
authenticated asset/service, block-source-retention or application verification.
The [conversion matrix](../integrations/gitlab/README.md#gitlab-rendered-document-codec)
keeps missing math/diagram/frontmatter/review/footnote/embed/TOC/quick-action and
mixed-task workflows explicit instead of removing them from the requirement.

Native use exposes a real engine defect: End after an inline atom redirects
typing to preceding text in all three engines. Structural boundary mapping
repairs Chromium/WebKit; an additional exact-display-edge mapping repairs
Firefox's caret inside the uneditable atom. Five source regressions retain
native-control selection and fail on the relevant old paths. Three-engine
native typing, reference deletion and undo pass. Visual review also exposes
blue-on-blue label text; a contrasting foreground repairs it while retaining
the imported background. The expanded Windows profile is 11 passes/one retained
WebKit native-copy failure, and Linux X11/Xvfb WebKit passes all four journeys.
These are compiled private fixture journeys, not a running GitLab application.

The first complete pipeline reaches 5,388 passes/one failure because the new
invalid-source hint no longer contains an existing error-message contract. The
message prefix is restored while retaining the new API hint; the original
security/provenance test is unchanged, and the 130-case focused repair passes.
The failed pipeline is retained alongside the subsequent final run.

The final complete `pnpm check` passes **5,389 tests in 332 files** and every
package/API, Node/workerd, headless, conformance/interoperability, framework type,
size, performance and retention gate. A fresh compiled three-engine reference
journey also passes after the message-only compatibility correction. Additional
edit/delete/restore captures receive visual review. The broader Windows/Linux
profiles above overlap this targeted follow-up and are not additive feature
counts. The original source expectations, native clipboard assertion and test
timeouts remain intact.

The measured CJS aggregate is 1,455,787 bytes (+571); its ceiling changes from
1421.25 to 1421.75 KiB (+512 bytes, within prior remaining headroom). No entry,
ESM, CSS, latency, heap or semantic/reference ceiling changes. Earlier archives
are stale. Fresh packed consumers, exact combined hosted checks and publication
remain required. Evidence: `artifacts/gitlab-codec-integration-20261111.json`.

### GitLab export-error and reference-navigation recovery — 2026-11-11

The integration controller previously let codec serialization exceptions escape
from its change subscriber after an edit had already applied. Later subscribers,
including a mounted view, could miss the update. It now sends discriminated
`ready` or `error` events. Error events contain no stale Markdown. The host must
block submission, retain the current document and allow Undo/retry;
`getSerializedContent()` still refuses an unrepresentable document. Loads stay
silent; the caller refreshes its serialized/error state after a successful load.

The recorded native journey also finds that ordinary clicks on an uneditable
reference link can leave the entire draft. The scoped GitLab view plugin
prevents that default while editing, retaining intentional modified/reader
navigation. The unchanged native recovery assertions then pass across all three
desktop engines. No engine runtime, public npm API, declaration hash, dependency
or acceptance limit changes in this follow-up.

Verification: 54 focused cases, root TypeScript, nine compiled Windows journeys
and all five Linux WebKit/Xvfb journeys pass. The full unit run passes 5,393
tests/333 files before the seven new interaction cases; its scope is recorded
rather than claiming a fresh combined full package gate. Firefox refusal/undo/
reload frames receive visual review, and the journey videos are retained.
The first Windows run's three navigation failures and one Firefox teardown
timeout remain evidence; no expectations/timeouts are weakened. The full GitLab
application, actual save/permissions/services, source-mode recovery and the
other flagship products remain unfinished. Evidence:
`artifacts/gitlab-export-recovery-20261111.json`.

### GitLab source-backed math integration — 2026-11-12

The private GitLab adapter now reuses native Fountain math nodes/source controls
for tested dollar, legacy-backtick, inline-display and fenced math, with explicit
syntax attributes. It recovers TeX from a rendered KaTeX annotation rather than
copying visual glyph text. Pure Node import/export does not create a DOM or
reparse the document through another Markdown dialect. Existing host-supplied
math views/renderers remain usable; the native fixture supplies denied-trust
KaTeX and verifies real formula editing, second insertion, history and read-only
behavior. This is not full LaTeX-project import or live GitLab service evidence.

The pinned upstream extraction records ten Markdown/HTML rows, one rendered
KaTeX fixture and five source hashes. Tests cover unrelated edits, math source
changes/history, raw HTML-looking source, the digit-boundary delimiter fallback,
longer block fences, raw/rendered wrapper distinctions, malformed input and
explicit loss reporting. Accessible math descriptions remain in the model and require a retained representation
for edited GitLab export. Delimiter collisions and table-sensitive math source
are refused rather than emitting corrupt Markdown.

Initial failures are retained: eighteen of twenty initial cases fail before implementation;
a foreign-schema test setup corrected by using its actual EditorState; the
Playwright JSON fixture import missing its required import attribute; and a
Chromium attempt to click a pointer-transparent output child corrected to click
the actual math atom. Native assertions and timeouts remain unchanged.

The final complete unit suite passes **5,437 tests in 335 files**; 91 focused
cases (including 37 math cases) and root TypeScript pass. Fifteen compiled
Windows cases pass before the final annotation guards; three current targeted
math journeys then pass in Chromium/Firefox/WebKit. All six current Linux
WebKit/Xvfb journeys pass, including native external copy. Targeted math cases
overlap the broader profile. The earlier Windows native-copy failure is retained
outside that fifteen-case profile. Final Firefox inline/display/block frames and
a Linux block frame receive visual review; recordings are retained. This is not
a refreshed combined full package/hosted release gate.

No shipped engine runtime, npm API, dependency, declaration hash or acceptance
limit changes. Full application integration, remaining GitLab dialect adapters,
fresh packed consumers and combined hosted CI remain required. Evidence:
`artifacts/gitlab-math-integration-20261112.json`.

### GitLab rich-to-Markdown handoff — 2026-11-12

The prepared patch changes GitLab's actual host/component source at the pinned
revision. Its observer is debounced; the parent must read the current serialized
document before unmounting the rich editor, rather than relying on cached
Markdown. Valid content, including empty content, is published first. Readiness/
conversion failures retain the rich document and previous draft. Restored-mode
preferences use the same guard. The original child checks loading, composition
and unapplied source replacement. The Fountain Vue surface provides the same
handoff interface through a caller-owned reader and native composition tracking.

The full local unit suite passes **5,452 tests in 336 files**, with fifteen
handoff cases and thirty focused passes. Root types pass. The selected-method
baseline has six failures/three passes before the patch; source changes are
reviewable in `integrations/gitlab/patches/0001-guard-markdown-handoff.patch`.
Its digest binds the test fixture to that patch. Forward/reverse application
checks pass, two actual SFC templates compile in the isolated Vue 2 compiler,
and six new upstream Jest cases parse. Those upstream suites are not executed.
Capture also refuses an unpatched baseline without changing audit outputs.

Twenty-four broader Windows journeys pass, excluding the retained external-copy
failure. Nine final handoff journeys then pass across Chromium/Firefox/WebKit,
and all nine current Linux WebKit/Xvfb component journeys pass. They overlap;
composition cases use synthetic events on root/native math controls. Source,
reopen, refusal and undo frames receive visual review and videos are retained.
These are isolated component/selected-host-method journeys, not the full GitLab
application. The checkout has four intentional uncommitted source/spec edits at
the original HEAD; the main repository retains their reproducible patch.

This does not certify form/AJAX submission safety, real authenticated services,
storage, permissions, collaboration or full product readiness. Engine runtime,
public npm API and capacity limits are unchanged. The only whitespace-rule
addition treats unified-patch context prefixes as file-format data; actual
upstream source whitespace checks remain enforced. Fresh package/hosted release
gates and publication remain required. Evidence:
`artifacts/gitlab-handoff-integration-20261112.json`.

### GitLab current-document submission — 2026-11-12

The cumulative prepared source patch now reads current values through the
actual Markdown facade and flushes native form fields synchronously. The legacy
handler checks the fresh hidden-input/textarea value, then revalidates after its
asynchronous sensitive-token confirmation. Refused conversion/composition,
changed content and duplicate pending attempts stop transport. Cancelled/failed
attempts retain the safe draft; conversion refusal cannot restore stale cached
text over newer work. Submit-button clicks no longer clear drafts prematurely.
Explicit discard controls keep their previous behavior. The private first-party
submission helper is vendored unchanged into the pinned upstream application.

The complete local unit suite passes **5,472 tests in 338 files**, including 35
focused handoff/submission cases. Root types pass. The earlier paused full run
was deliberately interrupted; the resumed run completes successfully. The final
Windows profile passes 33 journeys across desktop engines, excluding the retained
external-copy failure. All 12 current Linux WebKit/Xvfb component journeys pass.
The profiles overlap. Refusal and undo-recovery frames receive visual review;
videos are retained. Composition events are synthetic. The browser transport
observer captures actual FormData locally, not an authenticated GitLab request.

The patch applies against a separate clean index at the original source pin and
in reverse against the edited checkout. Two SFC templates compile and three
upstream Jest files parse. Upstream suites are not executed. Custom AJAX handlers
must adopt the fresh-value/prepare contract and confirm acceptance before cleanup;
handlers bypassing it and native submit remain open integration work. Native
navigation initiation does not establish server acceptance. Auth/storage,
permissions and full product/release gates remain outstanding.

A digest-pinned real GitLab baseline Compose environment is prepared separately
from the `19.6.0-pre` source audit. Its packaged version is `19.5.3-ce.0`; matching
the replacement source/build remains required. It is not a shipped replacement
or a production deployment. No engine runtime, public npm API, dependency,
capacity limit or parity-row changes. Evidence:
`artifacts/gitlab-submission-integration-20261112.json`.

### Real GitLab baseline and upstream source suites — 2026-11-12

The isolated Linux Docker environment uses Community Edition `19.5.3`, pinned to
its amd64 manifest digest and matched to official source commit
`0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf`. The native Linux Chromium audit uses
normal web authentication and real GitLab HTTP APIs/storage. A private project,
uploaded PNG, rich issue edit, UI save, reopen and anonymous denial pass. Exact
saved server text, the authenticated session and the image survive a real
container restart. Screenshots wait for the actual image URL and KaTeX rendering
before visual review. The original table separator is canonicalized on save.
One original workflow does not certify all GitLab capabilities or Fountain.

The official source's original three selected Jest suites pass 160 cases. The
matching prepared host patch passes 168 cases under that same configuration and
installed dependency patches. Executing those suites exposed undefined optional
alert actions in the new error state, failed render requests in unit setup and
a nonreactive default-mode setting applied after mount. Optional actions are
guarded and valid unit setup is explicit. Assertions, console policy and test
timeouts remain enforced. A separate cumulative patch is retained for this
release; the earlier development-pin capture is not claimed as an executed suite.
All eight edited release-source files pass the real upstream Prettier/Tailwind
and ESLint checks. Loading coverage uses the actual Markdown prop/render promise;
technical errors use codes with translated host alerts, and restored-mode calls
retain a consistently awaited contract.

The refreshed complete Fountain unit run passes 5,472 tests/338 files and the
35 focused cases pass. The application image still serves its original frontend;
neither the source patch nor Fountain is deployed into it. Full component,
toolbars, dialect/service adapters, MR/wiki/discussion workflows, concurrent
users and broader product checks remain required. No shipped engine/API,
capacity-limit or parity-row changes. The test instance is stopped afterward;
its own volumes retain the records and no credential/session-state file is
committed. Current evidence:
`artifacts/gitlab-product-integration-20261112.json` and
`artifacts/gitlab-product-baseline-20261112/report.json`.

### Native GitLab service and rebuilt host deployment — 2026-11-12

The matching source's full Rspack production build succeeds. A read-only frontend
override selects its actual Rspack manifest through GitLab's Rails environment;
the packaged default remains available for rollback. The prepared-host audit
records guard-containing script digests, performs real rich/source/rich handoff,
UI save/reopen, anonymous denial and a restart. Its final run passes with reviewed
image/math output. Earlier post-restart image-decode failures remain unresolved;
the passing rerun is not a claim that their cause is fixed.

A private native document service composes Fountain's model, starter extensions,
math, GitLab codec, asset resolver and lifecycle. Current-value reads block
unloaded/pending/failed replacement state; recovery preserves both visible work
and rejected source. Superseded responses cannot overwrite newer loads, history
retains template/reopen behavior and host observer failures do not interrupt later
editor subscribers. Unsupported legacy options/providers are explicit errors.

The self-contained Node/native Chromium audit uploads its own fixture, discovers
GitLab's preview endpoint through GraphQL, imports real HTML into Fountain without
a fake DOM, preserves untouched source exactly, edits with native transactions,
saves through real authenticated APIs, reimports and visually reviews the result
in GitLab. It passes with source/runtime hashes and a retained recording. This
does not mount Fountain's browser editor in GitLab; its full component, toolbar,
suggestions, upload controls, collaboration and dialect coverage remain open.

All **5,483 unit tests in 339 files**, 26 focused service/lifecycle cases and root
types pass. No shipped engine/API, dependency, capacity-limit or parity-row change.
The development instance retains its own records and is stopped after testing.
During local startup diagnosis a generated PostgreSQL key was printed; only that
test key/certificate was replaced, installation/pairing was verified, and no key,
credential, raw configuration dump or session-state file is committed.
Evidence: `artifacts/gitlab-native-service-integration-20261112.json`.

### Native GitLab browser checkpoint — 2026-11-12

The real matching GitLab application now mounts Fountain's native document
service/view and formatting toolbar in issue descriptions and discussion
composers. Its eight-check Linux Chromium recording verifies native input,
formatting/undo/redo, checkbox toggles, rich/source/rich, UI save/reopen, a real
comment, private-access denial and restart persistence. The native form and
restored reader are visually reviewed with decoded image, table and equation.

Real use repaired inactive-host-default rejection, empty/equal loads, Undo icon
selection and generated heading links entering source. The host forwards native
render options/cancellation; the build treats the generated library as third-party
code at its existing Babel boundary. No engine API or capacity limit changes.

183 integration unit cases, root types, one Chromium surface regression and five
actual upstream lint/format checks pass; the complete frontend builds. Installer
rollback/reinstall and changed-file refusal preserve all seven source digests.
The upstream host Jest suite still fails 14 of 75 cases. Native fixture migration
and actual append/paste/full-contract work remain required, alongside the missing
feature adapters and broader product/release gates. No publication or parity
promotion. Evidence: `artifacts/gitlab-native-browser-integration-20261112.json`.

### Native GitLab Markdown insertion checkpoint — 2026-11-12

Native host paste events and an explicit clipboard button now use the real
GitLab renderer and native Fountain insertion/history. Requests retain ordered,
mapped selections; conflicting edits and unrepresentable results preserve the
document and rejected source. A recorded ten-check real-service journey passes
clipboard/undo/recovery, save/reopen/comment, anonymous denial and restart.
Editor, recovery controls and restored reader receive visual review.

All 5,507 root unit tests/341 files, 82 focused cases/3 files, framework types,
public API snapshot, package/frontend builds, performance/retention and size
checks pass. The migrated native host suite passes 75/75. The broader three-suite
run is 126 passed/42 failed: actual component acceptance remains open alongside
the missing feature adapters and full product/browser/release gates. No skips or
timeouts were added to hide those failures. The patch is reproducible against the
matching prepared source.

The public `insertDocument` repair retains authored paragraph attributes rather
than flattening them away. Its CommonJS output grows 193 bytes; measured aggregate
capacity increases 256 bytes (1421.75 to 1422 KiB). Entry, ESM, CSS and performance
limits stay unchanged. This checkpoint is local, not a complete `pnpm check`,
hosted CI, release or parity promotion. Evidence and open requirements:
`artifacts/gitlab-native-insertion-integration-20261112.json`.

### Native GitLab component foundations — 2026-11-12

Retry retains replacement history options, failed loads stay read-only until
explicit recovery, immersive layout/sticky-header classes are restored and
labelled-by names replace the default accessible label. Original rejected
document Markdown is inspectable/copyable while the editor stays open. The
source panel does not create a persistent second source record in GitLab.

Native component fixtures preserve 53 existing cases with equivalent Fountain
setup/assertions and add two recovery cases. Across host/component/form suites,
163 cases pass and seven attachment/contextual-menu cases fail. These failures
are retained; no skips, timeout increases or complete-product claims. Passing
native setup replaces obsolete Tiptap setup, not its engine with a fake facade.

The shared view's placeholder now recognizes empty paragraphs/text nodes, stays
out of document content, hides on focus/typing and restores after deletion. Three
recorded desktop browser journeys pass and receive screenshot review. Actual
GitLab also exercises empty comments and unsupported saved-source recovery using
its real renderer, backend and records. The report records final build/journey
identity and remaining gaps.

All 5,507 root unit cases/341 files, current types/API, package/frontend builds,
performance/retention and measured size checks pass. CSS capacity rises 64 bytes
(88.75 to 88.8125 KiB) for 90,906 measured bytes. Every JavaScript, performance
and retention limit stays unchanged. Full release/hosted gates and publication
remain pending. Evidence: `artifacts/gitlab-native-component-integration-20261112.json`.

### Native GitLab attachment checkpoint — 2026-11-12

The real native integration now connects its picker and binary image clipboard
to GitLab's own authenticated upload/render APIs, with ordered mapped insertion,
progress/cancel/retry, retained failed files and immediate save recovery after
explicit removal. The final real-service journey passes 17 checks, including
decoded images, exact uploaded Markdown, downloaded file bytes, discussions,
reader/reopen, anonymous refusal and application restart. The temporary bounded
upload-limit setting is restored. Native editor/reader screenshots are reviewed.

Rich insertion now lands after final inline atoms and correctly indexes non-first
text fragments. Empty generated caret anchors no longer emit formatting carriers;
typing format remains in state. Optional local-history `storedMarks` restores
that format through undo/redo and independent snapshot rebasing. The asynchronous
native insertion also captures typing marks before uploading. The optional view
APIs `handleFiles` and `scrollSelectionIntoView()` are additive and documented.

All 5,530 root tests/342 files, framework types/API, built package exports,
headless/server runtimes, builds, performance/retention and measured size checks
pass. Nine event-authored file-input contract cases pass in three desktop engines;
they do not certify native OS drops or full GitLab Firefox/WebKit clipboard.
The actual upstream set is 174 passed / 5 failed / 179 total. Nine new native
attachment cases pass; the five alert/link/media/code/reference menu requirements
still fail. Four patches reconstruct the tested native specs from the pinned tag.

CJS aggregate capacity grows from 1422 to 1422.5 KiB (+512 bytes); measured code
grows 308 bytes to 1,456,419. All individual-entry, ESM, CSS, latency and retention
limits stay fixed. Earlier failures, audit corrections and the passing journey
before final source cleanup are retained. An intermittent initial reader image
decode timeout remains unresolved even though its HTTP response and screenshot
contain the correct image; a later pass does not close that finding. Complete product and hosted release
gates, all media/dialects/providers, MR/wiki/multi-user/mobile/accessibility and
the other two professional integrations remain pending. Nothing is published;
no parity row or superiority claim is promoted.

[Current evidence](../artifacts/gitlab-native-attachments-integration-20261112.json).

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
