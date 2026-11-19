# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 80ae30149c8fed68f6f89802cd8f2e22e53ddbd0 · runtime 755d58d35b0ac7e3a6c56286a8089261b3334662e96357925ca1dba0cd2c78f5 · integration 0b53fdc6fd29fdf59cf5052af158e91e563f4ffbc5916ca9f80ed856b60cee5e

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| two-reviewers-apply | One confirmation succeeds and the competing request is refused | shared-limitation |
| two-reviewers-apply | Both reviewers see that the suggestion was applied | shared-limitation |
| two-reviewers-apply | Branch head survives both reviewers reloading | parity |
| two-reviewers-apply | Both reviewers reopen the Applied note without another Apply action | shared-limitation |
| two-reviewers-apply | Complete file contains the change exactly once (after both confirmations) | shared-limitation |
| two-reviewers-apply | One direct commit on the seed branch (after both confirmations) | shared-limitation |
| two-reviewers-apply | Commit carries the successful reviewer’s message (after both confirmations) | shared-limitation |
| two-reviewers-apply | Same note and suggestion retain Applied status (after both confirmations) | shared-limitation |
| two-reviewers-apply | Complete file contains the change exactly once (after both reloads) | shared-limitation |
| two-reviewers-apply | One direct commit on the seed branch (after both reloads) | shared-limitation |
| two-reviewers-apply | Commit carries the successful reviewer’s message (after both reloads) | shared-limitation |
| two-reviewers-apply | Same note and suggestion retain Applied status (after both reloads) | shared-limitation |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Two confirmations on the same suggestion

| Editor | Reviewer | Apply response | Visible feedback |
| --- | --- | --- | --- |
| original | root | HTTP 400 | 4:Deadline Exceeded. |
| original | fountain_compat_access | HTTP 400 | 4:Deadline Exceeded. |
| fountain | root | HTTP 400 | 4:Deadline Exceeded. |
| fountain | fountain_compat_access | HTTP 400 | 4:Deadline Exceeded. |

The browser request intervals must overlap. The saved branch, complete file and suggestion are checked independently after submission and reload.
