# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — Unverified (missing expected or observed build)

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: false. Comparison complete: false.
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
| overlapping-issue-saves | Both ordinary Save requests finish without a server error | missing-evidence |
| overlapping-issue-saves | Only one competing replacement is acknowledged as saved | missing-evidence |
| overlapping-issue-saves | GitLab persists the exact draft of an acknowledged author | missing-evidence |
| overlapping-issue-saves | The other author can still see their unsaved draft | missing-evidence |
| overlapping-issue-saves | The other author sees a warning about the competing update | missing-evidence |
| overlapping-issue-saves | The stored issue remains exact after an independent reload | missing-evidence |
| overlapping-issue-saves | An independent reader sees the same saved description | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
