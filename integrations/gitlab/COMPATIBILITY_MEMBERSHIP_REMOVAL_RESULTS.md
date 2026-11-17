# Full membership removal and draft recovery — 2026-11-17

The final **original-4 / fountain-4** pair records **52 parity, 10 improvement,
zero regression, two shared-limitation and zero incomplete checks across 64
requirements**. The regression gate passes. **Full feature acceptance is red**:
returning nonempty retained source to rich text after membership removal still
fails in both implementations. These are correlated checks for two workflows,
not 64 independent features or full GitLab parity.

## Actual workflow and access controls

The same real non-admin, non-author account edits root-authored issues in the
same pinned private GitLab 19.5.3 project. Developer access first permits an
ordinary rich edit and Save. The author then leaves either a text draft or an
intentionally empty draft. Root removes only that task-owned project membership.

Successful REST and GraphQL description reads precede removal. Afterwards the
member is absent, REST denies the read, GraphQL exposes no work item, and a live
session still identifies the same account. Actual UI Save and a separate denied
REST write leave the persisted description unchanged. No frontend permission
flag replaces these backend controls. Cleanup returns the owned account to Guest.

Root restores Developer access before ordinary reload/Edit, Save and reopen.
The driver never reinjects or retypes a missing draft. Both saved Markdown and
visible headings, prose, marks, links and Python indentation are inspected.
The empty-source contract requires an actual empty string locally and permits
only the host's null/empty representation after persistence.

## Defects and repair ownership

- `services/save_authority_patch.mjs` extends the private parent Save patch.
  A thrown description mutation now displays a retained-draft warning rather
  than only reporting to Sentry. Missing work-item acknowledgement cannot clear
  the draft. Existing business errors and authorized source normalization remain;
  cleanup throwing after acknowledgement does not falsely report a failed Save.
  Title-only failures retain their previous handling.
- The same module patches the existing-item child restoration boundary. A stored
  string is a draft even when empty or whitespace-only. Only an absent draft
  falls back to server content. Create-flow/template behavior is unchanged.
- `services/markdown_codec.ts` maps a cleared default document to empty host
  Markdown instead of `<p data-fountain-empty="text"></p>`. This occurs after
  exact-source preservation, checks complete default structure and leaves
  authored source, multiple blanks, marks and non-default attributes intact.
  It does not strip arbitrary authored HTML or change the public exporter.

The original host silently rejects Save and restores server content over the
empty draft. The repaired integration shows the failure warning and retains both
text and empty drafts through restored access, reload, Save and reopen. The empty
case persists as an allowed null/empty backend value and reopens as empty source.
The private unminified runtime grows by 532 bytes. Public engine/API, dependency,
package version, CSS and acceptance limits are unchanged.

## Visual and collection evidence

The final collector waits for the editor's accessible `Loading` status to finish
before rich graph capture. A terminal conversion error is recorded as a failed
render requirement while collection continues through recovery. An internal HTML
carrier never counts as empty author intent. Missing readiness/authentication
receipts remain incomplete; contradictory raw receipts fail their requirements.

Selected actual PNGs were visually reviewed: both failed text-conversion screens,
the original lost-empty final document, native text/empty Save warnings, native
text/empty reopened documents, and the earlier native empty-carrier failure.
The retained-source disclosure was collapsed; its optional `recoverySource: null`
receipt means its textbox was not observed through the accessible query, not
that its stored value was empty. Exact plain-source and reload/reopen checks
independently establish draft retention. Expanded recovery-pane interaction is
not certified here. The empty description also retains generic comment-placeholder
wording; UI copy polish remains open.

Original-1 stopped on an early empty-edit precondition without adequate selection
readiness proof. Original-2 and native-1 used earlier instruments; native-1 stopped
when the expected rich root was replaced by the explicit recovery screen.
Original-3/native-2 and the first repaired native-3 comparisons are diagnostics:
a pre-conversion blank graph could masquerade as a final empty display. Their
exact instrument is archived. Original-4/native-4 use identical loading-aware
harnesses and supply the final score. Earlier policy/test-preparation errors are
retained and do not count as product defects.

## Verification and remaining scope

**1,567 integration tests / 60 files**, two workers, and strict TypeScript pass.
The actual upstream Vue suites pass **194 tests**; six new component regressions
fail against the previous host. Eight focused boundary regressions fail before
repair and all 65 focused cases pass afterwards. Upstream lint passes. The
resource-limited frontend build completes with its existing two warnings.
All **17 earlier recorded corpora** retain their summaries/gates under the new
comparator; this is interpretation replay, not new browser execution.

The guarded installer restores the exact parent and prepared description files,
then reinstalls all **32** source files with identical digests. This verifies
source rollback with the deployment stopped; compiled deployment rollback is
not claimed. The task deployment is stopped, capped at two CPUs/4 GiB.

The two remaining shared checks cover the same nonempty source-to-rich failure:
GitLab's renderer requires access which has just been removed. No generic
Markdown fallback or authorization bypass is introduced. Session/model retention
across that mode switch needs further work. Other roles/author exceptions,
concurrent membership changes, offline/late/racing saves, other browsers/mobile,
expanded recovery controls and broader product acceptance remain open.
GitHub CLI is signed out at this checkpoint; no push, hosted CI or release occurs.

[Final comparison](../../artifacts/gitlab-compatibility/membership-removal-20261117/comparison-final/report.md)
and [validation receipt](../../artifacts/gitlab-compatibility/membership-removal-20261117/validation.json).
