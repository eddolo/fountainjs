# Real GitLab baseline

This runs the original GitLab product, including its database, repositories,
authentication and HTTP APIs. It is a local integration environment, not the
Fountain replacement or a production deployment.

The Linux/amd64 Community Edition image is pinned to both `19.5.3-ce.0` and its
platform-manifest digest. The source checkout and packaged application are both
pinned to `0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf` in
[`upstream.json`](./upstream.json). The guarded native installer prepares that
matching source, and the frontend overlay mounts its rebuilt assets read-only.
Original-baseline and replacement-editor results remain separate evidence; the
browser driver verifies the actual packaged revision and deployment mounts.

Use a native Linux Docker Engine and Docker Compose. On this development
machine that engine runs inside the Ubuntu WSL distribution. The deployment
publishes only loopback port 5080 and keeps its own named volumes. It does not
connect to an existing GitLab account or installation. Metrics are disabled and
service concurrency is reduced for this small local test environment; these
settings are not performance or deployment recommendations.

### Reproduce suggestion history across comment edits

Use the [pinned local GitLab environment](./upstream.json) and prepare the native frontend as described below. From the FountainJS checkout in Linux, prepare the two GitLab services from the pinned Git objects. The command prints an error if the checkout is at a different revision or an existing output differs. The patch digest identifies the output directory under `artifacts/gitlab-suggestion-history/`.

```sh
node scripts/prepare-gitlab-suggestion-history.mjs /absolute/gitlab-source
run=review-history-local
for editor in original fountain; do
  node scripts/run-gitlab-compatibility.mjs --suite review-history --editor "$editor" --run-id "$run" --suggestion-history || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/comparison-1"
```

Choose an unused run ID. Both editors receive the same read-only Ruby service mounts. The runner records the image, database volumes, service hashes, frontend build, browser, and actual GitLab responses. A source or range change creates a fresh suggestion. Reordering distinct proposals preserves their IDs and application state. When a duplicate makes the applied occurrence ambiguous, the server rejects the edit and the author can correct the draft.

To restore the packaged services, run the stock editor without `--suggestion-history` using a fresh run ID. Compose recreates the container on the existing data volumes. The pinned patch adds no migrations. Previously lost identities cannot be reconstructed. With the stock services restored, future edits follow GitLab's packaged suggestion-recreation logic.

To check the actual records after rollback, use the previous run ID and attempt. The stock reader reopens each saved note from both repaired deployments, checks the badge against the persisted flags, and compares the note body, repository file, branch head, eligibility and suggestion IDs with the original evidence. It then creates fresh review notes against the packaged services as a negative control.

```sh
control=review-history-local-stock
node scripts/run-gitlab-compatibility.mjs --suite review-history --editor original --run-id "$control" --history-rollback-from "$run:1"
node scripts/run-gitlab-compatibility.mjs --suite review-history --editor fountain --run-id "$control"
dir="artifacts/gitlab-compatibility/$control"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/comparison-1"
```


When the verified original and replacement have different attempts, pass `--history-rollback-from run-id:original-attempt,fountain-attempt`. The verifier loads both raw reports and checks their build identities and the full comparison environment before reading either writer's records.

### Reproduce concurrent review submissions

Use the paired [comparison commands](../COMPATIBILITY_SUITE_PLAN.md#reproduce-an-issue-or-merge-request-comparison)
with `suite=concurrent-reviews`. Both deployments must use the same thread setting.
To reproduce the earlier two-thread run, export `FOUNTAIN_GITLAB_PUMA_THREADS=2`
before running either side. Use a fresh run ID for each profile. The runner checks
the generated Puma configuration once GitLab is healthy. To return to the default
profile, unset the variable before the next run.

On the two-thread profile, both reviewers received “4:Deadline Exceeded.” on both
editors. The branch stayed at the seed commit and the original suggestion remained
unapplied after reload. The first collector stopped listening after 30 seconds.
The longer observation captured the actual responses and saved state.
[Two-thread results](../../../artifacts/gitlab-compatibility/two-reviewers-20261119/comparison-2/report.md).

The local default now permits four Puma threads with the same CPU and memory limits.
In the earlier four-thread comparison, both editors produced one commit and the expected file. Both showed the losing reviewer a Git reference error until reload. [Earlier build and outcomes](../../../artifacts/gitlab-compatibility/two-reviewers-20261119/comparison-3/report.md).

The GitLab suggestion reader rebuilds its controls when the discussion refreshes. If a queued suggestion has become inapplicable, the Fountain integration shows GitLab’s reason and the removal action together on that suggestion. The workflow uses `--suite review-invalidation` on both editor deployments. Keep the same run ID and compare their completed reports. Source installer generation 19 includes the review header in the build identity. With the local application stopped, `node scripts/check-gitlab-native-install.mjs /absolute/gitlab-source` verifies the restore and reinstall. [Source rollback receipt](../../../artifacts/gitlab-compatibility/live-review-20261119/source-rollback.json).

In generation 20, an open suggestion confirmation checks GitLab's source-branch write permission. The integration resolves the source project and branch from the merge request, including a fork's project ID. It shares the result across the page's suggestion controls. While the confirmation is visible it normally checks again two seconds after the previous read. It skips background tabs and stops when the menu closes or the widget detaches. GitLab still makes its ordinary authorization decision at submission. A reviewer can choose **Check access again** after a role change and submit the original queue and message. The matched Chromium run scored 23 parity checks and two improvements. To reproduce it, run the `reviewer-handoff` suite on both builds. [Matched report](../../../artifacts/gitlab-compatibility/reviewer-access-refresh-20261119/comparison-4-5/report.md) · [Source rollback for all 38 installed files](../../../artifacts/gitlab-compatibility/reviewer-access-refresh-20261119/source-rollback.json).

To repeat the queued-review comparison, use the pinned deployment below and a fresh run ID per browser. Run both editors in sequence. A signed-in reviewer queues two proposals, loses and regains write access, confirms the batch and checks the saved file after reload.

```sh
engine=webkit
run_id="reviewer-$engine-$(date +%Y%m%d%H%M%S)"
for editor in original fountain
do
  node scripts/run-gitlab-compatibility.mjs --suite reviewer-handoff \
    --run-id "$run_id" --editor "$editor" --browser "$engine" --attempt 1
done
reports="artifacts/gitlab-compatibility/$run_id"
node scripts/compare-gitlab-compatibility.mjs --original "$reports/original-1/report.json" \
  --fountain "$reports/fountain-1/report.json" --output "$reports/comparison"
```

Use `engine=firefox` for the Firefox comparison. Each report identifies the editor, runtime, integration and GitLab build. A browser error keeps acceptance open even when the file and commit match. On build `433488dc`, source rollback restored 15 originals, removed 23 additions and reproduced all 38 file hashes on reinstall. [Source rollback receipt](../../../artifacts/gitlab-compatibility/reviewer-webkit-20261119/source-rollback.json).

In the [WebKit handoff on build 433488dc](../../../artifacts/gitlab-compatibility/reviewer-webkit-20261119/comparison-6/report.md), the branch endpoint returned HTTP 200 with write permission allowed, denied and allowed again as the reviewer changed roles. Both suggestions remained queued. One confirmed commit contained the original message and exact edited file. On the [preceding build](../../../artifacts/gitlab-compatibility/reviewer-webkit-20261119/fountain-3/report.json), rechecking returned HTTP 304 after access was restored and Apply stayed disabled.

The functional checks completed, but the WebKit comparison recorded three page errors on stock and five on Fountain. The traces show canceled requests during navigation, including notes and GraphQL. A separate same-origin test in the same browser canceled pending Fetch and XMLHttpRequest reads during navigation without emitting a page error. Cancellation alone does not account for the errors in GitLab. [Stock trace](../../../artifacts/gitlab-compatibility/reviewer-webkit-20261119/original-6/browser-errors.json) · [Fountain trace](../../../artifacts/gitlab-compatibility/reviewer-webkit-20261119/fountain-6/browser-errors.json).

A second matched run traced an unhandled rejection to `notes/store/legacy_notes/actions.js`, where one failed discussion read rejects both the generator and a promise shared by subscribers. Fountain build `269741c1` propagates the original failure to both callers even when a subscriber attaches later. The delayed-subscriber test failed against stock, and all 218 tests across the two upstream suites passed with the fix. The [matched WebKit report](../../../artifacts/gitlab-compatibility/review-navigation-20261119/comparison-2/report.md) records both build identities, 23 equivalent outcomes and two improvements. Stock recorded an unhandled rejection. Fountain recorded one notes-request error during navigation. Both saved the expected file and commit message.

Run `node integrations/gitlab/testing/observe-navigation-refresh.mjs` with Playwright WebKit installed to reproduce the remaining error independently. On WebKit 26.5 a queued notes read started after `beforeunload` and failed before reaching the local server. Staying on the page, dismissing navigation, and receiving HTTP 204 all kept the page active and the read succeeded. Stopping refresh at `beforeunload` would break those last two cases. The [four-case trace](../../../artifacts/gitlab-compatibility/review-navigation-20261119/navigation-control.json) and [source rollback receipt](../../../artifacts/gitlab-compatibility/review-navigation-20261119/source-rollback.json) accompany the comparison. The WebKit browser-error gate remains open.

The current Fountain integration reads the saved suggestion after an Apply conflict. When that exact suggestion is already applied, the reviewer sees Applied and the Apply control disappears. If the competing Git update arrives before Rails records the result, the integration can make up to three additional read-only status checks. Stock GitLab still required a reload in the matched run. [Current build and live reviewer outcomes](../../../artifacts/gitlab-compatibility/review-feedback-20261119/comparison-3/report.md).

The [stale-target comparison](../../../artifacts/gitlab-compatibility/review-feedback-stale-20261119/comparison-3/report.md) covers the other outcome. Both editors refused all four changed or deleted targets and preserved the file, branch head and review identity. The collector waits for a visible decision before taking a screenshot. Two live discussions still gave only a generic file-change warning. The report pairs the completed stock run (attempt 2) with Fountain attempt 3 after an intervening GitLab startup failure.

### Native footnote server repair

Native browser profiles now declare a separate read-only Ruby filter mount from
`compose.footnotes.yaml`, in addition to the compiled frontend. The preparer
requires the exact pinned source object and the runner checks that the original
packaged file has the same SHA-256. The patched file and receipt are generated in
`artifacts/gitlab-native-footnote-server/`; the image itself is unchanged. Audit
reports include the mount, original hash and live patched hash. These runs are
not an unmodified GitLab backend baseline. Reference-fixture capture profiles
keep the original server by default; `--verify-footnote-server` explicitly
captures the repaired server separately.

The pinned filter inferred definition identity from a reference's occurrence ID.
That leaves repeated references pointing at unsuffixed, absent destinations. The
repair follows the original href to its definition, assigns collision-checked
IDs and updates the matching generated backlinks. Its existing reference limit,
timing concern and ordinary authored body links are retained. Standalone Ruby
contracts and actual Rails renderings are separate from browser click evidence.

GitLab caches rendered Markdown. A renderer change alone does not repair old
cached issue descriptions. The pinned upstream guide is
`doc/administration/invalidate_markdown_cache.md`: administrators can invalidate
derived HTML for a project, or deliberately change the local Markdown version
for an installation. Do not flush all caches or edit document source as a
substitute. The task's old issue 152 retained its broken cached link after the
repair; setting only its `description_html` to nil made the next read regenerate
working forward/backlinks without changing Markdown, title or `updated_at`.
`scripts/audit-gitlab-footnote-cache.mjs` records that specific stale-record
witness; it is not a general-purpose migration command, and its stale-cache
precondition no longer holds after the successful refresh. The local [rollback check](#reproduce-rollback-with-the-footnote-renderer) covers one freshly created issue. Production batching and load remain open.

The native source installer records the frontend files owned by each installation. Its restore operation
does not remove the separate server Compose mount: recreate with the base
Compose profile to remove overlays, and rebuild restored frontend source before
serving it. Neither a source round trip nor the immutable original image proves
the complete compiled deployment rollback.

GitLab deletes its temporary `initial_root_password` file after a day. The audit
driver first reuses the root-only `/etc/gitlab/fountain-audit-password` file when
available, or the temporary initial file. If neither exists, it initializes a
new random password for the dedicated local root account through GitLab's normal
password model and stores it in the configuration volume with mode `0600`.
This happens only after the image, Compose project and revision guards pass, and
after application readiness. Existing database records remain intact. Subsequent
runs use normal browser sign-in with the retained credential. Credential values
stay outside the checkout, reports, command arguments and browser storage-state
files; captured process failures are replaced with fixed diagnostic categories.

```sh
docker compose -f integrations/gitlab/runtime/compose.yaml config --quiet
docker compose -f integrations/gitlab/runtime/compose.yaml pull
docker compose -f integrations/gitlab/runtime/compose.yaml up
```

Keep that foreground session open while testing, especially inside WSL. The
first detached launch on this machine was interrupted by a WSL shutdown during
initial configuration (container exit 255, not an OOM kill). A foreground Compose
session keeps the task's Linux session alive. Check from a second terminal:

```sh
docker compose -f integrations/gitlab/runtime/compose.yaml ps
curl --fail 'http://127.0.0.1:5080/-/readiness?all=1'
```

Initial configuration and database migrations can take several minutes. GitLab
generates its own initial root password inside the private configuration volume
at `/etc/gitlab/initial_root_password`. Keep credentials and browser sessions
outside source control, recordings and reports. No password or token is stored
in this Compose file.

Stop the environment when finished; this retains test records for reopen and
restart verification:

```sh
docker compose -f integrations/gitlab/runtime/compose.yaml stop
```

## Recorded original-product audit

From the Fountain repository, run the driver inside the same native Linux
environment as Docker:

```sh
node scripts/audit-gitlab-product-baseline.mjs --verify-restart
```

For Windows/WSL, invoke that entire Node command through WSL, rather than running
a Windows driver that opens short Linux commands. The Linux audit process keeps
its WSL session alive while Compose restarts the container. The attached
`compose up` process alone does not survive an externally requested restart.
Use the Node version in the pinned GitLab source's `.nvmrc`; the recorded run
uses Node 22.23.1 and Playwright's native Linux Chromium.

The driver recognizes only this Compose project and image, signs in through the
normal web form, creates a private project/issue and uploads a real PNG through
GitLab HTTP, types into the original rich editor, saves through the UI, reopens,
checks anonymous denial, and restarts the application. It verifies exact saved
server text and the uploaded image after restart. Screenshots wait for the real
image source and rendered math, not lazy-load placeholders. It records no
password, session-state file or trace. It creates local test issues and retains
them for inspection; it never targets an external GitLab deployment.

The November 12 run passes. The original rich save canonicalizes the untouched
table separator; that is baseline behavior, not a Fountain superiority claim.
The reviewed [report](../../../artifacts/gitlab-product-baseline-20261112/report.json)
and recording cover this one workflow. They do not certify every GitLab feature.

## Uploaded-image restart diagnostics

The optional `compose.upload-audit.yaml` mounts `upload_gateway_diagnostics.rb`
read-only in this isolated deployment. It wraps only the audit PNG request,
executes the original Workhorse authentication and re-raises verification errors.
Logs contain only a request ID, error class, numeric timestamps and issuer-match
boolean. No JWT text, credential or session header is recorded. Do not add this
overlay to a normal deployment or use it to relax authentication.

After the normal native frontend installation/build, run in Linux:

```sh
node scripts/run-gitlab-upload-restart-audit.mjs
# Validate every request/correlation in the saved diagnostic report:
node scripts/audit-gitlab-upload-restart.mjs --verify-report
# Restore the ordinary stopped deployment if a diagnostic run is interrupted:
node scripts/run-gitlab-upload-restart-audit.mjs --restore-only
```

The targeted reproduction uses the retained issue/image from the recorded
November 14 failure, with browser caching disabled and no image request retry.
It checks one initial load and twelve loads after each of two real restarts.
The runner restores the ordinary stopped container with its existing volumes;
its restore-only path is also independently verified. The first cleanup exposed
an unsupported `compose create --no-deps` flag, replaced by the supported
`--force-recreate` flag. The browser run passed but that initial wrapper exited
unsuccessfully; the report does not conceal this distinction.

All 25 requests subsequently correlated to successful verification and HTTP 200.
The original authenticated Rails 403 remains unexplained. A negative original
queue time suggests investigating clock/timestamp behavior if it recurs, but
neither that clue nor these passing loads prove the original exception or a fix.
[Evidence](../../../artifacts/gitlab-upload-restart-integration-20261114.json).

## Matching upstream source checks

`upstream.json` matches the packaged revision to the official `v19.5.3` source
tag. The prepared patch for that source is
`../patches/gitlab-19.5.3-current-document.patch`; it is cumulative against this
tag and is **not** applied after the earlier development-snapshot patch.

```sh
git checkout v19.5.3
git apply --check /absolute/path/to/gitlab-19.5.3-current-document.patch
git apply /absolute/path/to/gitlab-19.5.3-current-document.patch
corepack yarn install --frozen-lockfile --non-interactive
corepack yarn jest --runInBand \
  spec/frontend/issuable/issuable_form_spec.js \
  spec/frontend/vue_shared/components/markdown/markdown_editor_spec.js \
  spec/frontend/content_editor/components/content_editor_spec.js
```

The unmodified source passes 160 tests and the patched source passes 168, using
GitLab's own Jest configuration and dependency patches. The application image
still runs its original frontend: these are source-suite results, not proof that
the new source or Fountain is deployed in its browser.
GitLab's actual Prettier/Tailwind and ESLint checks also pass on all eight edited
files. The source patch is verified forward against a separate baseline index
and in reverse against the edited checkout.

## Running the rebuilt application frontend

The matching source builds its full production frontend with `corepack yarn
rspack-prod`. A sparse source checkout must include all build inputs, including
`app/views`, `app/graphql`, images, stylesheets, fonts and tooling; missing source
templates are build failures, not optional features to omit. Retain the source
pin, prepared patch, build log and generated asset manifest.

The optional `compose.frontend.yaml` binds that complete build read-only over the
packaged frontend. Set `FOUNTAIN_GITLAB_FRONTEND_ASSETS` to its absolute Linux
`public/assets/webpack` directory, then use both Compose files. Rspack emits
`manifest.rspack.json`; the override sets the official `ENABLE_RSPACK` switch and
the base profile forwards it into the Rails service environment. Merely setting
the outer container variable does not configure Puma's environment.

```sh
export FOUNTAIN_GITLAB_FRONTEND_ASSETS=/absolute/gitlab-source/public/assets/webpack
docker compose -f integrations/gitlab/runtime/compose.yaml \
  -f integrations/gitlab/runtime/compose.frontend.yaml up -d
node scripts/audit-gitlab-product-baseline.mjs --prepared-host --verify-restart
```

The prepared-host audit requires the read-only bind, records the loaded JavaScript
containing the current-value/handoff guards, exercises rich/source/rich mode
switching, then verifies UI save/reopen and restart. It writes to a separate
artifact directory and refuses to label an overridden frontend as the original
baseline. This build still uses GitLab's Tiptap editor; a Fountain browser
replacement must be compiled and checked separately. Lazy image checks scroll
the image into view and retain failure diagnostics rather than accepting a blank.

To roll back the frontend, recreate using only the base Compose file. Its default
Rails environment selects the packaged Webpack manifest again. The database,
uploads and other private configuration remain in the same dedicated volumes.

Full acceptance still requires the matching Fountain component, toolbars and
dialect adapters in that real application, then authenticated issue/MR/wiki and
discussion workflows, permissions, concurrent users, recovery and broader browser
coverage. A healthy container or passing selected suites cannot replace those
product checks.

## Native browser installation in progress

`fountain_content_editor.vue` and `fountain_formatting_toolbar.vue` are private
integration sources, not a complete public GitLab replacement. The installer
extracts the exact public props from the pinned prepared host component, mounts
the native service/view and preserves its slots and focus/change/handoff events.
Unsupported adapters remain visible as unfinished; active legacy collaboration,
serializer hooks and code suggestions are refused rather than ignored.

After preparing the matching source and installing its locked dependencies:

```sh
node scripts/build-gitlab-native-runtime.mjs
node scripts/install-gitlab-native-browser.mjs /absolute/gitlab-source
cd /absolute/gitlab-source
corepack yarn rspack-prod
```

### Reproduce the frontend deployment and rollback

From the Fountain checkout, use the pinned local Linux deployment and prepared
frontend described above. Start with its baseline container stopped. Pick a fresh
run ID. The first command mounts the compiled Fountain assets read-only and creates
two issues through the native editor workflow. The second recreates the service
from the stock image using the existing data volumes. Stock GitLab must open the
same issues, retain their bold discussion comments, then edit, save and reload
each description. The stock run also tests newly stock-authored controls. It
records immediate rich-text Save and reviewed Markdown Save separately. Both
deployments stop when finished. On this local profile, Omnibus occasionally timed out restarting a service logger during a cold start (observed for Redis, Workhorse and Puma). The local Compose profile now gives the supervisor 30 seconds to finish those service transitions. The browser still waits for GitLab readiness and a successful sign-in page. [Supervisor timeout reference](https://smarden.org/runit/sv.8). During initial startup the runner can restart the same container once if Omnibus exits with code 1 and its current boot log identifies a timeout restarting that service’s logger or a reload that found its logger down while the supervisor wanted it up. The service name in the failing recipe must match the logger path. The report retains the exit, service name, container ID and boot timestamps under `startupRetry`. The retry shares the original readiness deadline and must pass the HTTP sign-in probe. Exit during a measured service-restart case still fails the check. If initial startup still fails, rerun that side with a fresh `--attempt` on the existing volumes. For paired rollback, use the same attempt number for both sides, starting again with Fountain. [Example preflight failure](../../../artifacts/gitlab-compatibility/review-feedback-stale-20261119/fountain-2/report.json). The [reviewer refresh rollback](../../../artifacts/gitlab-compatibility/reviewer-refresh-rollback-20261119/comparison-2/report.md) tested build `f94f6889`. All 44 independent description and discussion checks passed. After the switch to packaged stock, the four issues retained their Markdown edits and bold comments. Immediate rich-text Save on stock lost the final edit on both Fountain-authored issues and both stock controls. The first stock boot exited before sign-in when logrotate's logger reload found the supervised logger down. The second paired run completed. The [queued-review rollback](../../../artifacts/gitlab-compatibility/queued-feedback-rollback-20261119/comparison-2/report.md) exercised the procedure on build `0a0376b4`. Both runs became ready on their first boot in that completed pair. The [preceding native attempt](../../../artifacts/gitlab-compatibility/queued-feedback-rollback-20261119/fountain-1/report.json) exited before sign-in during a logrotate logger restart.

Run the comparison after the stock command even
if a check failed, so the failed outcome appears in the report.

```sh
run_id=gitlab-rollback-$(date -u +%Y%m%d-%H%M%S)
node scripts/run-gitlab-compatibility.mjs --suite composers --run-id "$run_id" --editor fountain &&
node scripts/run-gitlab-compatibility.mjs --suite composers --run-id "$run_id" --editor original --verify-rollback
node scripts/compare-gitlab-compatibility.mjs \
  --original "artifacts/gitlab-compatibility/$run_id/original-1/report.json" \
  --fountain "artifacts/gitlab-compatibility/$run_id/fountain-1/report.json" \
  --output "artifacts/gitlab-compatibility/$run_id/comparison"
```

To verify persistence across a restart of each editor deployment, add `--verify-restart` to **both** composer commands. The runner restarts only the inspected test container, waits for health and HTTP readiness, and verifies the editor build in a fresh browser context. The host image, container ID and mounts must stay the same. The original and replacement then reopen their own two saved issues from a new browser session and read the descriptions and discussion notes from the GitLab API. Use `--verify-rollback` independently when the stock deployment also needs to edit the candidate’s records.

The pinned local restart comparison passed 46 checks on Chromium 151. Stock issues #564 and #565 and Fountain issues #562 and #563 retained both independently saved records, in both save orders. Each deployed build was identified again after the restart. The first attempt detected that Docker returned the same mounts in a different array order and stopped before reading the issues. The runner now compares all mount properties by destination. A later stock cold start exited before sign-in when Omnibus timed out starting the Gitaly logger. The final comparison reuses the completed Fountain attempt after verifying the identical workflow, fixture and browser. [Completed restart comparison](../../../artifacts/gitlab-compatibility/composer-restart-20261119/comparison-3/report.md) · [First attempt](../../../artifacts/gitlab-compatibility/composer-restart-20261119/comparison-1/report.md) · [Failed stock startup](../../../artifacts/gitlab-compatibility/composer-restart-20261119/original-2/report.json).

The comparison names the two verified builds. The stock input report also
records the candidate issue IDs, their contents after rollback, and the native
build that created them. This procedure covers the frontend-only profile.
In the Chromium rollback run, an immediate rich-text Save on stock lost the final change
on both rolled-back issues and stock-authored controls. If editors resume work
after this frontend rollback, open the description in Markdown mode, make the
edit there, save, reload and check the final text. That route passed on all four
records. Switching to Markdown immediately after typing in rich text also needs
care: verify the final edit in the Markdown field before saving.
[Rollback results](../../../artifacts/gitlab-compatibility/dual-composer-20261119/comparison-8/report.md).

For the **first edit after returning to packaged GitLab 19.5.3**, open the issue description and select **Switch to plain text editing** before typing if the rich editor is open. Type in the Markdown field and choose **Save changes**. The [Chromium 151 first-edit comparison](../../../artifacts/gitlab-compatibility/rollback-first-edit-20261119/comparison/report.md) verified the final character after reload on issues #576–579, including two created with Fountain build `269741c1`. All four immediate clicks landed 7.0–9.7 ms after the last key. The GitLab API retained all four descriptions and formatted comments. The subsequent immediate rich-text Save on the same issues lost the period on two issues and the whole newly typed phrase on two. The previously saved Markdown edit survived each attempt. Packaged rollback remains unsuitable for an unconditional rich-text Save guarantee.

To repeat the independent-draft comparison on Firefox, add `--browser firefox` to both composers commands and use a fresh run ID. The [Firefox 153 result](../../../artifacts/gitlab-compatibility/composer-firefox-20261119/comparison-1/report.md) exercised both save orders and reloaded both saved records. It used the same local GitLab and Fountain builds as the linked Chromium review-feedback comparison.

For the desktop WebKit profile, add `--browser webkit` to both collection
commands above and choose a fresh run ID. On WebKit 26.5 (Linux), stock reopened
all four records and retained their comments and reviewed Markdown edits.
All four lost the final rich-text edit at a measured 7–11 ms. The rollback
comparison requires a trusted key and click under 100 ms with the intended text
visible at click time. An earlier unmeasured pass cannot certify rapid Save.
[Measured WebKit rollback](../../../artifacts/gitlab-compatibility/composer-webkit-20261119/comparison-2/report.md).

WebKit 26.5 also passed all 44 independent-editor checks on Fountain revision `7756a29f`. After removing its compiled frontend, stock GitLab reopened issues #522–525 on the same volumes. All four retained their comments and a new Markdown edit after reload. Saving 9–14 ms after the last rich-text keystroke lost that edit on all four. The strict rollback acceptance remains open. Attempt one stopped before stock reached its sign-in page; attempt two completed both browser journeys. [Builds, matched results and rollback timings](../../../artifacts/gitlab-compatibility/unicode-composer-rollback-20261119/comparison-2/report.md).

On issue #540 the stock editor visibly undid italic formatting but immediately switching to Markdown restored the underscores. The stock API already held the italic description before the rollback check started. A rollback run must distinguish this pre-existing source mismatch from a change during redeployment. The runner records the writer's persisted content, leaves the mismatched record untouched, and exercises the remaining independent controls. [First attempt and raw reports](../../../artifacts/gitlab-compatibility/emoji-composer-rollback-20261119/comparison-1/report.md).

The completed Chromium 151 rerun on Fountain revision `2cb51f61` verified all 44 matched isolation checks. After rollback stock reopened both candidate issues (#542 and #543) and both controls (#544 and #545). Each retained its original comment and a reviewed Markdown edit. Each lost the last rich-text edit at a measured 3.7–5.5 ms from key to click. [Exact build identities and four-record results](../../../artifacts/gitlab-compatibility/emoji-composer-rollback-20261119/comparison-2/report.md).

### Reproduce the prepared Tiptap rich-text rollback

This alternate deployment returns issue authors to GitLab’s Tiptap editor with the current-document save patch and a fix for a document reload during Save. It uses the packaged backend and the same database and uploads. The packaged frontend remains the original control for comparisons.

On the pinned GitLab CE 19.5.3 deployment, each browser used Fountain `269741c1` and prepared Tiptap tree `075b931b`. The first rich-text Save retained the entire phrase, including its final period, on two Fountain-authored issues and two controls per browser. After reload, the reader and API agreed. All formatted discussion comments and subsequent Markdown saves survived. These runs recorded zero page errors.

| Desktop browser on Linux | Issue numbers | Final key to Save | Run records and visual check |
| --- | --- | --- | --- |
| Chromium 151 | 584–587 | 5.4–7.5 ms | [Fountain](../../../artifacts/gitlab-compatibility/prepared-rich-rollback-20261119/fountain-2/report.json) · [Prepared Tiptap](../../../artifacts/gitlab-compatibility/prepared-rich-rollback-20261119/prepared-2/report.json) · [Reloaded issue](../../../artifacts/gitlab-compatibility/prepared-rich-rollback-20261119/prepared-2/fountain-description-and-comment-first-rich-save.png) |
| WebKit 26.5 | 588–591 | 8–13 ms | [Fountain](../../../artifacts/gitlab-compatibility/tiptap-rollback-webkit-20261119/fountain-1/report.json) · [Prepared Tiptap](../../../artifacts/gitlab-compatibility/tiptap-rollback-webkit-20261119/prepared-1/report.json) · [Reloaded issue](../../../artifacts/gitlab-compatibility/tiptap-rollback-webkit-20261119/prepared-1/fountain-description-and-comment-first-rich-save.png) |
| Firefox 153 | 592–595 | 18–35 ms | [Fountain](../../../artifacts/gitlab-compatibility/tiptap-rollback-firefox-20261119/fountain-1/report.json) · [Prepared Tiptap](../../../artifacts/gitlab-compatibility/tiptap-rollback-firefox-20261119/prepared-1/report.json) · [Reloaded issue](../../../artifacts/gitlab-compatibility/tiptap-rollback-firefox-20261119/prepared-1/fountain-description-and-comment-first-rich-save.png) |

The [first fallback attempt](../../../artifacts/gitlab-compatibility/prepared-rich-rollback-20261119/prepared-1/report.json) used the current-document patch alone. Its form stayed open after an immediate Save. The new regression test reproduced an extra Markdown render when the current source came back through Vue. The repair recognizes the source and immutable ProseMirror document that produced it. External replacements still load. Both upstream component suites passed (130 tests).

Start with the pinned GitLab source checkout, the installed Fountain candidate, Docker and the Linux toolchain used for the native build. Set `gitlab_source` to the pinned GitLab checkout and `fallback` to a new absolute directory outside that checkout. From the FountainJS repository:

```sh
fountain_repo=$(pwd)
git -C "$gitlab_source" worktree add --detach "$fallback" 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf
git -C "$fallback" apply --index "$fountain_repo/integrations/gitlab/patches/gitlab-19.5.3-current-document.patch"
git -C "$fallback" apply --index "$fountain_repo/integrations/gitlab/patches/gitlab-19.5.3-tiptap-save-echo.patch"
(
  cd "$fallback" || exit 1
  corepack yarn install --frozen-lockfile && FOSS_ONLY=1 corepack yarn rspack-prod
)
```

The dependency directory must resolve inside the fallback checkout. The verified local build copied the already installed pinned dependencies into its own `node_modules` directory. Symlinking the entire directory from the Fountain checkout caused Rspack to misclassify modules and fail compilation.

```sh
browser=chromium   # chromium, firefox or webkit
run_id=prepared-rich-$browser-$(date -u +%Y%m%d-%H%M%S)
node scripts/run-gitlab-compatibility.mjs --suite composers --browser "$browser" --run-id "$run_id" --editor fountain &&
node scripts/run-gitlab-compatibility.mjs --suite composers --browser "$browser" --run-id "$run_id" --editor prepared \
  --verify-rollback --prepared-source "$fallback"
```

For an interactive local deployment after verification, use the same Compose project and volumes:

```sh
export FOUNTAIN_GITLAB_FRONTEND_ASSETS="$fallback/public/assets/webpack"
docker compose -f integrations/gitlab/runtime/compose.yaml -f integrations/gitlab/runtime/compose.frontend.yaml up -d baseline
```

The second audit run mounts the separate build read-only. It verifies the staged Git tree, Rspack manifest and script bytes loaded by the browser, identifies ProseMirror on the page, and checks that Fountain’s runtime marker is absent. Its first edit after the switch uses the rich editor and clicks Save immediately after the final key. It reopens both Fountain-authored records and the fallback’s own controls. The receipt is `artifacts/gitlab-compatibility/<run_id>/prepared-1/report.json`. To return to the packaged frontend, recreate the service using only the base Compose file. The packaged rich-text Save limitation remains applicable there.

### Reproduce rollback with the footnote renderer

Prepare the pinned filter once, then start with the isolated service stopped. These runs use the same database and a fresh issue with repeated footnote references.

```sh
node scripts/prepare-gitlab-footnote-server.mjs /absolute/gitlab-source
run_id=footnote-rollback-$(date -u +%Y%m%d-%H%M%S)
node scripts/run-gitlab-compatibility.mjs --suite composers --run-id "$run_id" --editor fountain --footnote-cache &&
node scripts/run-gitlab-compatibility.mjs --suite composers --run-id "$run_id" --editor original --footnote-cache --verify-rollback
```

Each side writes its verified editor build, deployed Ruby digest and `footnoteCache` observations to its run report. The first run uses the compiled Fountain frontend and read-only footnote repair. The second removes both mounts, reads the same issue using the packaged frontend and filter, then checks the effect of regenerating only that issue's derived HTML. It compares the regenerated links with a newly created stock issue and checks the original issue's Markdown, title and update timestamp. The ordinary frontend rollback checks still run. Different server filters disqualify this pair from editor parity scoring.

On the pinned deployment, issue #494 retained all three working references in its cached HTML after the rollback. Regenerating that issue's cache produced one broken reference, exactly as on stock control #497. All three backlinks survived. The issue's Markdown, title and update timestamp stayed identical. The fresh four-record rollback again retained discussions and Markdown saves, while stock immediate rich-text Save lost the final edit. [Fountain deployment receipt](../../../artifacts/gitlab-compatibility/footnote-deployment-rollback-20261119/fountain-1/report.json) · [Stock rollback receipt](../../../artifacts/gitlab-compatibility/footnote-deployment-rollback-20261119/original-1/report.json) · [Frontend-only matched comparison](../../../artifacts/gitlab-compatibility/confirmed-review-rollback-20261119/comparison-1/report.md).

With the application stopped, `node scripts/check-gitlab-native-install.mjs /absolute/gitlab-source`
separately restores the prepared source files, checks their bytes, reinstalls the
native candidate and checks every installed file and both build fingerprints.

For upstream host tests, apply
`integrations/gitlab/patches/gitlab-19.5.3-native-host-tests.patch` after the
prepared current-document patch and native installation. It mounts the actual
native surface and replaces two Tiptap-only test setup calls with native
transactions. Then apply `gitlab-19.5.3-native-component-tests.patch` from the same
directory. It migrates the actual surface, service, history and event setup while
retaining attachment/contextual-menu requirements. Then apply
`gitlab-19.5.3-native-attachment-tests.patch` for the native file controls and nine
additional upload/focus cases. Then apply
`gitlab-19.5.3-native-upload-capacity-tests.patch` for two whole-batch admission
cases. Then apply `gitlab-19.5.3-native-link-tests.patch` and
`gitlab-19.5.3-native-code-tests.patch` in that order, then
`gitlab-19.5.3-native-alert-tests.patch`. Follow with
`gitlab-19.5.3-native-media-tests.patch`,
`gitlab-19.5.3-native-reference-tests.patch` and
`gitlab-19.5.3-native-diagram-tests.patch`, then
`gitlab-19.5.3-native-diagram-reader-tests.patch` in that order. The twelve patches retain
the original incomplete media/code-menu requirements while adding the native
behavior tests. The current seventeen-suite set is **415 passed / 2 failed /
1 original skipped / 418 cases**, including the original Mermaid, GFM and
lazy-loader suites, nine new reader-recovery cases and ten image-loading cases.
The original expensive Mermaid-count test remains skipped; no new skip is added.
Full specialized-code
and media requirements remain failed and unskipped; frontmatter, suggestions and
GLQL are not established by the diagram work.
Forward/reverse checks reconstruct the native specs exactly
without changing the main index; no skips or timeout increases waive failures.

```sh
corepack yarn jest --runInBand \
  spec/frontend/content_editor/components/content_editor_spec.js \
  spec/frontend/content_editor/components/fountain_link_menu_spec.js \
  spec/frontend/content_editor/components/fountain_code_menu_spec.js \
  spec/frontend/content_editor/components/fountain_alert_menu_spec.js \
  spec/frontend/content_editor/components/fountain_media_menu_spec.js \
  spec/frontend/content_editor/components/fountain_reference_menu_spec.js \
  spec/frontend/content_editor/components/fountain_diagram_preview_spec.js \
  spec/frontend/content_editor/components/fountain_diagram_authoring_host_spec.js \
  spec/frontend/behaviors/markdown/fountain_diagram_reader_spec.js \
  spec/frontend/behaviors/markdown/fountain_reader_images_spec.js \
  spec/frontend/behaviors/markdown/render_sandboxed_mermaid_spec.js \
  spec/frontend/behaviors/components/sandboxed_mermaid_spec.js \
  spec/frontend/behaviors/markdown/render_gfm_spec.js \
  spec/frontend/lazy_loader_spec.js \
  spec/frontend/vue_shared/components/markdown/markdown_editor_spec.js \
  spec/frontend/issuable/issuable_form_spec.js \
  spec/frontend/work_items/components/work_item_description_spec.js
```

The installer checks source revision, prepared-file digests, runtime input hashes
and existing owned-file hashes. It rejects unrecognized edits and symlinks. It
retains original source files for rollback and formats installed components with
GitLab's own Prettier/Tailwind configuration. Its install manifest identifies
every changed file. Format 10 guards twenty-two files, including the native
menus, preview component, correlated Mermaid sandbox, reader and image loader.
It retains their pinned/prepared sources for guarded restoration. The superseded
GFM image hook is restored to pinned source when upgrading format 9. Earlier retained generations
remain recognizable for guarded upgrade/restore. The native runtime and renderer
CSS are local build inputs.

Verify the twelve ordered test patches without changing the upstream worktree or
its main index:

```sh
node scripts/check-gitlab-native-patches.mjs /absolute/gitlab-source --diagrams
# Store this follow-up's verification separately from the earlier diagram run:
node scripts/check-gitlab-native-patches.mjs /absolute/gitlab-source --diagram-authoring
node scripts/check-gitlab-native-install.mjs /absolute/gitlab-source --diagram-authoring
# Current saved-reader/image checkpoint (prepare its twelfth patch first):
node scripts/prepare-gitlab-diagram-reader-tests.mjs /absolute/gitlab-source
node scripts/check-gitlab-native-patches.mjs /absolute/gitlab-source --diagram-reader
node scripts/check-gitlab-native-install.mjs /absolute/gitlab-source --diagram-reader
```

Native imports request `no_header_anchors` through the real host callback;
reader navigation decorations must not become source links. Cancellation is
forwarded to Axios. The generated runtime is excluded from GitLab's arrow-only
Babel override, matching that override's existing third-party-code boundary.
It still runs through the remaining application build and test configuration.

Run the real-service audit inside Linux from the Fountain checkout:

```sh
node scripts/run-gitlab-native-browser-audit.mjs
# Include real clipboard insertion, unsupported-source recovery and undo/redo:
node scripts/run-gitlab-native-browser-audit.mjs --insertion
# Also inspect actual empty-comment paint and failed document-load recovery:
node scripts/run-gitlab-native-browser-audit.mjs --component
# Also exercise real picker/clipboard uploads, failed-file recovery and saving:
node scripts/run-gitlab-native-browser-audit.mjs --attachments
# Include whole-batch refusal and smaller-selection recovery through the picker:
node scripts/run-gitlab-native-browser-audit.mjs --capacity
# Text links, actual renderer offline/retry, clipboard and mixed-format saving:
node scripts/run-gitlab-native-browser-audit.mjs --links
# Ordinary code, languages, clipboard, nested removal and visible caret recovery:
node scripts/run-gitlab-native-browser-audit.mjs --code
# Contextual code/media, captured owners, keyboard/modal isolation and mobile:
node scripts/run-gitlab-native-browser-audit.mjs --context-menus
# Reviewed compact toolbar and primary/secondary/destructive media hierarchy:
node scripts/run-gitlab-native-browser-audit.mjs --context-ui
# Alerts, direct titles/body, all kinds, nested math/code and real saved rendering:
node scripts/run-gitlab-native-browser-audit.mjs --alerts
# Media properties, actual file replacement, playback and recovery:
node scripts/run-gitlab-native-browser-audit.mjs --media-files
# Native reference display/copy/open and adjacent-source boundary preservation:
node scripts/run-gitlab-native-browser-audit.mjs --references --reference-contexts
# Create/type/edit Mermaid and PlantUML with real providers and save/reopen/restart:
node scripts/run-gitlab-native-browser-audit.mjs --diagrams
# Paired source/preview draft, cancel/apply/undo and responsive modal journey:
node scripts/run-gitlab-native-browser-audit.mjs --diagram-authoring
# Invalid saved source, reader fallback/retry, cold images and native repair:
node scripts/run-gitlab-native-browser-audit.mjs --diagram-reader
# Read-only renderer fixture capture (not a product acceptance run):
node scripts/run-gitlab-native-browser-audit.mjs --alert-fixtures
# Diagram HTML fixtures use the isolated provider and temporarily enable PlantUML:
node scripts/run-gitlab-native-browser-audit.mjs --diagram-fixtures
```

Use `PLAYWRIGHT_BROWSERS_PATH` when the installed Linux browser lives outside
Playwright's default location. The runner keeps WSL alive across restart,
selects the recorded source's complete read-only frontend build, and stops its
own application afterward. It does not remove the dedicated records/volumes.
The attachment profile temporarily sets this isolated instance's attachment
limit to 10 MiB through GitLab's administrator API and restores the original
value in `finally`. It records both values and restoration status, without
recording other application settings. This bounds the over-limit test allocation.
See the official [application settings API](https://docs.gitlab.com/api/settings/).

The diagram profiles include `compose.diagrams.yaml`, which pins the optional
PlantUML server image and binds it only to loopback port 5081 with bounded
CPU/memory. The profile configures that URL through the real isolated GitLab
administrator API, restores the prior PlantUML settings in `finally`, and stops
both containers. A developer deployment must configure its own provider; no
public service is selected automatically. Mermaid uses GitLab's existing
script-only sandbox, with the guarded native request/error protocol patch.
The ordinary reader retains its existing message contract.

To restore the exact prepared host source:

```sh
node scripts/install-gitlab-native-browser.mjs /absolute/gitlab-source --restore
```

Restore refuses changed installed files, restores the recorded host/configuration
files and removes only verified installer-owned files. Rebuild before serving
that restored frontend, or recreate with the original base Compose profile.
With the task application stopped, `node scripts/check-gitlab-native-install.mjs
/absolute/gitlab-source` exercises the guarded source restore/reinstall and checks
every digest. For the compiled deployment, use the [frontend rollback procedure](#reproduce-the-frontend-deployment-and-rollback) and check the recorded stock Save limitation.

## Footnote round-trip and prose-boundary profile

Build/install the current native runtime and rebuild the host frontend, then run:

```sh
node scripts/run-gitlab-native-browser-audit.mjs --footnote-boundary --capture-footnote-roundtrip
```

The capture uses the declared server repair and records exact actual-host
responses for two native edit/export/reopen cycles. It keeps unsupported-input
refusals explicit. The browser profile additionally types a new prose paragraph
before the endnotes and saves/reopens/restarts the real application. These are
separate kinds of evidence; the model-level capture is not a human UI recording.
`--footnote-roundtrip-fixtures` runs only the renderer capture with its declared
backend overlay. Original reference capture profiles continue to use the stock
server unless explicitly requested otherwise.
Remaining native toolbar/menu workflows, suggestion/provider adapters,
remaining upstream feature cases, accessibility and
cross-browser/product acceptance remain necessary. Passing a selected real
journey does not close them.

Configuration references: [GitLab Docker installation](https://docs.gitlab.com/install/docker/installation/)
and [memory-constrained environments](https://docs.gitlab.com/omnibus/settings/memory_constrained_envs/).

## Quick-action source/save profile

After installing the native runtime and the preceding fourteen test patches,
prepare the additional fresh-session host repair and regression, then rebuild
the full GitLab frontend:

```sh
node scripts/prepare-gitlab-quick-action-tests.mjs /absolute/gitlab-source
# In the GitLab checkout: corepack yarn rspack-prod
node scripts/check-gitlab-native-patches.mjs /absolute/gitlab-source --quick-actions
node scripts/run-gitlab-native-browser-audit.mjs --quick-actions
```

The profile uses the actual private project, clipboard, renderer, label action,
save, reopen and restart. It checks that command execution waits for submission,
literal close text stays escaped and the next edit has no inherited conflict.
The separate `--quick-actions-fixtures` profile captures 32 renderer fixtures
against the pinned original transform. These profiles do not certify all quick
actions or certify the remaining argument/reference autocomplete interfaces.

## Quick-action controls profile

After preparing the first fifteen patches, build/install the current native
runtime and prepare the additional controls specs:

```sh
node scripts/build-gitlab-native-runtime.mjs
node scripts/install-gitlab-native-browser.mjs /absolute/gitlab-source
node scripts/prepare-gitlab-quick-action-controls-tests.mjs /absolute/gitlab-source
# In the GitLab checkout: corepack yarn rspack-prod
node scripts/check-gitlab-native-patches.mjs /absolute/gitlab-source --quick-action-controls
node scripts/check-gitlab-native-install.mjs /absolute/gitlab-source --quick-action-controls
node scripts/run-gitlab-native-browser-audit.mjs --quick-action-controls
```

The controls use the host's command endpoint through its CSRF-configured Axios
client. Provider data is validated, debounced and cancellable. No embedded command
catalogue substitutes for unavailable transport. The optional data cache is local
to one component and endpoint and expires after ten seconds. The native model
layer remains DOM-free. UI-created commands execute only through normal host Save;
literal interpretation remains an explicit undoable document change.

The `--quick-action-commands` capture profile records the actual available command
metadata separately from the renderer fixtures. It is not a role/context matrix.
The controls profile preserves the earlier source/save checks and additionally
tests command selection, Escape, Alt+F10, mobile interpretation switching, scroll
visibility and actual host clipping. Format-12 source restore/reinstall covers
27 owned files; compiled deployment rollback remains a separate requirement.
