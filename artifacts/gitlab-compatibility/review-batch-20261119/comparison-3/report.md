# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 73591945dd7543c420a8355582bca2708101c7172994caf7fa7dad5096cfe3ff

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| two-proposals | Both posted review notes contain the exact intended replacements at their distinct source lines | parity |
| two-proposals | Queueing the first suggestion selects only its own review | parity |
| two-proposals | Both eligible suggestions can be queued together | parity |
| two-proposals | Removing the first suggestion keeps the second in the batch | parity |
| two-proposals | Re-adding the first suggestion restores the two-item batch | parity |
| two-proposals | Queue operations preserve both saved suggestions, the file and the seed commit | parity |
| two-proposals | The confirmation submits exactly the two queued suggestion IDs and the chosen message | parity |
| two-proposals | GitLab accepts the batch request | parity |
| two-proposals | The reviewer sees both Applied badges before reload | parity |
| two-proposals | Both reloaded badges match the persisted application state | parity |
| two-proposals | The branch head and file contents remain stable after reload | parity |
| two-proposals | The entire file matches the expected contents after confirmation | parity |
| two-proposals | One batch commit directly follows the seed with the chosen message after confirmation | parity |
| two-proposals | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | parity |
| two-proposals | The entire file matches the expected contents after reload | parity |
| two-proposals | One batch commit directly follows the seed with the chosen message after reload | parity |
| two-proposals | Both original note and suggestion IDs retain their source and correct Applied flags after reload | parity |
| changed-target | Both posted review notes contain the exact intended replacements at their distinct source lines | parity |
| changed-target | Queueing the first suggestion selects only its own review | parity |
| changed-target | Both eligible suggestions can be queued together | parity |
| changed-target | Removing the first suggestion keeps the second in the batch | parity |
| changed-target | Re-adding the first suggestion restores the two-item batch | parity |
| changed-target | Queue operations preserve both saved suggestions, the file and the seed commit | parity |
| changed-target | The confirmation submits exactly the two queued suggestion IDs and the chosen message | parity |
| changed-target | GitLab refuses the stale batch with a client-visible response | parity |
| changed-target | The reviewer sees a reason why the queued batch cannot apply | parity |
| changed-target | Both reloaded badges match the persisted application state | parity |
| changed-target | The branch head and file contents remain stable after reload | parity |
| changed-target | The entire file matches the expected contents after confirmation | parity |
| changed-target | Only the competing commit exists after confirmation | parity |
| changed-target | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | parity |
| changed-target | The entire file matches the expected contents after reload | parity |
| changed-target | Only the competing commit exists after reload | parity |
| changed-target | Both original note and suggestion IDs retain their source and correct Applied flags after reload | parity |
| changed-target | The refused batch stays intact until the reviewer removes the changed target | parity |
| changed-target | Removing the outdated proposal leaves the saved branch, both notes and their eligibility unchanged | parity |
| changed-target | The new confirmation applies only the surviving ID with the reviewer’s new commit message | parity |
| changed-target | The final file includes the surviving suggestion and the competing edit | parity |
| changed-target | Exactly one new commit directly follows the competing commit | parity |
| changed-target | Only the surviving suggestion receives Applied and both original suggestion IDs survive reload | parity |
| changed-target | The freshly loaded readers show Applied only on the surviving review | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Batch submissions

| Editor | Workflow | HTTP | Branch before batch | Branch after batch | Single recovery commit |
| --- | --- | ---: | --- | --- | --- |
| original | two-proposals | 200 | `15a63cec0a4c` | `ac7152edb072` | Outside this case |
| original | changed-target | 400 | `0c4b3aacde98` | `0c4b3aacde98` | `cda704b1125f` |
| fountain | two-proposals | 200 | `722ce14b8dcb` | `dae280bb7899` | Outside this case |
| fountain | changed-target | 400 | `b8da1317fe9b` | `b8da1317fe9b` | `856e7888b55c` |
