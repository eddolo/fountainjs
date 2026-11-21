# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 13b52da2079cab226ea220cbd2d54e302b345ea9 · runtime ee69e491eb02152c72baa57cc0955a83318158e99f5d96f024ac4c6ca4a78e70 · integration 7d73c93564d534489a3aabd41156f01037d3bbf20e5179861f64d948bf94e418

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| reference-link-handover | The joining author receives the first author’s unsaved draft | parity |
| reference-link-handover | The first editor identifies the second author after both move their cursors | parity |
| reference-link-handover | The second editor identifies the first author after both move their cursors | parity |
| reference-link-handover | Both rich editors render the other author’s named caret | parity |
| reference-link-handover | Peer undo retains the first author’s edit | parity |
| reference-link-handover | Peer redo restores the second edit on the first screen | parity |
| reference-link-handover | The wiki API retains both link uses and their single authored definition after a label edit | improvement |
| reference-link-handover | The first author sees the other author’s new link label | parity |
| reference-link-handover | Both links keep their title in the reopened reader | parity |
| reference-link-handover | The reloaded reader opens the intended wiki page | parity |
| reference-link-handover | The wiki API retains the fixture’s LF line endings | shared-limitation |
| reference-link-handover | Both edits survive in the other author’s reloaded reader | parity |
| reference-link-handover | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
