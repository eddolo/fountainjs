# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 29415c5e03f5c126158df9ef2d4e14c0c6bdb934 · runtime 5f832988c0aaad7ed503137d467d753f8238b0712bb9c16f5abbca2ac53880ab · integration d64e886c3bdccef31f617c2d23fd0045251918a7babc68f1d46adc8f8b5e78d2

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| live-wiki-authors | The joining author receives the first author’s unsaved draft | missing-evidence |
| live-wiki-authors | The first editor identifies the second author after both move their cursors | missing-evidence |
| live-wiki-authors | The second editor identifies the first author after both move their cursors | missing-evidence |
| live-wiki-authors | Peer undo retains the first author’s edit | missing-evidence |
| live-wiki-authors | Peer redo restores the second edit on the first screen | missing-evidence |
| live-wiki-authors | The wiki API stores both edits, paragraphs and original formatting | missing-evidence |
| live-wiki-authors | The wiki API also retains the original line endings | missing-evidence |
| live-wiki-authors | Both edits survive in the other author’s reloaded reader | missing-evidence |
| live-wiki-authors | The reader retains the owner’s bold name | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
