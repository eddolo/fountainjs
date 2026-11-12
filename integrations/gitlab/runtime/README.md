# Real GitLab baseline

This runs the original GitLab product, including its database, repositories,
authentication and HTTP APIs. It is a local integration environment, not the
Fountain replacement or a production deployment.

The Linux/amd64 Community Edition image is pinned to both `19.5.3-ce.0` and its
platform-manifest digest. Its release differs from the source audit's
`19.6.0-pre` commit in `../upstream.json`. Do not apply the source patch to this
image, or use baseline results as replacement-editor results. Record the actual
application revision before preparing a matching replacement build.

Use a native Linux Docker Engine and Docker Compose. On this development
machine that engine runs inside the Ubuntu WSL distribution. The deployment
publishes only loopback port 5080 and keeps its own named volumes. It does not
connect to an existing GitLab account or installation. Metrics are disabled and
service concurrency is reduced for this small local test environment; these
settings are not performance or deployment recommendations.

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

The installer checks source revision, prepared-file digests, runtime input hashes
and existing owned-file hashes. It rejects unrecognized edits and symlinks. It
retains original source files for rollback and formats installed components with
GitLab's own Prettier/Tailwind configuration. Its install manifest identifies
every changed file. The native runtime and renderer CSS are local build inputs.

Native imports request `no_header_anchors` through the real host callback;
reader navigation decorations must not become source links. Cancellation is
forwarded to Axios. The generated runtime is excluded from GitLab's arrow-only
Babel override, matching that override's existing third-party-code boundary.
It still runs through the remaining application build and test configuration.

Run the real-service audit inside Linux from the Fountain checkout:

```sh
node scripts/run-gitlab-native-browser-audit.mjs
```

Use `PLAYWRIGHT_BROWSERS_PATH` when the installed Linux browser lives outside
Playwright's default location. The runner keeps WSL alive across restart,
selects the recorded source's complete read-only frontend build, and stops its
own application afterward. It does not remove the dedicated records/volumes.

To restore the exact prepared host source:

```sh
node scripts/install-gitlab-native-browser.mjs /absolute/gitlab-source --restore
```

Restore refuses changed installed files, restores the recorded host/configuration
files and removes only verified installer-owned files. Rebuild before serving
that restored frontend, or recreate with the original base Compose profile.
Full native toolbar/menus, upload/suggestion/provider adapters, source-recovery
controls, upstream native-test migration, accessibility and cross-browser/product
acceptance remain necessary. Passing a selected real journey does not close them.

Configuration references: [GitLab Docker installation](https://docs.gitlab.com/install/docker/installation/)
and [memory-constrained environments](https://docs.gitlab.com/omnibus/settings/memory_constrained_envs/).
