# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 442191162f18d104a446bb8f5e4684da0895ee92 · runtime 167d91c06ce5931c9ad48dd4f7c4eb17db062cf82293f496dad850e7d047bf8e · integration dec7e985304723772ba4abc53621b00b78176f38fdc9b310bcc23f330f728c12

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

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
