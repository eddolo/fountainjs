# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1f16e1b0abf20468b0d439ea65b0ddd6058240e5 · runtime 345d2f2c4233274201a0247f0fe09858bf6b74e365b1e1c2feae9d8e0986a03b · integration 62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| retry-in-place | Failed Save leaves the persisted description intact | parity |
| retry-in-place | Editor explains the failed Save | improvement |
| retry-in-place | Editor keeps the drafted paragraph after failure | parity |
| retry-in-place | Reconnection leaves the saved description unchanged before retry | parity |
| retry-in-place | Retry uses the original draft without retyping | parity |
| retry-in-place | GitLab stores the retried edit | parity |
| retry-in-place | Reload retains the edit on the server | parity |
| retry-in-place | Reopened issue shows the recovered text | parity |
| retry-in-place | Browser exceptions | parity |
| reload-then-retry | Failed Save leaves the persisted description intact | parity |
| reload-then-retry | Editor explains the failed Save | improvement |
| reload-then-retry | Editor keeps the drafted paragraph after failure | parity |
| reload-then-retry | Reconnection leaves the saved description unchanged before retry | parity |
| reload-then-retry | Retry uses the original draft without retyping | parity |
| reload-then-retry | GitLab stores the retried edit | parity |
| reload-then-retry | Reload retains the edit on the server | parity |
| reload-then-retry | Reopened issue shows the recovered text | parity |
| reload-then-retry | Browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
