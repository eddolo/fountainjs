# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ d78fe0a3e2b1743c665b96c31ee188a6316db22b · runtime e0fb074b48490b93d45d04f638a7356f94859a7035186eba6e91b9a67cf99735 · integration 7997e52337c1fa5a8fab4e74cb4cd1c274c6a113f712fd9cba3dcc024c457326

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| live-wiki-authors | The joining author receives the first author’s unsaved draft | parity |
| live-wiki-authors | The first editor identifies the second author after both move their cursors | parity |
| live-wiki-authors | The second editor identifies the first author after both move their cursors | parity |
| live-wiki-authors | Both rich editors render the other author’s named caret | parity |
| live-wiki-authors | Peer undo retains the first author’s edit | parity |
| live-wiki-authors | Peer redo restores the second edit on the first screen | parity |
| live-wiki-authors | The wiki API stores both edits, paragraphs and original formatting | parity |
| live-wiki-authors | The wiki API also retains the original line endings | shared-limitation |
| live-wiki-authors | Both edits survive in the other author’s reloaded reader | parity |
| live-wiki-authors | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
