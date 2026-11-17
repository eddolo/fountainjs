# Matched two-session conflict and recovery audit — 2026-11-17

The accepted original-1 / fountain-1 pair records **37 parity checks** across two
actual issue-description workflows, with no regressions, improvements, shared
limitations or incomplete results. Environment, collection and scoped gates pass.
These are correlated requirements in two scenarios, not 37 independent features
or complete concurrency certification. No production repair was needed.

## Actual competing edits

Two independent authenticated browser contexts open the same real issue before
either types. They use the same root account, not two different roles or users.
The primary session authors a local draft. The second session authors a different
draft and saves through GitLab's real UI. API reads verify the first draft never
wrote early and the remote version remains persisted until explicit resolution.
API writes create the initial issue fixtures only.

Both editors retain the primary local source, display the actual conflict warning
and disclose the exact current server source in a read-only field. One scenario
chooses Discard changes and confirms the discard; the other explicitly chooses
Save and overwrite. The resulting source equals the intended remote/local draft,
respectively. Reloading, starting another edit, adding more text, saving normally
and reopening all succeed without a stale conflict warning. Headings, prose,
bold, links and Python indentation remain intact throughout. Both sessions have
zero observed browser errors.

This verifies the existing GitLab subscription/conflict controls work with the
native Fountain integration. It is not CRDT merging, server-side optimistic
locking, atomic compare-and-swap protection or proof that a disconnected client
cannot overwrite a newer version. The host warning is a UI-level guard. Separate
actors, permission revocation, network loss, late/racing updates, simultaneous
submits, empty descriptions and mobile/other engines still require dedicated
workflows. No broad superiority claim follows from parity here.

## Visual evidence and reproducibility

The pinned CE 19.5.3 backend/image, root actor, private project, source fixture,
Linux Chromium 151, 1280x900 viewport and two-context configuration are matched.
The original/Fountain active rich editor roots are independently checked in both
sessions. Authentication state is copied only in memory; no cookies, passwords,
credentialed traces or sign-in recordings are retained.

The selected original and native conflict/reopened PNGs were visually inspected.
The native editor is taller: its first warning capture shows the warning and
current source but clips the decision buttons below the viewport. Those buttons
were reached through ordinary unforced Playwright clicks during the matched run.
A separate native visual follow-up explicitly scrolls each decision control into
view, checks its viewport/clipping bounds and hit target, and captures it before
clicking. That follow-up changes only observation, not product behavior, and
contributes no new matched-comparison score. The exact original matched collector
is retained in `semantic-instrument`.

The runner supports `--suite conflicts`. Use a fresh run ID or attempt number;
output directories are exclusive. Run original and Fountain sequentially using
`scripts/run-gitlab-compatibility.mjs` beside the isolated Linux Docker engine,
then compare their report files with `scripts/compare-gitlab-compatibility.mjs`.
Both run reports retain fixture/instrument/build/image hashes and exact source/API
receipts. The backend volumes are retained; the task container is stopped after
each run. Resource limits remain two CPUs and 4 GiB.

## Validation and limits

Audit-policy tests reject shared absent warnings, unproven remote editors,
premature overwrite, draft loss and stale-session warnings. Those policy tests
are explicitly separate from real browser evidence. An initial test-fixture type
error was corrected; its failed log remains retained. All 14 historical corpora
keep their exact summaries/gates under interpretation replay, including older red
results. Replay is not a fresh browser run.

**1,504 integration tests / 58 files**, two workers, and strict TypeScript pass.
The native visual follow-up also passes: both decision controls are fully visible
and unobstructed, with identical graphs and exact source outcomes to fountain-1.
The final validation receipt records measured test counts, exact staged source,
raw log and selected PNG hashes, installed/runtime-input consistency, and the
native visual follow-up. This change adds an audit, fixtures, policy tests and
documentation only. Public APIs, core/view implementation, dependencies, package
version, CSS, acceptance budgets and the installed GitLab product remain unchanged.
GitHub push and hosted CI still await CLI sign-in; no release was made.

- [Accepted comparison](../../artifacts/gitlab-compatibility/conflicts-20261117/comparison-1/report.md)
- [Original real-session report](../../artifacts/gitlab-compatibility/conflicts-20261117/original-1/report.json)
- [Fountain real-session report](../../artifacts/gitlab-compatibility/conflicts-20261117/fountain-1/report.json)
- [Validation receipt](../../artifacts/gitlab-compatibility/conflicts-20261117/validation.json)

The [matched non-author access audit](COMPATIBILITY_ACCESS_RESULTS.md) now verifies
Guest/anonymous boundaries and exposes shared pending-draft loss after live edit
permission revocation. Feature acceptance remains red; repair the host Save
acknowledgement/draft-clearing path and rerun before promoting this workflow.
