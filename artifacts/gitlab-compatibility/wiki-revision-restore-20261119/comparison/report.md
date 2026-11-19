# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 269741c172fd023d51c23f43bb9c1092e00063f4 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 7fb479313c471236785bf38355a679302e9e736a7f798c76a5cba81210c90029

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
| runbook-history | Restoring v1 recovers the original source byte for byte | improvement |
| runbook-history | The restored reader shows the original paragraph | parity |
| runbook-history | The restored owner name retains its formatting | parity |
| runbook-history | Restore adds a third revision | parity |
| runbook-history | Restore keeps the two prior revision IDs and messages intact | parity |
| runbook-history | The newest revision records the supplied restore message | parity |
| runbook-history | Each of the three version IDs returns the exact bytes saved at that revision | parity |
| runbook-history | No wiki browser exceptions | parity |
| metadata-history | The seed wiki source matches the fixture byte for byte | parity |
| metadata-history | The author sees the edited paragraph before Save | parity |
| metadata-history | The reader shows the edit after reload | parity |
| metadata-history | The rich editor reopens with the saved paragraph | parity |
| metadata-history | Persisted Markdown preserves the exact edit and untouched source | shared-limitation |
| metadata-history | History shows the edit and the seed as two revisions | parity |
| metadata-history | Viewing v1 shows the original paragraph | parity |
| metadata-history | Dismissing Restore keeps the edited source byte for byte | parity |
| metadata-history | Restoring v1 recovers the original source byte for byte | improvement |
| metadata-history | The restored reader shows the original paragraph | parity |
| metadata-history | The restored owner name retains its formatting | parity |
| metadata-history | Restore adds a third revision | parity |
| metadata-history | Restore keeps the two prior revision IDs and messages intact | parity |
| metadata-history | The newest revision records the supplied restore message | parity |
| metadata-history | Each of the three version IDs returns the exact bytes saved at that revision | parity |
| metadata-history | No wiki browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

Both deployments used the same wiki controller patch `4c9d95d993c0d278cce12cc07f1ca919eb9ed912ec1746a4a230100e550bd8df`. The stock frontend submits the content field. The repaired frontend also submits the selected Git revision.

## Wiki Markdown line endings

| Case | Editor | Action | Form before encoding | Submitted request | Stored revision |
| --- | --- | --- | --- | --- | --- |
| runbook-history | original | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| runbook-history | original | restore | LF (final LF) | CRLF (final CRLF) | CRLF (final CRLF) |
| metadata-history | original | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| metadata-history | original | restore | CRLF + LF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| runbook-history | fountain | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| runbook-history | fountain | restore | LF (final LF) | CRLF (final CRLF) | LF (final LF) |
| metadata-history | fountain | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| metadata-history | fountain | restore | CRLF + LF (final CRLF) | CRLF (final CRLF) | CRLF + LF (final CRLF) |
