# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 73591945dd7543c420a8355582bca2708101c7172994caf7fa7dad5096cfe3ff

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| two-files | Both posted review notes contain the exact intended replacements at their intended file locations | parity |
| two-files | Queueing the first suggestion selects only its own review | parity |
| two-files | Both eligible suggestions can be queued together | parity |
| two-files | Removing the first suggestion keeps the second in the batch | parity |
| two-files | Re-adding the first suggestion restores the two-item batch | parity |
| two-files | Queue operations preserve both saved suggestions, the file and the seed commit | parity |
| two-files | The confirmation submits exactly the two queued suggestion IDs and the chosen message | parity |
| two-files | GitLab accepts the batch request | parity |
| two-files | The reviewer sees both Applied badges before reload | parity |
| two-files | Both reloaded badges match the persisted application state | parity |
| two-files | The branch head and file contents remain stable after reload | parity |
| two-files | The entire file matches the expected contents after confirmation | parity |
| two-files | One batch commit directly follows the seed with the chosen message after confirmation | parity |
| two-files | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | parity |
| two-files | The entire file matches the expected contents after reload | parity |
| two-files | One batch commit directly follows the seed with the chosen message after reload | parity |
| two-files | Both original note and suggestion IDs retain their source and correct Applied flags after reload | parity |
| two-files | Dismissing the confirmation keeps the queue and saved state intact and sends no apply request | parity |
| two-files | Both saved notes identify the intended full path and line before and after confirmation and reload | parity |
| two-files | All three matching files share the seed commit and queueing preserves their contents | parity |
| two-files | File contents, last commits and commit diff paths identify every changed and untouched file | parity |
| changed-file | Both posted review notes contain the exact intended replacements at their intended file locations | parity |
| changed-file | Queueing the first suggestion selects only its own review | parity |
| changed-file | Both eligible suggestions can be queued together | parity |
| changed-file | Removing the first suggestion keeps the second in the batch | parity |
| changed-file | Re-adding the first suggestion restores the two-item batch | parity |
| changed-file | Queue operations preserve both saved suggestions, the file and the seed commit | parity |
| changed-file | The confirmation submits exactly the two queued suggestion IDs and the chosen message | regression |
| changed-file | GitLab refuses the stale batch with a client-visible response | regression |
| changed-file | The reviewer sees a reason why the queued batch cannot apply | regression |
| changed-file | Both reloaded badges match the persisted application state | parity |
| changed-file | The branch head and file contents remain stable after reload | parity |
| changed-file | The entire file matches the expected contents after confirmation | parity |
| changed-file | Only the competing commit exists after confirmation | parity |
| changed-file | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | parity |
| changed-file | The entire file matches the expected contents after reload | parity |
| changed-file | Only the competing commit exists after reload | parity |
| changed-file | Both original note and suggestion IDs retain their source and correct Applied flags after reload | parity |
| changed-file | The refused batch stays intact until the reviewer removes the changed target | parity |
| changed-file | Removing the outdated proposal leaves the saved branch, both notes and their eligibility unchanged | parity |
| changed-file | The new confirmation applies only the surviving ID with the reviewer’s new commit message | parity |
| changed-file | The final file includes the surviving suggestion and the competing edit | parity |
| changed-file | Exactly one new commit directly follows the competing commit | parity |
| changed-file | Only the surviving suggestion receives Applied and both original suggestion IDs survive reload | parity |
| changed-file | The freshly loaded readers show Applied only on the surviving review | improvement |
| changed-file | Dismissing the confirmation keeps the queue and saved state intact and sends no apply request | parity |
| changed-file | Both saved notes identify the intended full path and line before and after confirmation and reload | parity |
| changed-file | All three matching files share the seed commit and queueing preserves their contents | parity |
| changed-file | File contents, last commits and commit diff paths identify every changed and untouched file | parity |
| changed-file | Recovery changes only the surviving path and preserves the competing file and untouched copy | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Batch submissions

| Editor | Workflow | HTTP | Branch before batch | Branch after batch | Single recovery commit |
| --- | --- | ---: | --- | --- | --- |
| original | two-files | 200 | `95b7c8c08cf5` | `1892a387becc` | Outside this case |
| original | changed-file | 400 | `b199472c680b` | `b199472c680b` | `fc163a3f311b` |
| fountain | two-files | 200 | `9af769095afa` | `2e6668a0f44e` | Outside this case |
| fountain | changed-file | Unverified | `83368fa3e784` | `83368fa3e784` | `b709773d9141` |
