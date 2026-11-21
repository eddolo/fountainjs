# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ f333a9396116c642f482f09afd38dd7df1d7be60 · runtime 9ceac91cd39fa6b988dd50d52704687650b8ae162c63178d5c49856e7863d75b · integration fbf559e6c0a9c4a0fce3295d3ea4d839737518d2586d67051e09b3bd1483142e

Browser on stock / replacement: firefox 153.0 (linux) / firefox 153.0 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

Wiki controller on stock / replacement: source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af` / source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af`.

| Case | Invariant | Classification |
| --- | --- | --- |
| shared-aligned-table-tasks | The joining author receives the first author’s unsaved draft | parity |
| shared-aligned-table-tasks | The first editor identifies the second author after both move their cursors | parity |
| shared-aligned-table-tasks | The second editor identifies the first author after both move their cursors | parity |
| shared-aligned-table-tasks | Both rich editors render the other author’s named caret | parity |
| shared-aligned-table-tasks | Peer undo retains the first author’s edit | parity |
| shared-aligned-table-tasks | Peer redo restores the second edit on the first screen | parity |
| shared-aligned-table-tasks | All three checkbox centers lie in the right-hand portion of their authored column while editing | improvement |
| shared-aligned-table-tasks | The reopened reader places all three checkbox centers on the right | parity |
| shared-aligned-table-tasks | The joining editor sees all three checkbox cells | parity |
| shared-aligned-table-tasks | Checkbox undo reaches the first author | parity |
| shared-aligned-table-tasks | Checkbox redo reaches the first author | parity |
| shared-aligned-table-tasks | The reader reopens all three checkbox cells in order | parity |
| shared-aligned-table-tasks | The Retire cell retains its not-applicable state | parity |
| shared-aligned-table-tasks | The wiki API stores both edits, paragraphs and original formatting | parity |
| shared-aligned-table-tasks | The wiki API also retains the original line endings | improvement |
| shared-aligned-table-tasks | Both edits survive in the other author’s reloaded reader | parity |
| shared-aligned-table-tasks | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
