# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 3a6150c2cb5a2d473e40b11ea092e731249844be · runtime 4994949a5596d536253a5e22fc690e8b2e87cc3b85564770006a314c42d191fb · integration a2acf73ee985ece6dd9743ca1aec9b606a5e165bd2460dc65f8719e1bec569fc

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
