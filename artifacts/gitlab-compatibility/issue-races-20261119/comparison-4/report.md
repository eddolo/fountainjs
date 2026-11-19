# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 80ae30149c8fed68f6f89802cd8f2e22e53ddbd0 · runtime 755d58d35b0ac7e3a6c56286a8089261b3334662e96357925ca1dba0cd2c78f5 · integration 908158c5319f5eb8388633ee75d534f405f638f47e3785be00b2d6e6302583c3

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| late-write-discard | Open disclosure shows the newer saved version before resolution | missing-evidence |
| late-write-discard | Author retains their own draft through the later write | missing-evidence |
| late-write-discard | Newest server edit survives until the author chooses | missing-evidence |
| late-write-discard | Offline Save leaves the server baseline intact | missing-evidence |
| late-write-discard | Second author’s saved version survives until explicit resolution | missing-evidence |
| late-write-discard | Returning author sees a conflict | missing-evidence |
| late-write-discard | Returning author can still see their own draft | missing-evidence |
| late-write-discard | Conflict disclosure contains the other author’s exact Markdown | missing-evidence |
| late-write-discard | Author explicitly resolves the conflict | missing-evidence |
| late-write-discard | Resolution persists the chosen Markdown | missing-evidence |
| late-write-discard | Reload shows the chosen version | missing-evidence |
| late-write-discard | Browser exceptions | missing-evidence |
| late-write-overwrite | Open disclosure shows the newer saved version before resolution | missing-evidence |
| late-write-overwrite | Author retains their own draft through the later write | missing-evidence |
| late-write-overwrite | Newest server edit survives until the author chooses | missing-evidence |
| late-write-overwrite | Offline Save leaves the server baseline intact | missing-evidence |
| late-write-overwrite | Second author’s saved version survives until explicit resolution | missing-evidence |
| late-write-overwrite | Returning author sees a conflict | missing-evidence |
| late-write-overwrite | Returning author can still see their own draft | missing-evidence |
| late-write-overwrite | Conflict disclosure contains the other author’s exact Markdown | missing-evidence |
| late-write-overwrite | Author explicitly resolves the conflict | missing-evidence |
| late-write-overwrite | Resolution persists the chosen Markdown | missing-evidence |
| late-write-overwrite | Reload shows the chosen version | missing-evidence |
| late-write-overwrite | Browser exceptions | missing-evidence |
| overlapping-issue-saves | Both ordinary Save requests finish without a server error | shared-limitation |
| overlapping-issue-saves | Only one competing replacement is acknowledged as saved | parity |
| overlapping-issue-saves | GitLab persists the exact draft of an acknowledged author | parity |
| overlapping-issue-saves | The other author can still see their unsaved draft | parity |
| overlapping-issue-saves | The other author sees a warning about the competing update | parity |
| overlapping-issue-saves | The stored issue remains exact after an independent reload | parity |
| overlapping-issue-saves | An independent reader sees the same saved description | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Overlapping issue saves

| Editor | Responses (Developer / author) | Overlap | Persisted draft | Other draft visible | Conflict warning |
| --- | --- | ---: | --- | --- | --- |
| original | 200 / 500 | 692.7 ms | Developer | Yes | Yes |
| fountain | 500 / 200 | 469.2 ms | Issue author | Yes | Yes |

The request intervals come from the two browser network responses. A single overlap measures this interleaving only.
