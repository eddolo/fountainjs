# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1f16e1b0abf20468b0d439ea65b0ddd6058240e5 · runtime 345d2f2c4233274201a0247f0fe09858bf6b74e365b1e1c2feae9d8e0986a03b · integration 62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| late-write-discard | Open disclosure shows the newer saved version before resolution | parity |
| late-write-discard | Author retains their own draft through the later write | parity |
| late-write-discard | Newest server edit survives until the author chooses | parity |
| late-write-discard | Offline Save leaves the server baseline intact | parity |
| late-write-discard | Second author’s saved version survives until explicit resolution | parity |
| late-write-discard | Returning author sees a conflict | parity |
| late-write-discard | Returning author can still see their own draft | parity |
| late-write-discard | Conflict disclosure contains the other author’s exact Markdown | parity |
| late-write-discard | Author explicitly resolves the conflict | parity |
| late-write-discard | Resolution persists the chosen Markdown | parity |
| late-write-discard | Reload shows the chosen version | parity |
| late-write-discard | Browser exceptions | parity |
| late-write-overwrite | Open disclosure shows the newer saved version before resolution | parity |
| late-write-overwrite | Author retains their own draft through the later write | parity |
| late-write-overwrite | Newest server edit survives until the author chooses | parity |
| late-write-overwrite | Offline Save leaves the server baseline intact | parity |
| late-write-overwrite | Second author’s saved version survives until explicit resolution | parity |
| late-write-overwrite | Returning author sees a conflict | parity |
| late-write-overwrite | Returning author can still see their own draft | parity |
| late-write-overwrite | Conflict disclosure contains the other author’s exact Markdown | parity |
| late-write-overwrite | Author explicitly resolves the conflict | parity |
| late-write-overwrite | Resolution persists the chosen Markdown | parity |
| late-write-overwrite | Reload shows the chosen version | parity |
| late-write-overwrite | Browser exceptions | parity |
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
| original | 200 / 500 | 401.5 ms | Developer | Yes | Yes |
| fountain | 500 / 200 | 694.1 ms | Issue author | Yes | Yes |

The request intervals come from the two browser network responses. A single overlap measures this interleaving only.
