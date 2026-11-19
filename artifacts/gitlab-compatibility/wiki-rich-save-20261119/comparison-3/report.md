# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 0f3db5f6bfe550275fd0ff440c78d47d5cbab7eb · runtime 167d91c06ce5931c9ad48dd4f7c4eb17db062cf82293f496dad850e7d047bf8e · integration 3102f5bd338dc814d48579f5dfec64910acc2b5306cf225f92bfdbe74e00bd64

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| runbook-history | The seed wiki source matches the fixture byte for byte | parity |
| runbook-history | The author sees the edited paragraph before Save | parity |
| runbook-history | The reader shows the edit after reload | parity |
| runbook-history | The rich editor reopens with the saved paragraph | parity |
| runbook-history | Persisted Markdown preserves the exact edit and untouched source | improvement |
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
| metadata-history | Persisted Markdown preserves the exact edit and untouched source | improvement |
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
| handover-paragraph | The seed wiki source matches the fixture byte for byte | parity |
| handover-paragraph | The author sees the edited paragraph before Save | parity |
| handover-paragraph | The reader shows the edit after reload | parity |
| handover-paragraph | The rich editor reopens with the saved paragraph | parity |
| handover-paragraph | Persisted Markdown preserves the exact edit and untouched source | improvement |
| handover-paragraph | History shows the edit and the seed as two revisions | parity |
| handover-paragraph | Viewing v1 shows the original paragraph | parity |
| handover-paragraph | Dismissing Restore keeps the edited source byte for byte | parity |
| handover-paragraph | Restoring v1 recovers the original source byte for byte | parity |
| handover-paragraph | The restored reader shows the original paragraph | parity |
| handover-paragraph | The restored owner name retains its formatting | parity |
| handover-paragraph | Restore adds a third revision | parity |
| handover-paragraph | Restore keeps the two prior revision IDs and messages intact | parity |
| handover-paragraph | The newest revision records the supplied restore message | parity |
| handover-paragraph | Each of the three version IDs returns the exact bytes saved at that revision | parity |
| handover-paragraph | No wiki browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

Both deployments used the same wiki controller patch `1deb91990b3c943847098dadecb23619b211bc38dd2c44048c9f341b434a51c8`. The stock frontend submits the content field. The repaired frontend also submits the selected Git revision.

## Stored wiki revisions

| Case | Editor | Revision | Git commit | Matches expected source |
| --- | --- | --- | --- | --- |
| runbook-history | original | v2 | `303d48eb40d1a01c2615b6691293dcbbe94e5a8a` | Different |
| runbook-history | original | v3 | `8a16fe763a230769f66f045e3fb08fa5a39ee293` | Different |
| metadata-history | original | v2 | `9476b4dbeef0411a400d448e54bcd6a67b7c9901` | Different |
| metadata-history | original | v3 | `3598efd7684cbd58f79a938de8060b2009474176` | Different |
| handover-paragraph | original | v2 | `9d5c101e8c8cccd037f41829f3c2eec060ddf92c` | Different |
| handover-paragraph | original | v3 | `e6c1eaad20742e24934924c68754bca6fcbc3da2` | Exact |
| runbook-history | fountain | v2 | `1806fabf5f120a7b403cb27ab5422e47acf14668` | Exact |
| runbook-history | fountain | v3 | `326a295e1cbdf422d9deeb15008e1c4e09e5a5df` | Exact |
| metadata-history | fountain | v2 | `4ce146d777bb481107a9b927ea5cb155806c2437` | Exact |
| metadata-history | fountain | v3 | `d1f310376be765329973721141af8ac67e82e4ef` | Exact |
| handover-paragraph | fountain | v2 | `92b6ab2563c87e9097e001bcf770b02ffe5dd313` | Exact |
| handover-paragraph | fountain | v3 | `c8212a6c1880b3e01f9ed305728ac680253c85eb` | Exact |

## Wiki Markdown line endings

| Case | Editor | Action | Form before encoding | Submitted request | Stored revision |
| --- | --- | --- | --- | --- | --- |
| runbook-history | original | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| runbook-history | original | restore | LF (final LF) | CRLF (final CRLF) | CRLF (final CRLF) |
| metadata-history | original | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| metadata-history | original | restore | CRLF + LF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| handover-paragraph | original | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| handover-paragraph | original | restore | CRLF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| runbook-history | fountain | edit | LF (final LF) | CRLF (final CRLF) | LF (final LF) |
| runbook-history | fountain | restore | LF (final LF) | CRLF (final CRLF) | LF (final LF) |
| metadata-history | fountain | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | CRLF + LF (final CRLF) |
| metadata-history | fountain | restore | CRLF + LF (final CRLF) | CRLF (final CRLF) | CRLF + LF (final CRLF) |
| handover-paragraph | fountain | edit | CRLF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| handover-paragraph | fountain | restore | CRLF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
