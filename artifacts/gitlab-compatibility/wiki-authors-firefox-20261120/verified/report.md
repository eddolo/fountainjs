# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 56b722e74ec0b841154f8758f7141ce0f9718762 · runtime e43cd8202ccff7e28e276fe019ca4f12f7b88c1aaf18a1cdf931a69acbe11038 · integration df0672cb51ce331af01c9b6db3f459658cee7e2a1032b9293eaffa5147eae009

Browser on stock / replacement: firefox 153.0 (linux) / firefox 153.0 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| two-wiki-authors | The final wiki history credits the Developer with the competing edit and the original author with the restore | parity |
| two-wiki-authors | The first tab opens Restore with the v2 revision | parity |
| two-wiki-authors | The first edit is stored as v2 | parity |
| two-wiki-authors | The second tab sees its own saved change | parity |
| two-wiki-authors | The second tab saves the expected source | parity |
| two-wiki-authors | The author sees the concurrent edit notice after confirming the stale restore | parity |
| two-wiki-authors | The warning renders its full message without translation placeholders | parity |
| two-wiki-authors | The warning opens the current wiki page | parity |
| two-wiki-authors | Following the warning shows the competing writer’s saved paragraph | parity |
| two-wiki-authors | The stale restore leaves the newer source intact | parity |
| two-wiki-authors | The current page shows the newer edit before retry | parity |
| two-wiki-authors | The rejected restore adds no revision and earlier entries retain their IDs and messages | parity |
| two-wiki-authors | A fresh Restore uses the competing writer’s current revision | parity |
| two-wiki-authors | Explicit retry restores the v1 source byte for byte | parity |
| two-wiki-authors | The restored page shows the original paragraph | parity |
| two-wiki-authors | Explicit retry adds one v4 and retains the preceding three entries | parity |
| two-wiki-authors | Each history row points to its own retrieved revision | parity |
| two-wiki-authors | All four historical revision sources remain retrievable | parity |
| two-wiki-authors | Neither author tab reports browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
