# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ c38f203aff2c76b5fcce7f84da469a22485be37e · runtime b30b17f0bd84697ac97ea38cc74bf8f634ec522c7dc0374f52a65b7c16ce174e · integration 4d6466d40f36d659bf5b185ca135a2151c19574abce399034449c83d2987c7ad

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

Wiki controller on stock / replacement: source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af` / source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af`.

| Case | Invariant | Classification |
| --- | --- | --- |
| shared-table-tasks | The joining author receives the first author’s unsaved draft | parity |
| shared-table-tasks | The first editor identifies the second author after both move their cursors | parity |
| shared-table-tasks | The second editor identifies the first author after both move their cursors | parity |
| shared-table-tasks | Both rich editors render the other author’s named caret | parity |
| shared-table-tasks | Peer undo retains the first author’s edit | parity |
| shared-table-tasks | Peer redo restores the second edit on the first screen | parity |
| shared-table-tasks | The joining editor sees all three checkbox cells | parity |
| shared-table-tasks | Checkbox undo reaches the first author | parity |
| shared-table-tasks | Checkbox redo reaches the first author | parity |
| shared-table-tasks | The reader reopens all three checkbox cells in order | parity |
| shared-table-tasks | The Retire cell retains its not-applicable state | parity |
| shared-table-tasks | The wiki API stores both edits, paragraphs and original formatting | parity |
| shared-table-tasks | The wiki API also retains the original line endings | improvement |
| shared-table-tasks | Both edits survive in the other author’s reloaded reader | parity |
| shared-table-tasks | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
