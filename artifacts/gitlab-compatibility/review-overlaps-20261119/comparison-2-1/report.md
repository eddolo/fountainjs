# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 0a0376b4cb2aa448d143de7b324dad74be7d62abeeb91ece0e6a01b3d0d095ba

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| same-line | Both posted review notes contain the exact intended replacements at their intended file locations | parity |
| same-line | Queueing the first suggestion selects only its own review | parity |
| same-line | Both eligible suggestions can be queued together | parity |
| same-line | Removing the first suggestion keeps the second in the batch | parity |
| same-line | Re-adding the first suggestion restores the two-item batch | parity |
| same-line | Queue operations preserve both saved suggestions, the file and the seed commit | parity |
| same-line | The confirmation submits exactly the two queued suggestion IDs and the chosen message | parity |
| same-line | GitLab rejects the batch because the suggested lines overlap | parity |
| same-line | The reviewer sees that the two suggestions overlap | parity |
| same-line | Both reloaded badges match the persisted application state | parity |
| same-line | The branch head and file contents remain stable after reload | parity |
| same-line | The entire file matches the expected contents after confirmation | parity |
| same-line | The seed commit and original file commit remain unchanged after confirmation | parity |
| same-line | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | parity |
| same-line | The entire file matches the expected contents after reload | parity |
| same-line | The seed commit and original file commit remain unchanged after reload | parity |
| same-line | Both original note and suggestion IDs retain their source and correct Applied flags after reload | parity |
| same-line | The reviewer chooses which proposal to keep from the original pair | parity |
| same-line | Both alternatives remain individually eligible until the reviewer confirms one | parity |
| same-line | The new confirmation applies only the surviving ID with the reviewer’s new commit message | parity |
| same-line | The final file contains only the selected replacement | parity |
| same-line | Only the selected proposal creates a direct child of the seed commit | parity |
| same-line | Both notes retain their original proposals and only the chosen one is marked Applied | parity |
| same-line | The freshly loaded readers show Applied only on the surviving review | parity |
| shared-endpoint | Both posted review notes contain the exact intended replacements at their intended file locations | parity |
| shared-endpoint | Queueing the first suggestion selects only its own review | parity |
| shared-endpoint | Both eligible suggestions can be queued together | parity |
| shared-endpoint | Removing the first suggestion keeps the second in the batch | parity |
| shared-endpoint | Re-adding the first suggestion restores the two-item batch | parity |
| shared-endpoint | Queue operations preserve both saved suggestions, the file and the seed commit | parity |
| shared-endpoint | The confirmation submits exactly the two queued suggestion IDs and the chosen message | parity |
| shared-endpoint | GitLab rejects the batch because the suggested lines overlap | parity |
| shared-endpoint | The reviewer sees that the two suggestions overlap | parity |
| shared-endpoint | Both reloaded badges match the persisted application state | parity |
| shared-endpoint | The branch head and file contents remain stable after reload | parity |
| shared-endpoint | The entire file matches the expected contents after confirmation | parity |
| shared-endpoint | The seed commit and original file commit remain unchanged after confirmation | parity |
| shared-endpoint | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | parity |
| shared-endpoint | The entire file matches the expected contents after reload | parity |
| shared-endpoint | The seed commit and original file commit remain unchanged after reload | parity |
| shared-endpoint | Both original note and suggestion IDs retain their source and correct Applied flags after reload | parity |
| shared-endpoint | The reviewer chooses which proposal to keep from the original pair | parity |
| shared-endpoint | Both alternatives remain individually eligible until the reviewer confirms one | parity |
| shared-endpoint | The new confirmation applies only the surviving ID with the reviewer’s new commit message | parity |
| shared-endpoint | The final file contains only the selected replacement | parity |
| shared-endpoint | Only the selected proposal creates a direct child of the seed commit | parity |
| shared-endpoint | Both notes retain their original proposals and only the chosen one is marked Applied | parity |
| shared-endpoint | The freshly loaded readers show Applied only on the surviving review | parity |
| adjacent-ranges | Both posted review notes contain the exact intended replacements at their intended file locations | parity |
| adjacent-ranges | Queueing the first suggestion selects only its own review | parity |
| adjacent-ranges | Both eligible suggestions can be queued together | parity |
| adjacent-ranges | Removing the first suggestion keeps the second in the batch | parity |
| adjacent-ranges | Re-adding the first suggestion restores the two-item batch | parity |
| adjacent-ranges | Queue operations preserve both saved suggestions, the file and the seed commit | parity |
| adjacent-ranges | The confirmation submits exactly the two queued suggestion IDs and the chosen message | parity |
| adjacent-ranges | GitLab accepts the batch request | parity |
| adjacent-ranges | The reviewer sees both Applied badges before reload | parity |
| adjacent-ranges | Both reloaded badges match the persisted application state | parity |
| adjacent-ranges | The branch head and file contents remain stable after reload | parity |
| adjacent-ranges | The entire file matches the expected contents after confirmation | parity |
| adjacent-ranges | One batch commit directly follows the seed with the chosen message after confirmation | parity |
| adjacent-ranges | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | parity |
| adjacent-ranges | The entire file matches the expected contents after reload | parity |
| adjacent-ranges | One batch commit directly follows the seed with the chosen message after reload | parity |
| adjacent-ranges | Both original note and suggestion IDs retain their source and correct Applied flags after reload | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Batch submissions

| Editor | Workflow | HTTP | Branch before batch | Branch after batch | Single recovery commit |
| --- | --- | ---: | --- | --- | --- |
| original | same-line | 400 | `da4e5144e2e9` | `da4e5144e2e9` | `460cc4ef7599` |
| original | shared-endpoint | 400 | `b95ddf1f90dd` | `b95ddf1f90dd` | `8f3dd03051ed` |
| original | adjacent-ranges | 200 | `612df06a1c73` | `2898a74a0cff` | Outside this case |
| fountain | same-line | 400 | `1f25edfbe509` | `1f25edfbe509` | `46dfeb5302fd` |
| fountain | shared-endpoint | 400 | `3c9f3d2de212` | `3c9f3d2de212` | `3e9781429642` |
| fountain | adjacent-ranges | 200 | `80ef4132d876` | `949cdf9c7ac1` | Outside this case |
