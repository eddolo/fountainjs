# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 56b722e74ec0b841154f8758f7141ce0f9718762 · runtime e43cd8202ccff7e28e276fe019ca4f12f7b88c1aaf18a1cdf931a69acbe11038 · integration df0672cb51ce331af01c9b6db3f459658cee7e2a1032b9293eaffa5147eae009

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| writer-table | The destination begins without a table | parity |
| writer-table | The native Writer paste retains table geometry, cell roles, text, emphasis and link | improvement |
| writer-table | Undo removes the pasted table | parity |
| writer-table | Redo restores the formatted table | improvement |
| writer-table | Stored issue content retains the Writer text without its HTML indentation | parity |
| writer-table | The saved GitLab reader renders the formatted table | parity |
| writer-table | The reopened rich editor retains the formatted table | improvement |
| writer-table | The saved table follows the existing heading and paragraph | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
