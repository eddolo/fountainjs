# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 269741c172fd023d51c23f43bb9c1092e00063f4 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 5c650f15291979a5e84d99825927112efaf9b7aa90eb6ac66ba868d250213422

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| runbook-history | The seed wiki source matches the fixture byte for byte | parity |
| runbook-history | The author sees the edited paragraph before Save | parity |
| runbook-history | The reader shows the edit after reload | parity |
| runbook-history | The rich editor reopens with the saved paragraph | parity |
| runbook-history | Persisted Markdown preserves the exact edit and untouched source | shared-limitation |
| runbook-history | History shows the edit and the seed as two revisions | parity |
| runbook-history | Viewing v1 shows the original paragraph | parity |
| runbook-history | Dismissing Restore keeps the edited source byte for byte | parity |
| runbook-history | Restoring v1 recovers the original source byte for byte | shared-limitation |
| runbook-history | The restored reader shows the original paragraph | parity |
| runbook-history | The restored owner name retains its formatting | parity |
| runbook-history | Restore adds a third revision | parity |
| runbook-history | Restore keeps the two prior revision IDs and messages intact | parity |
| runbook-history | The newest revision records the supplied restore message | parity |
| runbook-history | Each of the three version IDs returns the exact bytes saved at that revision | parity |
| runbook-history | No wiki browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Wiki Markdown line endings

| Editor | Action | Form before encoding | Submitted request | Stored revision |
| --- | --- | --- | --- | --- |
| original | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| original | restore | LF (final LF) | CRLF (final CRLF) | CRLF (final CRLF) |
| fountain | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| fountain | restore | LF (final LF) | CRLF (final CRLF) | CRLF (final CRLF) |
