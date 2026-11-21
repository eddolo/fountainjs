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

### Reproduce a rolling wiki frontend switch on two application nodes

Use the prepared native Fountain frontend, its matching build and install receipts,
and the isolated private project used by the wiki comparison. Run from the
FountainJS checkout with Docker Compose supporting volume subpaths. Install the
project's Playwright Chromium build or point `PLAYWRIGHT_BROWSERS_PATH` at it.

```sh
export FOUNTAIN_GITLAB_FRONTEND_ASSETS="$(node -p "require('./artifacts/gitlab-native-browser-install/install.json').source + '/public/assets/webpack'")"
docker compose -f integrations/gitlab/runtime/compose.yaml \
  -f integrations/gitlab/runtime/compose.frontend.yaml up -d --wait baseline
node scripts/audit-gitlab-two-node-wiki.mjs --rollback
node scripts/audit-gitlab-two-node-wiki.mjs --rollout
node scripts/audit-gitlab-two-node-wiki.mjs --rollback --wiki-checklist
node scripts/audit-gitlab-two-node-wiki.mjs --rollback --keep-tab-open
node scripts/audit-gitlab-two-node-wiki.mjs --rollout --keep-tab-open
docker compose -f integrations/gitlab/runtime/compose.yaml stop baseline
```

For the source-preserving wiki controller used in the retained runs, set
`FOUNTAIN_GITLAB_WIKI_DIR` to its prepared directory and add
`-f integrations/gitlab/runtime/compose.wiki-restore.yaml` to the baseline startup.
The runner mirrors the baseline controller on the peer and checks its file digest
through both stages. Both nodes use the same pinned image. Each runs its own
Rails, Workhorse and NGINX processes. The peer connects to the baseline's
PostgreSQL, Redis and Gitaly sockets and shares the local test uploads directory.
Start the baseline first. Recreate the peer if those socket files are replaced.

The owner uses the baseline on loopback port 5080. Chromium routes the Developer
to port 5081 while preserving GitLab's canonical URL. Workhorse request IDs
identify the serving node. The runner checks the editor shown in the browser and
the loaded script bytes against each container before allowing edits. It stops
only the peer during the switch, checks an owner edit while the peer is offline,
then opens a fresh Developer session using the same signed-in identity. The
Developer recovers the draft, edits, undoes, redoes and saves. The owner reloads
the result. Inspect `report.json` and the three screenshots in the printed
artifact directory. The runner restores the namespace flag and fixture role and
stops the peer. The local volumes retain the saved wiki for inspection.

With `--keep-tab-open`, the Developer also keeps their original editor mounted on the peer. While the peer is stopped, they type a sign-off in the first paragraph and the owner independently edits the status on the surviving node. After replacement, the test checks both edits, the original browser navigation and editor element, the Developer’s undo/redo, and the source before Save. A fresh session on the replacement checks the merged draft and saves it. The owner reopens that revision. Inspect `open-tab-offline.png` and `open-tab-reconnected.png` alongside the saved reader.

### Reproduce automatic application-node failover

Use the same local project, volumes and pinned frontend as the two-node check above. This Linux Docker profile uses loopback ports 5080, 5081 and 5082. The Developer's browser keeps the canonical GitLab origin while connecting through NGINX on 5082. The owner has a direct connection to the surviving node to independently observe edits. The [NGINX configuration](wiki-failover.nginx.conf) prefers port 5081, falls back to 5080 on connection or upstream errors, and forwards WebSocket upgrades. The harness starts and stops the digest-pinned proxy. The two app nodes share PostgreSQL, Redis and Gitaly.

For rollout, start the surviving baseline with Fountain. For rollback, start it with the packaged stock frontend. Run each command against the corresponding healthy baseline. If testing the optional wiki controller, use the same controller override for both baseline starts.

```sh
docker compose -f integrations/gitlab/runtime/compose.yaml -f integrations/gitlab/runtime/compose.frontend.yaml up -d --wait baseline
node scripts/audit-gitlab-two-node-wiki.mjs --rollout --load-balancer | tee rollout.log
rollout_receipt=$(node -e "const r=JSON.parse(require('node:fs').readFileSync('rollout.log','utf8').trim().split(/\\n/).at(-1)); if(!r.passed)process.exit(1); console.log(r.out+'/report.json')") || exit 1
docker compose -f integrations/gitlab/runtime/compose.yaml stop -t 150 baseline
docker compose -f integrations/gitlab/runtime/compose.yaml up -d --wait baseline
node scripts/audit-gitlab-two-node-wiki.mjs --rollback --load-balancer --previous-rollout="$rollout_receipt"
docker compose -f integrations/gitlab/runtime/compose.yaml stop -t 150 baseline
```

Inspect `proxy.handshakes` for the initial and reconnected cable upstreams, and `proxy.save` for the serving Workhorse request ID while the peer was stopped. The saved source and reader must contain both authors' edits. After the replacement becomes healthy, a fresh browser opens the same revision on the preferred node. Both nodes also read the same pre-existing issue, and the survivor reads it with its peer offline. The issue ID, title and description hash must match. The rollout saves a further edit on the returned Fountain node. Passing that receipt to rollback verifies the entire saved wiki source before editing, opens the same wiki on the returned stock node, and saves another edit. The surviving node verifies its source through the API and displays the edit to a reader. This test exercises application-node loss with a healthy shared data tier.

### Reproduce two authors editing a wiki checklist

Use the prepared wiki controller on both builds. The fixture contains completed,
pending and not-applicable tasks followed by a numbered checklist starting at
three. The Developer toggles a checkbox, undoes it and redoes it. The owner saves,
and the Developer reopens the reader. Compare the stored Markdown and both
`saved-checklist.png` screenshots.

```sh
run="wiki-checklist-$(date +%s)"
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --wiki-checklist --wiki-restore --editor original --run-id "$run"
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --wiki-checklist --wiki-restore --editor fountain --run-id "$run"
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/verified"
```

For numbered task markers ending in `)`, use `--wiki-parenthesized-checklist` in both commands with a fresh run ID. The Developer toggles item three. Inspect the saved Markdown in each report as well as the reader, since the reader can display the same numbering for both source spellings.

Use `--wiki-table-tasks` on both sides with a fresh run ID to test checkboxes inside a pipe table. The two authors edit the status paragraph, then the Developer ticks the Backup cell, undoes it and redoes it. Compare the saved Markdown and `saved-table-tasks.png`, including the completed Deploy cell and the not-applicable Retire cell.

For the right-aligned column use `--wiki-aligned-table-tasks --browser firefox` on both sides. The report records each checkbox center as a fraction of its cell width, in the live editor and again after reopening the reader. The wide column makes left and right positions visibly distinct. Check `shared-wiki.png` and `saved-table-tasks.png` against those measurements.

### Reproduce a wiki restore across a project role change

Run the two collectors sequentially against the prepared wiki controller and
the pinned local GitLab project. Each collector stops the test instance on exit.

```sh
run="wiki-role-$(date +%s)"
node scripts/run-gitlab-compatibility.mjs --suite wiki-restore-role --editor original --wiki-restore --run-id "$run"
node scripts/run-gitlab-compatibility.mjs --suite wiki-restore-role --editor fountain --wiki-restore --run-id "$run"
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/verified"
```

The project owner changes the test Developer to Reporter after the Developer
types a restore message. Compare the open dialog, a fresh historical reader,
and the revision IDs and bytes after Cancel. The author opens a new confirmation
after Developer access is restored. The run checks the author credit and exact
Markdown across the three revisions, then returns the fixture membership to its
original level. The screenshots end in `-pending`, `-reader`, `-restored` and
`-history`.

### Reproduce merge-request creation

Prepare the [frontend deployment](#reproduce-the-frontend-deployment-and-rollback) and run the commands below from the FountainJS checkout in Linux. The fixture creates one source branch and commit per editor through GitLab’s repository API. The browser selects that branch, creates the merge request, enters its formatted description, reopens it, adds a paragraph and saves. The collector checks the live draft immediately before Save and reads the saved Markdown and reader after reload. Each run leaves the branch and open merge request available for inspection.

```sh
suite=mr-create
browser=chromium
run="$suite-$browser-$(date +%s)"
for editor in fountain original; do
  node scripts/run-gitlab-compatibility.mjs --suite "$suite" --browser "$browser" --editor "$editor" --run-id "$run"
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" \
  --fountain "$dir/fountain-1/report.json" --output "$dir/comparison"
```

Set `suite=mr-create-member` to run as the fixture’s project Developer, or set `browser=firefox` or `browser=webkit` for another desktop engine. The Developer uses a separate signed-in session and the visible **Edit merge request** link. The fixture verifies the actual project access level and checks the saved author ID after both submissions. It restores the fixture account’s previous membership afterward. Each browser report includes any page errors. Run the comparator on both reports even when a browser exits with a failed check.

The Developer fixture seeds one existing public comment and one pending review through authenticated APIs. The browser reopens the draft in **Your review**, submits it as a comment and reloads. The reader and APIs verify the author, the published text and the empty draft queue. The Developer then types a second, formatted comment and reloads before submitting it. After recovery the collector checks the visible text and bold range, submits the comment, reloads again, and verifies its exact Markdown, author, single publication, earlier notes and cleared composer. The recovered editor and posted comment screenshots are saved as `recovered-comment.png` and `published-comment.png`. On WebKit, `navigation.json` records document lifecycle events, request paths, responses, cancellations and indexes into the adjacent build report’s page errors. Browser event timestamps are measured when the observer receives them.

### Reproduce a private review across editor rollback

Run the two commands in order from the prepared Linux checkout. The first creates a real merge request, edits its description and leaves a bold comment pending through Fountain’s rich editor. The second switches to the packaged frontend on the same GitLab volumes. It signs in as the same project Developer, opens the saved description in stock rich text, saves a follow-up through Markdown and submits the pending review. The stock report carries the SHA-256 and build identity of the Fountain report used for the handover.

```sh
run="mr-handover-$(date +%s)"
node scripts/run-gitlab-compatibility.mjs --suite mr-review-handover --editor fountain --run-id "$run" &&
  node scripts/run-gitlab-compatibility.mjs --suite mr-review-handover --editor original --run-id "$run"
```

Inspect `observations[0].pending` in the Fountain report and `observations[0].handover` in the stock report. The recorded IDs connect the original private draft, unchanged public discussion and published comment. These are two stages of one deployment test.

### Roll back with an unposted comment in an open tab

From the prepared Linux checkout, run:

```sh
node scripts/run-gitlab-compatibility.mjs --suite mr-create-member --editor fountain --browser chromium \
  --verify-draft-rollback --run-id "mr-live-draft-$(date +%s)"
```

The project Developer types a formatted comment and leaves it in the composer. The runner keeps the same browser tab open while it stops the isolated service and starts packaged GitLab on the same volumes. After the stock build identity is verified, the Developer reloads that tab. If GitLab redirects to sign-in, the same account signs in through the normal form and returns to the merge request in the original tab. The Developer posts the recovered draft and reloads again. The report records the post-switch session status. This run captures the editor before and after rollback and the published note as screenshots so that sign-in stays out of recordings. The runner checks the rendered comment, exact Markdown, author, earlier notes, empty composer and merge-request description and branch head. The report includes the initial Fountain identity and the stock identity under `draftRollback`. This run represents one deployment switch and is excluded from matched-editor counts.

### Reproduce issue-board editing

From the prepared Linux checkout, run the same issue-board workflow on both deployments. Each run creates a new issue through the board’s **Create issue** form, edits its description in the drawer, follows the issue reference to the full page, and posts a formatted comment. The browser returns through **Issue boards**, reloads the board and reopens the card. The report checks both editor builds, the issue number and the Markdown in GitLab’s issue and notes APIs. It records visible card numbers on creation, when the drawer is ready, and after reload. It measures the short-description editor and checks the center of Save for obstruction at 1280 and 390 CSS pixels. The narrow run scrolls Save into view and opens and closes the Fountain limits disclosure with the keyboard. These measurements use a desktop browser with a resized viewport.

```sh
run="board-issue-$(date +%s)"
for editor in original fountain; do
  node scripts/run-gitlab-compatibility.mjs --suite board-issues --editor "$editor" --run-id "$run" || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" \
  --fountain "$dir/fountain-1/report.json" --output "$dir/comparison"
```

### Reproduce personal saved replies

Prepare the [frontend deployment](#reproduce-the-frontend-deployment-and-rollback), then run these commands from the FountainJS checkout in Linux. Both deployments use the same issue and personal comment-template fixture. Each author creates a temporary personal template through GitLab’s authenticated GraphQL API. Cleanup removes each fixture by ID in its owner’s session. The issues and posted comments remain available for inspection.

```sh
run="saved-replies-$(date +%s)"
for editor in fountain original; do
  node scripts/run-gitlab-compatibility.mjs --suite saved-replies --editor "$editor" --run-id "$run" || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" \
  --fountain "$dir/fountain-1/report.json" --output "$dir/comparison"
```

The recording follows an author selecting a word in a discussion draft, cancelling the picker, inserting a formatted saved reply, undoing and redoing it, then posting the note while an unsaved issue description remains open. The score includes focus, both drafts, the stored Markdown and the reloaded reader.

A second issue uses separate signed-in administrator and Reporter sessions. Both create a personal template with the same search prefix. Each author searches for that prefix, inspects the picker, posts their own reply, and reopens the issue to read both formatted notes. The collector checks the note authors through the API and restores the test account’s previous project membership. Sign-in takes place before recording starts. If GitLab displays its administrator patch notice, the browser clicks the dialog’s Close button and records its title in the run report. After cancelling the template picker, the author clicks the comment paragraph before selecting text again.

### Reproduce wiki Save and version restore

Prepare the pinned frontend using [the local deployment instructions](#reproduce-the-frontend-deployment-and-rollback). From the FountainJS checkout in Linux, use a fresh run ID. Each side creates its own wiki page from the same Markdown fixture. The collector records the build that mounted the editor, then uses GitLab’s Edit, Save, Page history and Restore controls.

```sh
run="wiki-history-$(date +%s)"
for editor in original fountain; do
  node scripts/run-gitlab-compatibility.mjs --suite wiki-history --editor "$editor" --run-id "$run" || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/comparison-1"
```

The comparison checks the reader after reload, rich-text reopening, cancelling a restore, the new commit message and content retrieved by each of the three revision IDs. For source fidelity, compare the fixture, the wiki content field immediately before form encoding, the decoded navigation request, and GitLab’s response for that revision. The raw reports retain the generated wiki text at each boundary.

#### Restore exact revision bytes

Install and compile the generation 22 native frontend using the deployment instructions below. Prepare the wiki controller from the same pinned GitLab source, then run both editors against it.

```sh
node scripts/prepare-gitlab-suggestion-history.mjs /absolute/gitlab-source --wiki-restore
run="wiki-restore-$(date +%s)"
for editor in original fountain; do
  node scripts/run-gitlab-compatibility.mjs --suite wiki-history --editor "$editor" --run-id "$run" --wiki-restore || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/comparison-1"
```

The restore modal sends the selected revision ID alongside the normal form fields. On this profile GitLab reads the historical page’s raw content from its wiki repository and passes it to the existing update service with the supplied commit message and optimistic lock. Older frontends continue using the submitted content field. Generation 22 also tags ordinary rich-text edits on existing Markdown wiki pages. The controller reuses the original YAML header when its parsed values match and retains surviving line endings and the file terminator. The wiki codec can preserve unchanged prose blocks when its local parse matches GitLab’s rendered document. The three fixtures cover LF, mixed endings, CRLF without a final newline, YAML comments, Unicode, and an inserted paragraph next to a source-formatted bold span. Source mode, templates and collaborative editing follow their existing save paths. The comparator checks the live controller hash and the revision selected by the Fountain frontend.

To roll back both components locally, use a fresh run ID and run the stock editor without `--wiki-restore`. Compose removes the frontend and wiki controller mounts and reuses the data volumes. The controller patch has no migration. To verify retained records after rollback, supply the repaired run ID and collection attempts. The stock reader checks each history row, the three revision sources and the current page on the same volumes, then creates fresh stock controls.

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-history --editor original \
  --run-id "wiki-stock-$(date +%s)" --history-rollback-from "$run:1,1"
```

The [three-page Chromium comparison](../../../artifacts/gitlab-compatibility/wiki-rich-save-20261119/comparison-3/report.md) tested Fountain `0f3db5f6bfe550275fd0ff440c78d47d5cbab7eb`. The 48 checks include five improvements in exact Markdown retention. The run used `--history-rollback-from wiki-rich-save-20261119:1,3`. After both overlays were removed, [packaged GitLab reopened all six pages and verified all 18 revision contents by ID](../../../artifacts/gitlab-compatibility/wiki-rich-save-stock-20261119/original-1/report.json). The [earlier two-page comparison](../../../artifacts/gitlab-compatibility/wiki-revision-restore-20261119/comparison/report.md) records the rich-text Save failures that prompted these changes.

#### Reproduce wiki display-title edits

Use the existing wiki deployment and run the `wiki-titles` suite with the same controller on both editors. The author changes the display title on a page with a fixed path, saves, reopens the rich editor and checks the title, then restores the original revision. The comparison checks the actual source of each Git revision, including comments, nested YAML, quotation marks, line endings and the final newline. For an isolated title change, the optional controller finds the top-level scalar with Ruby’s YAML parser and checks that GitLab parses the edited header into the requested metadata. It uses GitLab’s submitted header when other metadata changed or the original structure cannot be edited unambiguously.

```sh
run="wiki-titles-$(date +%s)"
for editor in original fountain; do
  node scripts/run-gitlab-compatibility.mjs --suite wiki-titles --wiki-restore --editor "$editor" --run-id "$run" || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/comparison"
```

The [five-page comparison](../../../artifacts/gitlab-compatibility/wiki-title-fidelity-20261120/comparison/report.md) recorded 76 equivalent outcomes and 14 improvements. Both editors saved the requested titles. Fountain kept the expected source on all five saves and restores. Stock rewrote the five saves, and four restored pages opened with a title derived from the URL path. The [packaged rollback](../../../artifacts/gitlab-compatibility/wiki-title-fidelity-stock-20261120/original-1/report.json) checked the displayed titles of ten pages and retrieved all 30 stored revisions. Run against the same data volumes with the original and Fountain writer attempts.

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-titles --editor original \
  --run-id "wiki-title-stock-$(date +%s)" --history-rollback-from "$run:1,1"
```

#### Reproduce a wiki restore with an intervening edit

Use the same prepared controller and compiled editor as above. On the same test account, the first tab opens Restore for v1 at v2. A second tab edits the latest page and saves v3. The first tab submits its still-open dialog, checks the notice and current page, opens history again, and deliberately retries the v1 restore. The comparison checks both shown text and all four revision sources by ID.

```sh
run="wiki-stale-$(date +%s)"
for editor in original fountain; do
  node scripts/run-gitlab-compatibility.mjs --suite wiki-restore-conflict --wiki-restore --editor "$editor" --run-id "$run" || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/comparison"
```

To exercise the same race with two people, use `--suite wiki-restore-authors` on both sides of the command above. The first author opens Restore. A project Developer in a separate signed-in session then saves the competing revision through the rich editor. The report checks both editor roots, the two account identities, the names GitLab displays beside all four revisions, and the project member’s access before and after the test.

In the [initial comparison](../../../artifacts/gitlab-compatibility/wiki-stale-restore-20261119/comparison/report.md), both editors retained v3 but displayed the literal translation tokens around “the page.” The optional controller now sends update errors to the wiki application’s existing alert on the redirected page. Its translated link opens the current reader. [Matched click-through and revision receipts](../../../artifacts/gitlab-compatibility/wiki-stale-restore-20261119/comparison-4/report.md)

After removing the controller and frontend overlays, packaged GitLab reopened both pages and returned all eight revision contents by ID. Its fresh control again displayed the translation placeholders. Reproduce against the same data volumes with the writer run and attempt numbers below. [Stock rollback and fresh control](../../../artifacts/gitlab-compatibility/wiki-stale-stock-20261119/original-1/report.json)

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-restore-conflict --editor original \
  --run-id "wiki-stale-stock-$(date +%s)" --history-rollback-from wiki-stale-restore-20261119:4,4
```

For the two-author Firefox workflow, keep the same named data volumes throughout. Record the stock and Fountain writer runs with the shared wiki controller first. Then switch back to the packaged frontend and controller and verify both pages.

```sh
run="wiki-authors-firefox-$(date +%s)"
for editor in original fountain; do
  node scripts/run-gitlab-compatibility.mjs --suite wiki-restore-authors --browser firefox --wiki-restore --editor "$editor" --run-id "$run" || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/comparison" || exit 1
node scripts/run-gitlab-compatibility.mjs --suite wiki-restore-authors --browser firefox --editor original --run-id "$run-stock" --history-rollback-from "$run:1,1"
```

The rollback verifies the packaged controller digest and checks each version in the history table against the original revision ID, author, commit message and stored source. Its own fresh control runs after it reads both existing pages.

On Linux Firefox 153 with GitLab CE 19.5.3, all 19 comparisons passed on the two builds with the shared controller. After removing both overlays, packaged GitLab displayed both pages and all eight original revision IDs with the expected authors, messages and exact source. The Developer’s competing change remained available as v3 on each page. A fresh stock control retained the revisions and showed the existing translation placeholders in its conflict notice. [Matched builds and outcomes](../../../artifacts/gitlab-compatibility/wiki-authors-firefox-20261120/verified/report.md) · [Rollback by revision and author](../../../artifacts/gitlab-compatibility/wiki-authors-firefox-stock-20261120/original-1/report.json) · [Fountain-authored page under packaged GitLab](../../../artifacts/gitlab-compatibility/wiki-authors-firefox-stock-20261120/original-1/fountain-two-wiki-authors-rollback.png)

Two earlier stock Firefox attempts stopped when GitLab’s release reminder interrupted navigation. In the matched run both temporary browser profiles used the built-in reminder action and verified the selected revision URL before Restore. [First interrupted run](../../../artifacts/gitlab-compatibility/wiki-authors-firefox-20261120/original-1/report.json) · [Second interrupted run](../../../artifacts/gitlab-compatibility/wiki-authors-firefox-20261120/original-2/report.json)

#### Reproduce history after moving a wiki page

Under **Edit page options**, change the page path after saving a rich-text edit. The suite opens the original bookmark and historical URL, then uses the renamed page’s history to select the original revision when GitLab lists it. It compares the resulting reader text and exact source against the original commit.

For a deployment that needs history across moved pages on GitLab CE 19.5.3, an administrator can enable GitLab’s project-scoped setting in the GitLab Rails console. Substitute the destination project’s full path. Record the existing setting before rollout so rollback can restore it.

```ruby
project = Project.find_by_full_path('group/project') || raise('Project not found')
Feature.enable(:wiki_page_history_follow_renames, project)
```

Run `wiki-rename` with the pinned controller prepared above. The first case uses GitLab 19.5.3’s default. The second uses the existing `wiki_page_history_follow_renames` flag for the isolated test project. The collector records the project gate and restores its initial state in a `finally` block.

```sh
run="wiki-rename-$(date +%s)"
for editor in original fountain; do
  node scripts/run-gitlab-compatibility.mjs --suite wiki-rename --wiki-restore --editor "$editor" --run-id "$run" || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/comparison"
```

In the [matched Chromium run](../../../artifacts/gitlab-compatibility/wiki-rename-20261120/verified/report.md), both editors passed all 15 checks with the project setting enabled. At the packaged default, the move became v1 in the new path’s history. Six checks depending on access to earlier revisions from that screen remained unmet. The old bookmark and direct historical URL continued to work.

To verify rollback, run the packaged stock image without the wiki controller or Fountain assets. The [recorded rollback](../../../artifacts/gitlab-compatibility/wiki-rename-stock-20261120/original-1/report.json) reopened four moved pages using their old bookmarks and retrieved all 14 saved revisions by commit ID and the path used at that revision. The reader’s history still reflected the packaged default. The command below uses the recorded writer run. Substitute your run ID and attempts for a fresh deployment.

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-rename --editor original \
  --run-id "wiki-rename-stock-$(date +%s)" --history-rollback-from wiki-rename-20261120:1,1
```

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

WebKit 26.5 also passed all 44 independent-editor checks on Fountain revision `7756a29f`. After removing its compiled frontend, stock GitLab reopened issues #522–525 on the same volumes. All four retained their comments and a new Markdown edit after reload. Saving 9–14 ms after the last rich-text keystroke lost that edit on all four. This packaged WebKit build failed rapid rich-text Save. The [prepared fallback](#reproduce-the-prepared-tiptap-rich-text-rollback) subsequently passed the same workflow. Attempt one stopped before stock reached its sign-in page; attempt two completed both browser journeys. [Builds, matched results and rollback timings](../../../artifacts/gitlab-compatibility/unicode-composer-rollback-20261119/comparison-2/report.md).

On issue #540 the stock editor visibly undid italic formatting but immediately switching to Markdown restored the underscores. The stock API already held the italic description before the rollback check started. A rollback run must distinguish this pre-existing source mismatch from a change during redeployment. The runner records the writer's persisted content, leaves the mismatched record untouched, and exercises the remaining independent controls. [First attempt and raw reports](../../../artifacts/gitlab-compatibility/emoji-composer-rollback-20261119/comparison-1/report.md).

The completed Chromium 151 rerun on Fountain revision `2cb51f61` verified all 44 matched isolation checks. After rollback stock reopened both candidate issues (#542 and #543) and both controls (#544 and #545). Each retained its original comment and a reviewed Markdown edit. Each lost the last rich-text edit at a measured 3.7–5.5 ms from key to click. [Exact build identities and four-record results](../../../artifacts/gitlab-compatibility/emoji-composer-rollback-20261119/comparison-2/report.md).

### Roll back an issue with a table of contents and no headings

Packaged GitLab's rich editor can drop the existing contents directive when it saves a prose edit to an issue that has no headings. Use plain text editing for that edit. Open the saved source, confirm the directive is present, and keep it when adding prose or headings. Once a heading exists, verify the reader outline and reopen rich editing. [Matched stock and Fountain authoring results](../../../artifacts/gitlab-compatibility/contents-authoring-20261120/verified/report.md).

To exercise the deployment switch on one real issue, run these commands in the existing local GitLab audit environment with a fresh run ID.

```sh
node scripts/run-gitlab-compatibility.mjs --suite contents-handover --browser chromium --editor fountain --run-id outline-rollback --attempt 1
node scripts/run-gitlab-compatibility.mjs --suite contents-handover --browser chromium --editor original --run-id outline-rollback --attempt 1
```

The first run inserts the outline, saves it without headings, reopens it in Fountain and saves a sentence. The second verifies the prior mounted frontend and build, backend volumes, browser, fixture and collector hashes, then reopens the same issue ID. It checks the exact Markdown before and after two stock saves and reopens the resulting outline. Issue #681 passed on Chromium 151 and GitLab CE 19.5.3. [Fountain-authored source](../../../artifacts/gitlab-compatibility/contents-handover-20261120/fountain-2/report.json) · [Packaged GitLab saves and build identity](../../../artifacts/gitlab-compatibility/contents-handover-20261120/original-2/report.json) · [Reopened rich editor](../../../artifacts/gitlab-compatibility/contents-handover-20261120/original-2/rollback-outline.png).

### Reproduce the prepared Tiptap rich-text rollback

This alternate deployment returns issue authors to GitLab’s Tiptap editor. The patches read the current document at Save, recognize its return through Vue, and return focus to the editor when an author activates a formatting button. It uses the packaged backend and the same database and uploads. The packaged frontend remains the original control for comparisons.

**Three-browser issue rollback verification, November 20.** On GitLab CE 19.5.3, all three browsers used Fountain `44219116` and prepared Tiptap tree `307cccf7` (Rspack manifest `eced0228`). Each browser reopened two Fountain-authored issues and two fallback-authored controls on the same local volumes. A period typed immediately before Save persisted. Backspace removed that period on the next edit. A subsequent Markdown save and the original bold discussion comment survived reload on all 12 records. The comment held focus during the Bold click in both save orders on each browser.

| Linux desktop browser | Issue numbers | Final period to Save | Backspace to Save | Build identities and evidence |
| --- | --- | --- | --- | --- |
| Chromium 151 | #647–650 | 3.1–5.5 ms | 3.7–9.6 ms | [Fountain](../../../artifacts/gitlab-compatibility/toolbar-focus-chromium-20261120/fountain-1/report.json) · [Fallback](../../../artifacts/gitlab-compatibility/toolbar-focus-chromium-20261120/prepared-1/report.json) · [Reopened issue](../../../artifacts/gitlab-compatibility/toolbar-focus-chromium-20261120/prepared-1/fountain-description-before-comment-after-rollback.png) |
| Firefox 153 | #643–646 | 16–33 ms | 15–29 ms | [Fountain](../../../artifacts/gitlab-compatibility/toolbar-focus-firefox-20261120/fountain-4/report.json) · [Fallback](../../../artifacts/gitlab-compatibility/toolbar-focus-firefox-20261120/prepared-4/report.json) · [Reopened issue](../../../artifacts/gitlab-compatibility/toolbar-focus-firefox-20261120/prepared-4/fountain-description-before-comment-after-rollback.png) |
| WebKit 26.5 | #651–654 | 10–13 ms | 9–29 ms | [Fountain](../../../artifacts/gitlab-compatibility/toolbar-focus-webkit-20261120/fountain-1/report.json) · [Fallback](../../../artifacts/gitlab-compatibility/toolbar-focus-webkit-20261120/prepared-1/report.json) · [Reopened issue](../../../artifacts/gitlab-compatibility/toolbar-focus-webkit-20261120/prepared-1/fountain-description-before-comment-after-rollback.png) |

The WebKit deployment needed one automatic retry after the Puma logger exited during initial startup. All sessions passed build identification before editing. These checks cover an administrator on the pinned local deployment. The earlier Firefox wrong-character deletion and intermittent failure to open the Markdown edit form are documented below.

In the earlier two-patch deployment, each browser used Fountain `269741c1` and prepared Tiptap tree `075b931b`. The first rich-text Save retained the entire phrase, including its final period, on two Fountain-authored issues and two controls per browser. After reload, the reader and API agreed. All formatted discussion comments and subsequent Markdown saves survived. These runs recorded zero page errors.

| Desktop browser on Linux | Issue numbers | Final key to Save | Run records and visual check |
| --- | --- | --- | --- |
| Chromium 151 | 584–587 | 5.4–7.5 ms | [Fountain](../../../artifacts/gitlab-compatibility/prepared-rich-rollback-20261119/fountain-2/report.json) · [Prepared Tiptap](../../../artifacts/gitlab-compatibility/prepared-rich-rollback-20261119/prepared-2/report.json) · [Reloaded issue](../../../artifacts/gitlab-compatibility/prepared-rich-rollback-20261119/prepared-2/fountain-description-and-comment-first-rich-save.png) |
| WebKit 26.5 | 588–591 | 8–13 ms | [Fountain](../../../artifacts/gitlab-compatibility/tiptap-rollback-webkit-20261119/fountain-1/report.json) · [Prepared Tiptap](../../../artifacts/gitlab-compatibility/tiptap-rollback-webkit-20261119/prepared-1/report.json) · [Reloaded issue](../../../artifacts/gitlab-compatibility/tiptap-rollback-webkit-20261119/prepared-1/fountain-description-and-comment-first-rich-save.png) |
| Firefox 153 | 592–595 | 18–35 ms | [Fountain](../../../artifacts/gitlab-compatibility/tiptap-rollback-firefox-20261119/fountain-1/report.json) · [Prepared Tiptap](../../../artifacts/gitlab-compatibility/tiptap-rollback-firefox-20261119/prepared-1/report.json) · [Reloaded issue](../../../artifacts/gitlab-compatibility/tiptap-rollback-firefox-20261119/prepared-1/fountain-description-and-comment-first-rich-save.png) |

On November 20, Fountain build `44219116` and the same prepared Tiptap tree were tested on issues #615–618 in Chromium 151. On every issue an author saved immediately after typing a period, reopened the persisted description, then deleted that period and saved immediately again. Key-to-click intervals were 3.1–10.4 ms for insertion and 3.8–12.2 ms for Backspace. GitLab’s API and a reloaded reader retained each edit. All four formatted comments survived the later Markdown save. [Fountain writer and build](../../../artifacts/gitlab-compatibility/drawer-rollback-20261120/fountain-2/report.json) · [Fallback build, input timings and persisted values](../../../artifacts/gitlab-compatibility/drawer-rollback-20261120/prepared-2/report.json) · [Reloaded issue](../../../artifacts/gitlab-compatibility/drawer-rollback-20261120/prepared-2/fountain-description-before-comment-after-rollback.png)

The WebKit 26.5 follow-up on issues #623–626 measured the caret after clicking the paragraph, after Ctrl+End, and at Backspace. On all four, it moved from offset 53 to 69 and stayed there until deletion. The final period disappeared in the editor, issue API and reloaded reader. The key-to-Save intervals were 7–13 ms for insertion and 11–25 ms for deletion. [Fountain build and source records](../../../artifacts/gitlab-compatibility/drawer-rollback-webkit-20261120/fountain-1/report.json) · [Tiptap build and retained edits](../../../artifacts/gitlab-compatibility/drawer-rollback-webkit-20261120/prepared-1/report.json)

Firefox 153 retained all four insertions on issues #619–622. Three deletions removed the final period. On #620 the paragraph already read “Chcked after rollback.” when Save was clicked, 29 ms after Backspace. The API and reloaded reader reproduced that text. This establishes a wrong-character deletion before Save. The caret location in this first run was not recorded. [Fountain writer](../../../artifacts/gitlab-compatibility/drawer-rollback-firefox-20261120/fountain-1/report.json) · [Fallback input and saved text](../../../artifacts/gitlab-compatibility/drawer-rollback-firefox-20261120/prepared-1/report.json)

A repeat exited during the Sidekiq logger restart before sign-in. A subsequent Firefox run identified both builds and completed both Fountain save orders. In both prepared-Tiptap controls the discussion stayed blank when text was entered immediately after clicking Bold. The run stopped before the rollback edits. This attempt supplied no deletion result and exposed a post-toolbar input failure. [Startup receipt](../../../artifacts/gitlab-compatibility/drawer-rollback-firefox-20261120/prepared-2/report.json) · [Fountain controls](../../../artifacts/gitlab-compatibility/drawer-rollback-firefox-20261120/fountain-3/report.json) · [Fallback controls](../../../artifacts/gitlab-compatibility/drawer-rollback-firefox-20261120/prepared-3/report.json) · [Affected Firefox editor](../../../artifacts/gitlab-compatibility/drawer-rollback-firefox-20261120/prepared-3/description-and-comment-interrupted.png)

The [first fallback attempt](../../../artifacts/gitlab-compatibility/prepared-rich-rollback-20261119/prepared-1/report.json) used the current-document patch alone. Its form stayed open after an immediate Save. The new regression test reproduced an extra Markdown render when the current source came back through Vue. The repair recognizes the source and immutable ProseMirror document that produced it. External replacements still load. Both upstream component suites passed (130 tests).

The formatting-button repair uses Tiptap’s editor view to return focus synchronously before applying inline formatting, quotes or lists. In Firefox 153 on packaged GitLab, the comment regained focus 12–13 ms after the Bold click in the two matched save orders. In Fountain and prepared Tiptap tree `307cccf7`, the comment already held focus in the same click handler’s bubbling phase and both saved comments retained bold text. Fountain and stock passed all 44 independent-editor checks. The repaired fallback also retained the rapid insertions and deletions on four issues in this attempt. On issue #640 the subsequent Markdown editing form was unavailable, so this rollback attempt remains incomplete. [Matched stock and Fountain builds](../../../artifacts/gitlab-compatibility/toolbar-focus-firefox-20261120/comparison-3/report.md) · [Prepared build and first four deletion checks](../../../artifacts/gitlab-compatibility/toolbar-focus-firefox-20261120/prepared-3/report.json) · [Bold comment draft](../../../artifacts/gitlab-compatibility/toolbar-focus-firefox-20261120/prepared-3/description-and-comment-comment-draft.png)

The complete Firefox repeat used the same source tree and newly authored issues #643–646. Both fallback composers received the immediate input inside the comment and retained its bold formatting. All four rapid insertions (16–33 ms to Save), final-character deletions (15–29 ms), subsequent Markdown edits and original comments survived reload. The caret moved from offset 49 to 69 on Ctrl+End and remained at 69 until Backspace in every case. The earlier wrong-character deletion and the unavailable edit form did not recur; their causes remain unconfirmed. The November 20 three-browser table above identifies the runs on this same three-patch tree. [Fountain build and records](../../../artifacts/gitlab-compatibility/toolbar-focus-firefox-20261120/fountain-4/report.json) · [Complete prepared Firefox rollback](../../../artifacts/gitlab-compatibility/toolbar-focus-firefox-20261120/prepared-4/report.json) · [Reopened issue and comment](../../../artifacts/gitlab-compatibility/toolbar-focus-firefox-20261120/prepared-4/fountain-description-before-comment-after-rollback.png)

Start with the pinned GitLab source checkout, the installed Fountain candidate, Docker and the Linux toolchain used for the native build. Set `gitlab_source` to the pinned GitLab checkout and `fallback` to a new absolute directory outside that checkout. From the FountainJS repository:

```sh
fountain_repo=$(pwd)
git -C "$gitlab_source" worktree add --detach "$fallback" 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf
git -C "$fallback" apply --index "$fountain_repo/integrations/gitlab/patches/gitlab-19.5.3-current-document.patch"
git -C "$fallback" apply --index "$fountain_repo/integrations/gitlab/patches/gitlab-19.5.3-tiptap-save-echo.patch"
git -C "$fallback" apply --index "$fountain_repo/integrations/gitlab/patches/gitlab-19.5.3-tiptap-toolbar-focus.patch"
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

### Reproduce a live two-author wiki edit

Use the pinned local GitLab instance and its standard frontend. The test uses `wiki_collaborative_editing` for the isolated project's personal namespace. If the flag starts disabled, the collector temporarily enables it for that namespace. If it already has exactly that namespace gate, the collector uses the existing configuration. The administrator edits an existing wiki and leaves the changes unsaved. A Developer joins from a separate signed-in browser session, adds text, undoes and redoes their own change. The administrator saves and the Developer reloads the wiki reader. The collector restores the namespace flag and the fixture account's previous membership.

```sh
run_id=wiki-live-$(date -u +%Y%m%d-%H%M%S)
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id" --editor original
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id" --editor fountain
node scripts/compare-gitlab-compatibility.mjs --original "artifacts/gitlab-compatibility/$run_id/original-1/report.json" --fountain "artifacts/gitlab-compatibility/$run_id/fountain-1/report.json" --output "artifacts/gitlab-compatibility/$run_id/comparison"
```

The report records the two mounted editor identities, the unsaved text the second author received, presence in each direction, the first author's text after peer undo and redo, exact saved source and reader formatting. For the stock build it also records the two shared XML paragraphs from the live Yjs binding. The test checks that each editor visibly paints the other author’s named cursor. It excludes cursor labels from paragraph text and reads saved content independently through the wiki API. The browser receipt records the order of room initialization and subscription confirmation.

To compare source fidelity with the optional wiki controller installed, prepare it with `node scripts/prepare-gitlab-suggestion-history.mjs "$GITLAB_SOURCE" --wiki-restore`. Use a fresh run ID for the two runs above, add `--wiki-restore` to **both** editor commands, then run the same comparator. The controller reads the stored wiki file’s line endings when the Fountain rich form requests source preservation. The [matched optional-controller run](../../../artifacts/gitlab-compatibility/wiki-live-source-20261121/verified/report.md) retained the original LF break on Fountain. Stock stored CRLF. The [packaged-backend run](../../../artifacts/gitlab-compatibility/wiki-provider-20261121/verified/report.md) stored CRLF on both sides.

Use `--wiki-code` on both wiki collaboration runs with a fresh run ID to test a fenced Python function. The second author changes an indented return value, undoes and redoes the change while the first author observes, then both verify the saved code in GitLab. Adding `--wiki-restore` to both fixed deployments also exercises original line-ending retention. [Matched source and reader evidence](../../../artifacts/gitlab-compatibility/wiki-fenced-code-20261121/verified/report.md).

Use `--wiki-code-params` in place of `--wiki-code` on the two fixed-deployment commands to test parameter retention. The fixture uses the same Python language in both listings and supplies a different filename in each fence. The [matched comparison](../../../artifacts/gitlab-compatibility/wiki-fence-params-20261121/verified/report.md) checks the code edit, both separators in saved Markdown, and the metadata in GitLab’s reopened reader.

Use `--wiki-code-params=repeated` to give both Python listings the same filename. In the [matched repeated-filename run](../../../artifacts/gitlab-compatibility/wiki-repeated-fence-20261121/verified/report.md), the peer edited the first listing and the saved source retained its two spaces and the second listing’s colon. Source matching is local to the joined wiki session and uses the identity of each live code block through subsequent text edits.

To repeat the code handover on the packaged backend, run the two commands below from the same pinned installation. Each command starts with the named editor, switches the frontend once, checks the unsaved code in a fresh browser, and saves another edit.

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id-code-switch" --editor original --wiki-code --verify-wiki-rollout
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id-code-switch" --editor fountain --wiki-code --verify-draft-rollback --structured-wiki-rollback
```

To check an unsaved draft during rollback, run the following on the same isolated deployment. It first confirms that two Fountain sessions see the draft while the wiki API still serves the last save. It closes both editor tabs. On this single-container deployment, replacing the frontend also restarts Redis. The test records the update count and SHA-256 of the fixture’s room log, checkpoints local Redis to its existing data volume, and requires the same count and hash on the stock deployment. It verifies the stock build identity and opens the wiki in a fresh browser context.

In the [first run without the Redis checkpoint](../../../artifacts/gitlab-compatibility/wiki-room-rollback-20261121/fountain-1/report.json), the fresh stock session showed the last saved revision and omitted the unsaved sentence both authors had seen. In the [checkpointed run](../../../artifacts/gitlab-compatibility/wiki-room-rollback-20261121/fountain-2/report.json), all six room updates had the same hash after restart. The Developer recovered the unsaved sentence in a fresh stock browser session, added “Published.”, saved, and reopened the formatted page. [Recovered stock editor](../../../artifacts/gitlab-compatibility/wiki-room-rollback-20261121/fountain-2/stock-recovered-draft.png).

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id-rollback" --editor fountain --verify-draft-rollback
```

To reproduce the mixed-editor workflow on the same single-container profile, use a fresh run ID and the following command. A Developer keeps the native Fountain wiki open through the deployment switch. The administrator opens that same wiki in the packaged stock editor. The collector verifies the two frontend builds, both authenticated users, changes on both screens, each author's undo and redo, named peer cursors, and the Markdown stored after Save. The authors also type in different paragraphs concurrently. DOM observers on both editors must see a local-only edit before both edits appear, and the API and reloaded reader must retain the combined text. The mixed run has its own evidence and is excluded from same-editor comparisons.

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id-mixed" --editor fountain --verify-mixed-wiki
```

To test rollout in the opposite direction, start with the packaged stock editor. The fixture contains a heading, bold name, nested list, quote, titled link, aligned pipe table, merged HTML table and status paragraph. The two stock authors confirm the unsaved status, nested list edit and changed table cell before both leave the room. After checkpointing the room and switching the frontend, a fresh Developer browser opens Fountain, edits the recovered draft, undoes and redoes its own edit, saves, and reloads the reader. The collector checks the nested text and its parent in the stock editor, the fresh Fountain editor and the reopened GitLab reader. The Developer edits the link label, undoes and redoes that edit, and checks the link’s URL and title after reopening. The Developer also edits a different table cell and undoes and redoes that edit. The collector checks cell roles, row contents and displayed alignment before and after the handover. In the merged table, the stock author edits the second paragraph in a two-row cell. The replacement author edits the neighboring contact, then undoes and redoes it. The assertions cover the two-column header, row span, paragraph boundaries, unchanged neighbors, saved source and reopened table. It compares the saved Markdown, including the link, list markers, table delimiter row and line endings. The report records both build identities and the room digest before and after the switch. The [verified table handover](../../../artifacts/gitlab-compatibility/wiki-table-rollout-20261121/original-3/report.json) includes screenshots of the stock reader and the reader after Fountain Save. Both displayed left-aligned headers while retaining the authored alignment attributes. The [merged-cell comparison](../../../artifacts/gitlab-compatibility/wiki-merged-rollout-20261121/original-6/report.json) records the nine room updates and the exact saved source after both authors edited different cells. Its namespace flag began off and returned to off. In [an earlier run](../../../artifacts/gitlab-compatibility/wiki-merged-rollout-20261121/original-5/report.json), the source API reported a scoped actor and the destination API reported off. Its underlying stored state was unmeasured. The [preconfigured run](../../../artifacts/gitlab-compatibility/wiki-preconfigured-rollout-20261121/original-2/report.json) verified both the API and PostgreSQL on either side of the switch. Check `stockReaderMatchesAuthoredAlignment` and `rollout.readerMatchesAuthoredAlignment` for fidelity to the author’s layout.

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id-rollout" --editor original --verify-wiki-rollout
```

To verify a deployment with wiki collaboration already enabled for the project namespace, add `--preconfigured-wiki` to the stock rollout command. The fixture records the Features API response and reads the matching rows in PostgreSQL before it changes the namespace gate. The source and destination use the same persisted actor. The report records both the gate after the editors close and the original configuration after fixture cleanup. A disagreement at initial setup stops the comparison before a wiki is created.

To test the opposite deployment direction with the same structured document, run the following on the pinned local installation. Fountain creates the initial shared room from GitLab’s rendered preview. Both authors edit the room before GitLab switches back to the packaged stock frontend. The same source, table, link and reader checks apply after the switch. The [native-first comparison](../../../artifacts/gitlab-compatibility/wiki-native-seed-20261121/fountain-3/report.json) verified the unsaved edits, author-local undo and redo, nine room updates, exact saved Markdown and final reader.

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id-structured-rollback" --editor fountain --verify-draft-rollback --structured-wiki-rollback
```

Add `--wiki-page-links` to either wiki handover command to exercise double-bracket links. The fixture creates its destination wiki if needed and verifies the destination text before testing. The first authoring session saves an aliased link and a shorthand link. After the frontend switch, the second author edits the alias, undoes and redoes it, saves the exact expected Markdown, then follows the link in the reopened reader and checks the destination page.

Use `--wiki-reference-links` on either command or on two independent `--suite wiki-collaboration` runs with `--editor original` and `--editor fountain` for two Markdown links that share a titled definition. A second signed-in author changes the first link’s label and saves. The report records whether that save kept the shared definition or expanded both URLs inline. After the switch, the next author edits the label, undoes and redoes the edit, saves and opens the target from the reader. The collector also checks the second link, both titles and the GitLab API’s stored Markdown.

To test a file upload across the deployment switch, run the stock rollout and Fountain structured rollback commands above with `--wiki-pending-upload` and fresh run IDs. The Developer attaches a text file through the wiki’s file picker. The collector waits for GitLab to accept the actual bytes, holds delivery of the HTTP response to the uploader, and switches the frontend while that tab stays open. The other author edits the wiki before the response is released. The final assertions check one upload request, both authors’ text, the saved Markdown link and the exact bytes served by the reopened reader. [Stock-to-Fountain result](../../../artifacts/gitlab-compatibility/wiki-pending-upload-20261121/original-4/report.json) · [Fountain-to-stock result](../../../artifacts/gitlab-compatibility/wiki-pending-upload-20261121/fountain-4/report.json).

#### Reproduce rollback of aligned issue checkboxes

Start with a separate pinned fallback worktree containing the five staged patches described in [the wiki upload rollback](#reproduce-the-prepared-rollback-with-a-pending-wiki-upload). Keep the Fountain candidate installed in its own checkout. From the Fountain repository, apply the following additions to the fallback worktree. The issue reader uses the same CSS file as the replacement integration.

```sh
test "$(git -C "$fallback" write-tree)" = 084f348a1f39c84bdfcbebabc03e7b227e4583ad || exit 1
git -C "$fallback" apply --index "$PWD/integrations/gitlab/patches/gitlab-19.5.3-tiptap-original-markdown.patch"
git -C "$fallback" apply --index "$PWD/integrations/gitlab/patches/gitlab-19.5.3-tiptap-table-reader.patch"
reader_style=app/assets/javascripts/work_items/components/fountain_work_item_table_tasks.css
cp integrations/gitlab/components/work_item_table_tasks.css "$fallback/$reader_style"
# Pin the file mode from the tested source tree across native and Windows checkouts.
git -C "$fallback" add --chmod=+x -- "$reader_style"
test "$(git -C "$fallback" write-tree)" = 6133fd5fecf0e94a017e8920e7e587947b44a726 || exit 1
(
  cd "$fallback" || exit 1
  corepack yarn install --frozen-lockfile &&
    FOSS_ONLY=1 corepack yarn jest --runInBand \
      spec/frontend/content_editor/services/content_editor_spec.js \
      spec/frontend/content_editor/components/content_editor_spec.js \
      spec/frontend/vue_shared/components/markdown/markdown_editor_spec.js &&
    FOSS_ONLY=1 RAYON_NUM_THREADS=3 corepack yarn rspack-prod
)
```

Use the same browser, run ID and attempt for both commands. Start with a fresh run ID per browser. Set `PLAYWRIGHT_BROWSERS_PATH` to the installed Linux browser cache if it is outside the Playwright default. The first run creates two issues with Fountain and leaves its deployment stopped. The second switches the same backend volumes to the prepared Tiptap frontend, creates two independent controls, then edits all four records through Markdown and rich text. The collector checks the prior deployment, package identity, loaded scripts, issue identities and exact source before editing. It retains the stored Markdown, per-cell data, checkbox coordinates and reader screenshots. A failed rollback sets a nonzero exit code. The receipt is `prepared-1/report.json` in the run directory.

```sh
browser=chromium  # Repeat with firefox and webkit.
run_id=aligned-issue-$browser-$(date -u +%Y%m%d-%H%M%S)
node scripts/run-gitlab-compatibility.mjs --suite table-checkbox-recovery --aligned-checkboxes \
  --browser "$browser" --editor fountain --run-id "$run_id" &&
node scripts/run-gitlab-compatibility.mjs --suite table-checkbox-recovery --aligned-checkboxes \
  --browser "$browser" --editor prepared --run-id "$run_id" --verify-rollback --prepared-source "$fallback"
```

To repeat the packaged stock comparison, use a separate fresh run ID, repeat the Fountain command, then run `--editor original --verify-rollback` with the same suite, fixture and run ID. The prepared build is an opt-in deployment target and has its own build identity. [Results and limits](../COMPATIBILITY_GRID_RESULTS.md#rollback-of-aligned-issue-checkboxes).

#### Reproduce the prepared rollback with a pending wiki upload

In a separate pinned GitLab checkout, apply the three patches from [the prepared Tiptap rollback](#reproduce-the-prepared-tiptap-rich-text-rollback). Before building, add the wiki upload guard and room-replay patch. Run the following from the FountainJS checkout with `fallback` set to the absolute path of this prepared checkout. Use the same pinned dependencies as the three-patch build.

```sh
git -C "$fallback" apply --index "$PWD/integrations/gitlab/patches/gitlab-19.5.3-tiptap-wiki-upload.patch"
git -C "$fallback" apply --index "$PWD/integrations/gitlab/patches/gitlab-19.5.3-tiptap-wiki-upload-replay.patch"
(cd "$fallback" && FOSS_ONLY=1 corepack yarn rspack-prod)
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --editor fountain \
  --run-id "prepared-wiki-upload-$(date +%s)" --verify-draft-rollback --structured-wiki-rollback \
  --wiki-pending-upload --wiki-upload-rollback-source "$fallback"
```

**Issue Save on the combined fallback, November 21.** Fountain `daa122ba` and the prepared tree `084f348a` (Rspack manifest `91235006`) used the same GitLab CE 19.5.3 database and uploads. In each desktop browser the fallback reopened two Fountain-authored issues and two fallback-authored controls. All 12 retained the final period on immediate Save, its deletion on the next immediate Save, the later Markdown edit and the original bold discussion comment. The issue and wiki scripts loaded by each browser matched the deployed files. The first Firefox attempt stopped before a browser launched. The completed Firefox pair used the installed Linux browser cache.

| Linux browser | Issues | Final key to Save | Backspace to Save | Build records |
| --- | --- | --- | --- | --- |
| Chromium 151 | 697–700 | 2.9–4.4 ms | 3.5–5.5 ms | [Fountain](../../../artifacts/gitlab-compatibility/combined-rollback-chromium-20261121/fountain-1/report.json) · [Fallback](../../../artifacts/gitlab-compatibility/combined-rollback-chromium-20261121/prepared-1/report.json) · [Reopened issue](../../../artifacts/gitlab-compatibility/combined-rollback-chromium-20261121/prepared-1/fountain-description-before-comment-after-rollback.png) |
| Firefox 153 | 701–704 | 16–31 ms | 14–32 ms | [Fountain](../../../artifacts/gitlab-compatibility/combined-rollback-firefox-20261121/fountain-2/report.json) · [Fallback](../../../artifacts/gitlab-compatibility/combined-rollback-firefox-20261121/prepared-2/report.json) · [Reopened issue](../../../artifacts/gitlab-compatibility/combined-rollback-firefox-20261121/prepared-2/fountain-description-before-comment-after-rollback.png) |
| WebKit 26.5 | 705–708 | 8–11 ms | 9–13 ms | [Fountain](../../../artifacts/gitlab-compatibility/combined-rollback-webkit-20261121/fountain-1/report.json) · [Fallback](../../../artifacts/gitlab-compatibility/combined-rollback-webkit-20261121/prepared-1/report.json) · [Reopened issue](../../../artifacts/gitlab-compatibility/combined-rollback-webkit-20261121/prepared-1/fountain-description-before-comment-after-rollback.png) |

To check rapid issue saves on this same five-patch build, use both [composer rollback commands](#reproduce-the-prepared-tiptap-rich-text-rollback) with this `fallback` directory and a fresh run ID. The fallback run opens a test wiki and an issue before editing so it can identify both sets of deployed scripts. Set `PLAYWRIGHT_BROWSERS_PATH` if your Linux browsers are installed in a separate cache.

Use a Fountain publisher with room reservations (first included in `daa122ba`) and the prepared Tiptap wiki build from the commands above. The filename travels in live presence. A numbered reservation for each uploading browser travels in shared room metadata. It stays separate from the published Markdown. The prepared form waits for the initial room state, then guards Save while reservations or live notices exist. Completion, cancellation and failure clear the uploader’s reservation.

If the uploader has gone away and left an unfinished reservation, contact the author to verify the transfer stopped. **Review interrupted uploads** offers an explicit recovery action. Confirming clears only the selected absent browsers’ original reservations. A newer batch or a browser that has returned stays protected. Clearing a reservation does not attach a file or submit a revision. Reattach any missing file before saving.

To test an uploader that never returns, add `--wiki-abandoned-upload` and use a fresh run ID. The browser selects a real file and GitLab accepts the bytes. After the app node stops, the collector closes the uploading tab while its response is still withheld. The other author cancels recovery once, confirms it on the second attempt, checks the saved wiki is untouched, and reattaches the file through the GitLab picker. The test verifies the single reopened link and downloaded bytes. The originally accepted upload can remain in GitLab storage.

The collector delays incoming wiki presence after rollback while allowing room initialization, document edits and HTTP traffic through. It records the initial Save state, attempts Save before the filename arrives, then checks both authors’ edits and downloads the final attachment. The [earlier presence-only fallback](../../../artifacts/gitlab-compatibility/wiki-upload-prepared-20261121/fountain-3/report.json) reproduced a text-only revision. Use the packaged procedure below for older uploaders or an unmodified fallback.

For a planned rollback, let uploaders finish and save the attachment links before switching the frontend. If rollback happens during an upload, keep the original uploader tab open. In the [live rollback](../../../artifacts/gitlab-compatibility/wiki-early-handover-20261121/fountain-1/report.json), stock GitLab offered Save before it could display the pending filename. The resulting revision contained both authors’ text and no attachment. Reopening that wiki for editing allowed the two tabs to receive the final link. The author saved it explicitly and verified the downloaded file from the reader. In the [opposite rollout](../../../artifacts/gitlab-compatibility/wiki-early-handover-20261121/original-1/report.json), Fountain displayed the pending filename and prevented an early Save, including Ctrl+Enter. Both runs checked the same builds, backend, fixture and collector. An intermediate stock revision remains a text-only revision even after the file arrives.

To check a peer saving before upload completion without switching frontends, run the same fixture twice on the pinned deployment. Inspect `observations[0].pendingUpload.peerSave` for the button state and intermediate saved source or keyboard submission observation. Both runs verify the final reader download. The [matched report](../../../artifacts/gitlab-compatibility/wiki-peer-save-20261121/verified/report.md) records the Save behavior and the shared line-ending limitation. Use a fresh run ID shared by both commands.

```sh
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id" --editor original --wiki-pending-upload
node scripts/run-gitlab-compatibility.mjs --suite wiki-collaboration --run-id "$run_id" --editor fountain --wiki-pending-upload
node scripts/compare-gitlab-compatibility.mjs --original "artifacts/gitlab-compatibility/$run_id/original-1/report.json" --fountain "artifacts/gitlab-compatibility/$run_id/fountain-1/report.json" --output "artifacts/gitlab-compatibility/$run_id/verified"
```

For a source-preserving deployment, add `--wiki-restore` to both same-editor pending-upload commands with a fresh run ID. The [matched comparison](../../../artifacts/gitlab-compatibility/wiki-peer-save-source-20261121/verified/report.md) identifies the controller patch loaded on both sides. Fountain retained the LF Markdown from the two-author draft through the attachment revision and blocked Save until the link arrived. Stock converted both revisions to CRLF. The reopened download matched the original 65 bytes in both editors.

Use `--wiki-interrupted-upload` in place of `--wiki-pending-upload` on those two same-editor runs to fail the first multipart request before forwarding it. The second author edits before the fault. The collector checks the visible failure, uses Retry or the file picker, counts the actual requests forwarded, reloads the reader, and compares the downloaded bytes. The [interruption report](../../../artifacts/gitlab-compatibility/wiki-interrupted-upload-20261121/verified/report.md) covers this browser-side fault. Use `--wiki-partial-upload` on the same two Chromium runs to interrupt a 1,064,960-byte file during transfer. This profile correlates browser progress with a request-length record from the test deployment at NGINX ingress. The [matched partial-transfer report](../../../artifacts/gitlab-compatibility/wiki-partial-upload-20261121/verified/report.md) verifies incomplete receipt on the first request, a successful retry, both edits and a byte-identical download.

Use `--wiki-uploader-close` on the same two commands for a departing uploader. The browser with the file closes before its request reaches GitLab. The other author waits for the uploader to leave the collaborator list, edits again, saves, and reloads. Compare the saved Markdown and reader text in `pendingUpload.departure`. In the [matched results](../../../artifacts/gitlab-compatibility/wiki-uploader-close-20261121/verified/report.md), stock retained the filename as plain text. Fountain retained the intentionally created empty paragraph, represented in GitLab Markdown as `<p data-fountain-empty="text"></p>`. The reader showed both authors’ text. The recorded time measures until the collector had observed both departure and an enabled Save button.

The single-container rollback suite checkpoints Redis after fixture cleanup as well as before switching frontends. This prevents a cold boot from reopening the earlier snapshot of the temporary feature flag. An [observed cold start](../../../artifacts/gitlab-compatibility/wiki-native-seed-20261121/fountain-1/report.json) returned a namespace actor from the API while PostgreSQL held no enabled gate. The collector stopped before editor setup. In this isolated deployment, expiring the single wiki flag cache made GitLab report the stored off value. The [following boot](../../../artifacts/gitlab-compatibility/wiki-native-seed-20261121/fountain-2/report.json) recorded agreement.

To exercise the wire adapter independently of the browser, build the native runtime and run the following from the Fountain checkout. Pass the pinned GitLab source checkout with its installed JavaScript dependencies.

```sh
node scripts/build-gitlab-native-runtime.mjs
node scripts/check-gitlab-wiki-wire.mjs "$GITLAB_SOURCE"
```

The check takes the paragraph and bold mark recorded by the real stock wiki, creates separate stock and Fountain Yjs documents, and delivers incremental updates after each side edits the same paragraph offline. It checks convergence through the stock schema, relative cursor identity, author-local undo, a stale write, and a second client joining before the elected seed finishes. A formatted-text case renames bold `Sam` to `Samira` while the stock author adds `Team ` to the start of the same paragraph. Undo restores `Sam` and keeps the peer’s addition. The fixture also cancels a pending seed and checks that the room stays empty. It delivers the room initialization before confirming the subscription, verifies that the elected client waits before writing, and checks that a subscription that never confirms leaves the room untouched. In the editor-session check, an author edits while disconnected. Save refuses that draft until the connection returns, then serializes the retained edit. A stock schema that drops a requested heading level is refused before any shared write. [Results, runtime identity and library hashes](../../../artifacts/gitlab-wiki-wire-20261121.json). This check uses the [private document binding](../services/wiki_room_document.ts). The binding currently maps paragraphs, headings, ordinary quotes and lists, breaks, and basic text marks. Unmapped content and source attributes stop conversion. The [matched Chromium pair](../../../artifacts/gitlab-compatibility/wiki-provider-20261121/verified/report.md) verifies mounting, named peer cursors, author-local undo, and a saved page reopened by the other author. Both forms stored CRLF for the original LF paragraph break.

### Reproduce a host-defined label serializer

Use the pinned local GitLab checkout and the same build command as the default native installation. The optional `--custom-label-host` profile supplies [an issue-label node and a keyboard-shortcut mark](../testing/issue_label_host.js) through the Markdown editor component’s public props. Their Markdown writers produce a GitLab label reference and a `<kbd>` span. The installed frontend identity includes this profile. Packaged GitLab provides the control for both features.

```sh
run_id=custom-label-$(date -u +%Y%m%d-%H%M%S)
node scripts/build-gitlab-native-runtime.mjs
node scripts/install-gitlab-native-browser.mjs "$GITLAB_SOURCE" --custom-label-host
(cd "$GITLAB_SOURCE" && FOSS_ONLY=1 yarn rspack-prod)
node scripts/run-gitlab-compatibility.mjs --suite custom-label --run-id "$run_id" --editor original
node scripts/run-gitlab-compatibility.mjs --suite custom-label --run-id "$run_id" --editor fountain
node scripts/compare-gitlab-compatibility.mjs --original "artifacts/gitlab-compatibility/$run_id/original-1/report.json" --fountain "artifacts/gitlab-compatibility/$run_id/fountain-1/report.json" --output "artifacts/gitlab-compatibility/$run_id/verified"
```

After the comparison, rerun the installer without `--custom-label-host` and rebuild the frontend to restore the default native host. On issue #691, the [restored standard build](../../../artifacts/gitlab-compatibility/standard-host-after-custom-label-20261120/fountain-1/report.json) retained a linked image’s edited description, asset URL and separate reader link through Save and reopen. On issue #695, the [standard host restored after the keyboard-mark run](../../../artifacts/gitlab-compatibility/standard-host-after-custom-mark-20261120/fountain-1/report.json) also saved and reopened the linked figure with the edited description, original asset and link intact. This restoration check uses a separate issue. The [custom-host comparison](../../../artifacts/gitlab-compatibility/custom-mark-20261120/verified/report.md) covers the keyboard edit, label reference and exact saved Markdown.

### Roll back an issue containing uncited footnotes

Start with the compiled Fountain UI installed in the pinned isolated deployment. Run the two commands from the same checkout with the same data volumes. The first edits a paragraph in rich text, saves the issue, and reopens it in Fountain. The second removes the Fountain UI, opens that exact issue in packaged GitLab, enters Markdown mode, and checks every character of the saved source before editing. It appends a paragraph and verifies the issue through the API and a fresh Markdown editor. A disagreement stops the workflow before Save.

```sh
run_id=footnote-handover-$(date -u +%Y%m%d-%H%M%S)
node scripts/run-gitlab-compatibility.mjs --suite footnote-labels --run-id "$run_id" --editor fountain --footnote-handover
node scripts/run-gitlab-compatibility.mjs --suite footnote-labels --run-id "$run_id" --editor original --footnote-handover
```

On issue #688 the [Fountain save](../../../artifacts/gitlab-compatibility/footnote-handover-20261120/fountain-2/report.json) and [packaged GitLab rollback](../../../artifacts/gitlab-compatibility/footnote-handover-20261120/original-2/report.json) retained all twelve definitions across the deployment switch. The stock API and [reopened Markdown editor](../../../artifacts/gitlab-compatibility/footnote-handover-20261120/original-2/rollback-source.png) contained exactly the previous issue source plus the appended paragraph.

For a rollback involving uncited definitions, retain the original Markdown and use GitLab’s plain-text editing mode. The [matched rich-text comparison](../../../artifacts/gitlab-compatibility/footnote-labels-20261120/verified/report.md) shows how an ordinary stock rich-text Save can remove eleven definitions while the reader still displays the cited note correctly.

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
