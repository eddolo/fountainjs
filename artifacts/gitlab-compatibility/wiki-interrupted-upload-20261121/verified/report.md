# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 3d6139ba7bd21f91a0373d0f08eac42d717380a8 · runtime 36d7edee61b392dca47a53347386f3dda64210769aacfc4a92ca7b939f45983b · integration 1a258dad2fa37c4337c564f24fdb9269db48452e3f7de02d920f1297b92cd5fa

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| interrupted-wiki-attachment | The joining author receives the first author’s unsaved draft | parity |
| interrupted-wiki-attachment | The first editor identifies the second author after both move their cursors | parity |
| interrupted-wiki-attachment | The second editor identifies the first author after both move their cursors | parity |
| interrupted-wiki-attachment | Both rich editors render the other author’s named caret | parity |
| interrupted-wiki-attachment | Peer undo retains the first author’s edit | parity |
| interrupted-wiki-attachment | Peer redo restores the second edit on the first screen | parity |
| interrupted-wiki-attachment | The wiki API stores both edits, paragraphs and original formatting | parity |
| interrupted-wiki-attachment | The wiki API also retains the original line endings | shared-limitation |
| interrupted-wiki-attachment | The second author sees the pending filename before Save | parity |
| interrupted-wiki-attachment | Save waits until the attachment can be included in the revision | improvement |
| interrupted-wiki-attachment | The interrupted request is never forwarded to GitLab | parity |
| interrupted-wiki-attachment | The author can retry the retained file without opening the picker again | improvement |
| interrupted-wiki-attachment | One deliberate retry completes the interrupted transfer | parity |
| interrupted-wiki-attachment | GitLab receives the file once | parity |
| interrupted-wiki-attachment | The saved source retains both authors’ text and the attachment in its own paragraph | parity |
| interrupted-wiki-attachment | The reopened attachment matches the original bytes | parity |
| interrupted-wiki-attachment | Both edits survive in the other author’s reloaded reader | parity |
| interrupted-wiki-attachment | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
