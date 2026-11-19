# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 711ee7f2955eecb24af6e6c0384686bf42305a3c · runtime 52e5e274514b0d268c1c2a43c8219b412d757c0dbf0de7005ef4d363c01692b2 · integration 5f383fa6ea22fcbcf7484be3358d328967fefa3080d2e02c038101208c77b6d3

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| reconnect-discard | Offline Save leaves the server baseline intact | missing-evidence |
| reconnect-discard | Second author’s saved version survives until explicit resolution | missing-evidence |
| reconnect-discard | Returning author sees a conflict | missing-evidence |
| reconnect-discard | Returning author can still see their own draft | missing-evidence |
| reconnect-discard | Conflict disclosure contains the other author’s exact Markdown | missing-evidence |
| reconnect-discard | Author explicitly resolves the conflict | missing-evidence |
| reconnect-discard | Resolution persists the chosen Markdown | missing-evidence |
| reconnect-discard | Reload shows the chosen version | missing-evidence |
| reconnect-discard | Browser exceptions | missing-evidence |
| reconnect-overwrite | Offline Save leaves the server baseline intact | missing-evidence |
| reconnect-overwrite | Second author’s saved version survives until explicit resolution | missing-evidence |
| reconnect-overwrite | Returning author sees a conflict | missing-evidence |
| reconnect-overwrite | Returning author can still see their own draft | missing-evidence |
| reconnect-overwrite | Conflict disclosure contains the other author’s exact Markdown | missing-evidence |
| reconnect-overwrite | Author explicitly resolves the conflict | missing-evidence |
| reconnect-overwrite | Resolution persists the chosen Markdown | missing-evidence |
| reconnect-overwrite | Reload shows the chosen version | missing-evidence |
| reconnect-overwrite | Browser exceptions | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
