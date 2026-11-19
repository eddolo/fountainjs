# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 433488dcd620f2fff3e0d10df13f765a7e262beb · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 70f013d3f947ff2edaf263c9f691caae58ea85772415ea610dd1b420827387b6

Browser on stock / replacement: webkit 26.5 (linux) / webkit 26.5 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

original recorded 3 browser error(s). See the errors in its [run report](../original-6/report.json).

fountain recorded 5 browser error(s). See the errors in its [run report](../fountain-6/report.json).

| Case | Invariant | Classification |
| --- | --- | --- |
| developer-reporter-developer | Both posted review notes contain the exact intended replacements at their intended file locations | parity |
| developer-reporter-developer | Queueing the first suggestion selects only its own review | parity |
| developer-reporter-developer | Both eligible suggestions can be queued together | parity |
| developer-reporter-developer | Removing the first suggestion keeps the second in the batch | parity |
| developer-reporter-developer | Re-adding the first suggestion restores the two-item batch | parity |
| developer-reporter-developer | Queue operations preserve both saved suggestions, the file and the seed commit | parity |
| developer-reporter-developer | The confirmation submits exactly the two queued suggestion IDs and the chosen message | parity |
| developer-reporter-developer | GitLab accepts the batch request | parity |
| developer-reporter-developer | The reviewer sees both Applied badges before reload | parity |
| developer-reporter-developer | Both reloaded badges match the persisted application state | parity |
| developer-reporter-developer | The branch head and file contents remain stable after reload | parity |
| developer-reporter-developer | The entire file matches the expected contents after confirmation | parity |
| developer-reporter-developer | One batch commit directly follows the seed with the chosen message after confirmation | parity |
| developer-reporter-developer | Both original note and suggestion IDs retain their source and correct Applied flags after confirmation | parity |
| developer-reporter-developer | The entire file matches the expected contents after reload | parity |
| developer-reporter-developer | One batch commit directly follows the seed with the chosen message after reload | parity |
| developer-reporter-developer | Both original note and suggestion IDs retain their source and correct Applied flags after reload | parity |
| developer-reporter-developer | The dedicated reviewer moves from Developer to Reporter and back in the same session, then returns to Guest at cleanup | parity |
| developer-reporter-developer | The reviewer has both proposals queued and can confirm before the role change | parity |
| developer-reporter-developer | The open confirmation no longer offers to commit at the three-second role-change observation | improvement |
| developer-reporter-developer | The affected suggestion explains that source-branch write access is unavailable | improvement |
| developer-reporter-developer | The original tab retains both queued proposals and the typed commit message after access returns | parity |
| developer-reporter-developer | After reload the Reporter can read both suggestions and has no enabled apply or queue controls | parity |
| developer-reporter-developer | The role transition sends no suggestion write and preserves the seed, file and both original notes | parity |
| developer-reporter-developer | After Developer access returns both suggestions can be queued again or are still queued | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Batch submissions

| Editor | Workflow | HTTP | Branch before batch | Branch after batch | Single recovery commit |
| --- | --- | ---: | --- | --- | --- |
| original | developer-reporter-developer | 200 | `18566ee90d48` | `89d359165bd4` | Outside this case |
| fountain | developer-reporter-developer | 200 | `bfa5e5a2a0de` | `84ca94b38e82` | Outside this case |

## Queued reviewer handoff

| Editor | Open confirmation after role change | Enabled Apply or Add after reload | Apply request before restoration | Status after explicit confirmation |
| --- | --- | --- | --- | --- |
| original | Enabled at 3034 ms | No | 0 | 200 |
| fountain | Unavailable at 3079 ms | No | 0 | 200 |

The same local reviewer held Developer, then Reporter, then Developer access. The open-tab observation is a timed sample. The fresh Reporter controls were scored on a newly loaded merge request.
