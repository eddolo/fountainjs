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
In the four-thread comparison, each editor produced one commit, one applied
suggestion and the expected file. The losing reviewer saw a Git reference error
and an Apply control until reload. Reopen the discussion to see the Applied badge.
This verifies this pair of simultaneous requests on the pinned local deployment.
[Four-thread results and build identities](../../../artifacts/gitlab-compatibility/two-reviewers-20261119/comparison-3/report.md).

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
precondition no longer holds after the successful refresh. Production batching,
load and rollback remain deployment acceptance work.

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
deployments stop when finished. Run the comparison after the stock command even
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

For the desktop WebKit profile, add `--browser webkit` to both collection
commands above and choose a fresh run ID. On WebKit 26.5 (Linux), stock reopened
all four records and retained their comments and reviewed Markdown edits.
All four lost the final rich-text edit at a measured 7–11 ms. The rollback
comparison requires a trusted key and click under 100 ms with the intended text
visible at click time. An earlier unmeasured pass cannot certify rapid Save.
[Measured WebKit rollback](../../../artifacts/gitlab-compatibility/composer-webkit-20261119/comparison-2/report.md).

Deployments with additional Ruby filters or document-cache changes require
their own rollback and persisted-content checks.

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
