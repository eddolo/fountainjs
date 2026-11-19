# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 711ee7f2955eecb24af6e6c0384686bf42305a3c · runtime 52e5e274514b0d268c1c2a43c8219b412d757c0dbf0de7005ef4d363c01692b2 · integration 5f383fa6ea22fcbcf7484be3358d328967fefa3080d2e02c038101208c77b6d3

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| reconnect-discard | Offline Save leaves the server baseline intact | parity |
| reconnect-discard | Second author’s saved version survives until explicit resolution | parity |
| reconnect-discard | Returning author sees a conflict | parity |
| reconnect-discard | Returning author can still see their own draft | parity |
| reconnect-discard | Conflict disclosure contains the other author’s exact Markdown | parity |
| reconnect-discard | Author explicitly resolves the conflict | parity |
| reconnect-discard | Resolution persists the chosen Markdown | parity |
| reconnect-discard | Reload shows the chosen version | parity |
| reconnect-discard | Browser exceptions | parity |
| reconnect-overwrite | Offline Save leaves the server baseline intact | parity |
| reconnect-overwrite | Second author’s saved version survives until explicit resolution | parity |
| reconnect-overwrite | Returning author sees a conflict | parity |
| reconnect-overwrite | Returning author can still see their own draft | parity |
| reconnect-overwrite | Conflict disclosure contains the other author’s exact Markdown | parity |
| reconnect-overwrite | Author explicitly resolves the conflict | parity |
| reconnect-overwrite | Resolution persists the chosen Markdown | parity |
| reconnect-overwrite | Reload shows the chosen version | parity |
| reconnect-overwrite | Browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
