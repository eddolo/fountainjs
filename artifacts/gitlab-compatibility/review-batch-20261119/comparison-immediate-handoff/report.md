# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 73591945dd7543c420a8355582bca2708101c7172994caf7fa7dad5096cfe3ff

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| two-proposals | Both posted review notes contain the exact intended replacements at their distinct source lines | missing-evidence |
| two-proposals | Queueing the first suggestion selects only its own review | missing-evidence |
| two-proposals | Both eligible suggestions can be queued together | missing-evidence |
| two-proposals | Removing the first suggestion keeps the second in the batch | missing-evidence |
| two-proposals | Re-adding the first suggestion restores the two-item batch | missing-evidence |
| two-proposals | Queue operations preserve both saved suggestions, the file and the seed commit | missing-evidence |
| two-proposals | The confirmation submits exactly the two queued suggestion IDs and the chosen message | missing-evidence |
| two-proposals | GitLab accepts the batch request | missing-evidence |
| two-proposals | The reviewer sees both Applied badges before reload | missing-evidence |
| two-proposals | Both reloaded badges match the persisted application state | missing-evidence |
| two-proposals | The branch head and file contents remain stable after reload | missing-evidence |
| two-proposals | The entire file matches the expected contents after confirmation | missing-evidence |
| two-proposals | One batch commit directly follows the seed with the chosen message after confirmation | missing-evidence |
| two-proposals | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | missing-evidence |
| two-proposals | The entire file matches the expected contents after reload | missing-evidence |
| two-proposals | One batch commit directly follows the seed with the chosen message after reload | missing-evidence |
| two-proposals | Both original note and suggestion IDs retain their source and correct Applied flags after reload | missing-evidence |
| changed-target | Both posted review notes contain the exact intended replacements at their distinct source lines | missing-evidence |
| changed-target | Queueing the first suggestion selects only its own review | missing-evidence |
| changed-target | Both eligible suggestions can be queued together | missing-evidence |
| changed-target | Removing the first suggestion keeps the second in the batch | missing-evidence |
| changed-target | Re-adding the first suggestion restores the two-item batch | missing-evidence |
| changed-target | Queue operations preserve both saved suggestions, the file and the seed commit | missing-evidence |
| changed-target | The confirmation submits exactly the two queued suggestion IDs and the chosen message | missing-evidence |
| changed-target | GitLab refuses the stale batch with a client-visible response | missing-evidence |
| changed-target | The reviewer sees a reason why the queued batch cannot apply | missing-evidence |
| changed-target | Both reloaded badges match the persisted application state | missing-evidence |
| changed-target | The branch head and file contents remain stable after reload | missing-evidence |
| changed-target | The entire file matches the expected contents after confirmation | missing-evidence |
| changed-target | Only the competing commit exists after confirmation | missing-evidence |
| changed-target | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | missing-evidence |
| changed-target | The entire file matches the expected contents after reload | missing-evidence |
| changed-target | Only the competing commit exists after reload | missing-evidence |
| changed-target | Both original note and suggestion IDs retain their source and correct Applied flags after reload | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Batch submissions

| Editor | Workflow | HTTP | Branch before batch | Branch after batch | Single recovery commit |
| --- | --- | ---: | --- | --- | --- |
| original | two-proposals | Unverified | `1bc15bc70ad2` | Unverified | Outside this case |
| original | changed-target | Unverified | `ef092a5bde77` | Unverified | Outside this case |
| fountain | two-proposals | 200 | `1d5d78772856` | `b44e50be400a` | Outside this case |
| fountain | changed-target | 400 | `d800f2e4c1cb` | `d800f2e4c1cb` | Outside this case |
