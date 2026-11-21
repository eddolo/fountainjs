# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 3d6139ba7bd21f91a0373d0f08eac42d717380a8 · runtime 36d7edee61b392dca47a53347386f3dda64210769aacfc4a92ca7b939f45983b · integration 1a258dad2fa37c4337c564f24fdb9269db48452e3f7de02d920f1297b92cd5fa

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| departed-wiki-uploader | The joining author receives the first author’s unsaved draft | parity |
| departed-wiki-uploader | The first editor identifies the second author after both move their cursors | parity |
| departed-wiki-uploader | The second editor identifies the first author after both move their cursors | parity |
| departed-wiki-uploader | Both rich editors render the other author’s named caret | parity |
| departed-wiki-uploader | Peer undo retains the first author’s edit | parity |
| departed-wiki-uploader | Peer redo restores the second edit on the first screen | parity |
| departed-wiki-uploader | The wiki API stores both edits, paragraphs and original formatting | parity |
| departed-wiki-uploader | The wiki API also retains the original line endings | shared-limitation |
| departed-wiki-uploader | The other author sees the pending file before the uploader leaves | parity |
| departed-wiki-uploader | No upload reaches GitLab after the uploader closes | parity |
| departed-wiki-uploader | The remaining author regains Save after the uploader leaves | parity |
| departed-wiki-uploader | Saved Markdown retains the edits before and after the uploader left | parity |
| departed-wiki-uploader | The reopened wiki contains no filename for a file GitLab never received | improvement |
| departed-wiki-uploader | Both edits survive in the other author’s reloaded reader | parity |
| departed-wiki-uploader | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
