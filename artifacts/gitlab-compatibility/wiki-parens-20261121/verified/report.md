# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ be0975d6ddfee4d0198f200927613f69bd916328 · runtime f8b727a79bb8b96e5bd28b0b049bd7292cf95afeac9bccc0c7d2d08d615e7687 · integration e924ba664a63ae753824c6c775e59816e8ceff318cdb5107ec30c787013f1783

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

Wiki controller on stock / replacement: source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af` / source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af`.

| Case | Invariant | Classification |
| --- | --- | --- |
| parenthesized-task-list | The joining author receives the first author’s unsaved draft | parity |
| parenthesized-task-list | The first editor identifies the second author after both move their cursors | parity |
| parenthesized-task-list | The second editor identifies the first author after both move their cursors | parity |
| parenthesized-task-list | Both rich editors render the other author’s named caret | parity |
| parenthesized-task-list | Peer undo retains the first author’s edit | parity |
| parenthesized-task-list | Peer redo restores the second edit on the first screen | parity |
| parenthesized-task-list | The joining author sees the original task states | parity |
| parenthesized-task-list | Undo restores the shared checkbox without losing either author’s prose | parity |
| parenthesized-task-list | Redo marks the task complete on the other screen | parity |
| parenthesized-task-list | The reopened reader displays all five saved checkboxes | parity |
| parenthesized-task-list | The reopened reader retains the not-applicable task | parity |
| parenthesized-task-list | The numbered checklist still starts at three | parity |
| parenthesized-task-list | The wiki API stores both edits, paragraphs and original formatting | improvement |
| parenthesized-task-list | The wiki API also retains the original line endings | improvement |
| parenthesized-task-list | Both edits survive in the other author’s reloaded reader | parity |
| parenthesized-task-list | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
