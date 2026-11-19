# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 0a0376b4cb2aa448d143de7b324dad74be7d62abeeb91ece0e6a01b3d0d095ba

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| live-target-update | Both posted review notes contain the exact intended replacements at their intended file locations | parity |
| live-target-update | Queueing the first suggestion selects only its own review | parity |
| live-target-update | Both eligible suggestions can be queued together | parity |
| live-target-update | Removing the first suggestion keeps the second in the batch | parity |
| live-target-update | Re-adding the first suggestion restores the two-item batch | parity |
| live-target-update | Queue operations preserve both saved suggestions, the file and the seed commit | parity |
| live-target-update | The live refresh sends no apply request and keeps both proposals queued | parity |
| live-target-update | The changed suggestion disables Apply and closes its pending confirmation | parity |
| live-target-update | The changed note visibly explains the outdated line and how to continue the review | improvement |
| live-target-update | Both reloaded badges match the persisted application state | parity |
| live-target-update | The branch head and file contents remain stable after reload | parity |
| live-target-update | The entire file matches the expected contents after confirmation | parity |
| live-target-update | Only the competing commit exists after confirmation | parity |
| live-target-update | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | parity |
| live-target-update | The entire file matches the expected contents after reload | parity |
| live-target-update | Only the competing commit exists after reload | parity |
| live-target-update | Both original note and suggestion IDs retain their source and correct Applied flags after reload | parity |
| live-target-update | The removal instruction stays off the valid note and disappears when the stale suggestion leaves the queue | improvement |
| live-target-update | The refused batch stays intact until the reviewer removes the changed target | parity |
| live-target-update | Removing the outdated proposal leaves the saved branch, both notes and their eligibility unchanged | parity |
| live-target-update | The new confirmation applies only the surviving ID with the reviewer’s new commit message | parity |
| live-target-update | The final file includes the surviving suggestion and the competing edit | parity |
| live-target-update | Exactly one new commit directly follows the competing commit | parity |
| live-target-update | Only the surviving suggestion receives Applied and both original suggestion IDs survive reload | parity |
| live-target-update | The freshly loaded readers show Applied only on the surviving review | parity |
| live-target-update | Dismissing the confirmation keeps the queue and saved state intact and sends no apply request | parity |
| live-target-update | Both saved notes identify the intended full path and line before and after confirmation and reload | parity |
| live-target-update | All three matching files share the seed commit and queueing preserves their contents | parity |
| live-target-update | File contents, last commits and commit diff paths identify every changed and untouched file | parity |
| live-target-update | Recovery changes only the surviving path and preserves the competing file and untouched copy | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Batch submissions

| Editor | Workflow | HTTP | Branch before batch | Branch after batch | Single recovery commit |
| --- | --- | ---: | --- | --- | --- |
| original | live-target-update | No apply request | `0e9fb9fd28bc` | `0e9fb9fd28bc` | `3cf2c8322fa9` |
| fountain | live-target-update | No apply request | `56cdca6939dd` | `56cdca6939dd` | `4def4349697d` |
