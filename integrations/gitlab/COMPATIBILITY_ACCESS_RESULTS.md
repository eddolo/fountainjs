# Matched non-author access and revocation audit — 2026-11-17

**Feature acceptance is red.** The completed original-5 / fountain-2 pair records
24 parity checks and seven correlated shared-limitation checks across 31
requirements. There are zero native regressions, improvements or incomplete
outcomes in the accepted pair. Both implementations lose the pending description
after edit permission is revoked. Passing the regression-comparison gate does not
satisfy the draft-retention requirement. This is one demonstrated failure with
seven downstream checks, not seven independent defects or full permission coverage.

## Verified access boundaries

The same actual non-admin account (ID 3, `fountain_compat_access`) is used on both
sides in the same pinned private project. Its administrator-visible identity,
member-visible self identity and actual project memberships are checked. Issues
are authored by root (ID 1), so author exceptions and administrator privileges do
not substitute for the intended role.

As Guest (access level 10), that account reads the description with headings,
formatting, links and Python indentation intact. Description edit controls and
editable roots are absent in the owning description region. A deliberately
attempted REST description write returns 403 and leaves exact server source
unchanged. Reload preserves content. A separate anonymous context reaches the
sign-in page for the private issue and receives 404 from its direct issue API.
Guest comment access is outside the read-only description claim.

As Developer (30), the account uses the real rich editor to append ` Confirmed.`,
Save and reopen successfully. It then appends ` Pending review.` as an unsaved
draft. Root downgrades only this task-owned project member to Guest while the
editor remains open. A fresh authenticated GraphQL permission read returns
`updateWorkItem: false`. The pending draft has not written early.

## Reproduced shared data loss

The next actual UI Save receives HTTP 200, an empty GraphQL error list, an empty
mutation `errors` list and an updated work-item identity. However, the exact
persisted description still contains only `Shared record. Confirmed.`. The editor
closes, no failed-save alert appears, and the pending source is no longer available
in the form. After root restores Developer access, ordinary reload and Edit do
not recover the pending draft. Saving/reopening retains the old source again.
The audit never retypes or reinjects the missing draft to make recovery pass.

Both sides behave equivalently. Backend description protection holds; GitLab's
host Save acknowledgement/draft clearing owns the visible failure. This evidence
does not attribute the loss to either underlying document engine. Source/API
receipts, mutation summaries and selected before/after PNGs show the missing
` Pending review.` text. Browser error arrays are empty; success-shaped application
responses can still lose a draft.

## Smallest repair boundary to investigate next

The pinned, currently unmodified
`app/assets/javascripts/work_items/components/work_item_detail.vue` method
`updateWorkItem` clears the draft and sets `editMode = false` after checking only
the returned error list. The mutation's `WorkItemMutationResult` includes
`WorkItemBase`, which requests `userPermissions.updateWorkItem`.

Investigate guarding that success path when a submitted description returns an
explicitly revoked update ability. Keep the draft and edit form available, show a
clear failure message, and allow recovery after access is restored. This must
preserve normal authorized saves, empty descriptions and legitimate quick-action
normalization. Avoid a generic exact-source equality check that would reject
valid server transformations. Verify the actual mutation permission payload,
component regression, guarded installation/restore and the same matched browser
workflow before claiming this repair. **No production repair is applied here.**

## Audit setup and excluded attempts

Original-1 stopped because the member's own `/api/v4/user` response omits
`is_admin`. The corrected audit obtains explicit non-admin proof from root's user
record and independently verifies the member session's identity. Original-2 and
original-3 stopped at the normal mandatory password-update screen after an admin
password reset; the latter assumed the wrong route. Original-4 passed identity
preflight but failed its exact accessible heading-name observer despite visibly
rendered content. The accepted collector checks exact rendered `h2` text and an
end marker; actual renderer HTML retains GitLab's heading anchor.

The task account's mandatory password update is completed through ordinary UI
controls and another sign-in. Passwords are random, kept only in memory, never
recorded, and never included in screenshots or call logs. No authentication or
permission requirement was bypassed. Excluded reports and exact instruments remain
retained. Their partial observations contribute no superiority claims.

Fountain-1 exited during deployment startup before sign-in (exit 1, OOM false),
with zero editor observations. A fresh attempt followed its confirmed terminal
state. The accepted pair is original-5 / fountain-2. All role cleanup receipts
return the dedicated account to Guest access. No unrelated account/project,
backend implementation, timeout or acceptance limit changed.

## Verification and remaining scope

**1,510 integration tests / 58 files**, two workers, and strict TypeScript pass.
All 15 older corpora retain exact summaries and gate outcomes under interpretation
replay; replay is not new browser execution. Policy tests reject admin/author
substitution, different actual actors, absent editor proof, unauthorized writes
and shared draft loss. Raw staged hashes, exact log bytes, selected original PNGs
and unchanged runtime/installed-source hashes are recorded in the validation
receipt. The task container is stopped after each run, capped at two CPUs/4 GiB.

The reader, pending draft and lost/reopened draft screenshots were visually
inspected. Some reader captures show unrelated child/activity panels loading;
readiness checks and claims cover the description region only. No full-page,
comment-composer or accessibility certification is inferred from those frames.

This adds audit/fixture/policy/documentation code only. No public API, engine,
installed host, dependency, package version, stylesheet or budget changed. The
revoked-save repair remains next. Full membership removal, other roles/author
exceptions, concurrent role changes, offline/racing saves, other browsers/mobile
and broader application acceptance remain open. GitHub push/hosted CI still await
CLI sign-in; no release was made.

- [Accepted comparison and red feature gate](../../artifacts/gitlab-compatibility/access-20261117/comparison-1/report.json)
- [Original observations](../../artifacts/gitlab-compatibility/access-20261117/original-5/report.json)
- [Fountain observations](../../artifacts/gitlab-compatibility/access-20261117/fountain-2/report.json)
- [Unchanged production boundary](../../artifacts/gitlab-compatibility/access-20261117/production-before-repair/manifest.json)
- [Validation receipt](../../artifacts/gitlab-compatibility/access-20261117/validation.json)

The [verified revoked-save repair](COMPATIBILITY_ACCESS_REPAIR_RESULTS.md) keeps
the draft, explains revoked authority and avoids a false conflict. Its fresh
matched and independent feedback gates pass; genuine-conflict controls also pass.
Historical red results above remain unchanged; broader acceptance remains open.
