# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 55bee08472ca32a2d4205100432320d75462b8f7 · runtime 6951dd9c9d3447433d39007aa6afeba1c2abac330003d7a5cffdc3b76a17ea0f · integration d924ea8f7ffbc6a212979996db579992831db4c81f2edf11ba4531bf3b8fc197

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

Wiki controller on stock / replacement: source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af` / source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af`.

| Case | Invariant | Classification |
| --- | --- | --- |
| shared-task-list | The joining author receives the first author’s unsaved draft | parity |
| shared-task-list | The first editor identifies the second author after both move their cursors | parity |
| shared-task-list | The second editor identifies the first author after both move their cursors | parity |
| shared-task-list | Both rich editors render the other author’s named caret | parity |
| shared-task-list | Peer undo retains the first author’s edit | parity |
| shared-task-list | Peer redo restores the second edit on the first screen | parity |
| shared-task-list | The joining author sees the original task states | parity |
| shared-task-list | Undo restores the shared checkbox without losing either author’s prose | parity |
| shared-task-list | Redo marks the task complete on the other screen | parity |
| shared-task-list | The reopened reader displays all five saved checkboxes | parity |
| shared-task-list | The reopened reader retains the not-applicable task | parity |
| shared-task-list | The numbered checklist still starts at three | parity |
| shared-task-list | The wiki API stores both edits, paragraphs and original formatting | improvement |
| shared-task-list | The wiki API also retains the original line endings | improvement |
| shared-task-list | Both edits survive in the other author’s reloaded reader | parity |
| shared-task-list | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
