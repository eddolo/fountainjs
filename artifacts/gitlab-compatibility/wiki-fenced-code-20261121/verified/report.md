# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 556e733eed14da4269d6c0d290bf813187324592 · runtime 4b2057c17826dc19a541aa74cf2800648c642a967e44adaa7cfc7cd80b9da3c1 · integration 9757a5a896347e506905e56f3744291637f4897b4dcf70630284527fee35ecb9

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

Wiki controller on stock / replacement: source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af` / source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af`.

| Case | Invariant | Classification |
| --- | --- | --- |
| wiki-fenced-code | The joining author receives the first author’s unsaved draft | parity |
| wiki-fenced-code | The first editor identifies the second author after both move their cursors | parity |
| wiki-fenced-code | The second editor identifies the first author after both move their cursors | parity |
| wiki-fenced-code | Both rich editors render the other author’s named caret | parity |
| wiki-fenced-code | Peer undo retains the first author’s edit | parity |
| wiki-fenced-code | Peer redo restores the second edit on the first screen | parity |
| wiki-fenced-code | The joining editor sees the indented code | parity |
| wiki-fenced-code | Undo restores the original code on the other screen | parity |
| wiki-fenced-code | Redo restores the code edit on the other screen | parity |
| wiki-fenced-code | The GitLab reader displays the edited code with its indentation | parity |
| wiki-fenced-code | The wiki API stores both edits, paragraphs and original formatting | parity |
| wiki-fenced-code | The wiki API also retains the original line endings | improvement |
| wiki-fenced-code | Both edits survive in the other author’s reloaded reader | parity |
| wiki-fenced-code | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
