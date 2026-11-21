# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 5ed861f6e65efb99a17b188ed9a73f6105d9b155 · runtime a25b0d376c5629f54a38254b39e46162e7a2ce7df2e9fbdb8e03505f3b5549a4 · integration 81b5416504115160ef1c7fa2c3a4ff22c80877fb43000cd7447fd12f38581320

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| live-wiki-authors | The joining author receives the first author’s unsaved draft | missing-evidence |
| live-wiki-authors | The first editor identifies the second author after both move their cursors | missing-evidence |
| live-wiki-authors | The second editor identifies the first author after both move their cursors | missing-evidence |
| live-wiki-authors | Both rich editors render the other author’s named caret | missing-evidence |
| live-wiki-authors | Peer undo retains the first author’s edit | missing-evidence |
| live-wiki-authors | Peer redo restores the second edit on the first screen | missing-evidence |
| live-wiki-authors | The wiki API stores both edits, paragraphs and original formatting | missing-evidence |
| live-wiki-authors | The wiki API also retains the original line endings | missing-evidence |
| live-wiki-authors | Both edits survive in the other author’s reloaded reader | missing-evidence |
| live-wiki-authors | The reader retains the owner’s bold name | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
