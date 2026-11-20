# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 66ab960d16331e2bed72a1b8258129ace21fc0ea · runtime 67ecdfd2f5e1bed0c6fa87596172ff4b43b6840eaba28831ca666f4ac40fb7ef · integration 42d7bf3063fa117343ddc976c907edd483fd4b46ba43468f1b4e8a2b3b948f17

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| create-outline | The issue starts with an empty rich editor | parity |
| create-outline | The toolbar creates one table of contents | parity |
| create-outline | Undo removes the new outline | parity |
| create-outline | Redo restores it | parity |
| create-outline | Save retains the directive before any heading exists | parity |
| create-outline | Creating the outline saves only the authored directive | parity |
| create-outline | A fresh rich editor shows the outline before a heading exists | improvement |
| create-outline | Saving a rich prose edit without headings retains the earlier outline directive | improvement |
| create-outline | Switching to plain text retains the directive | improvement |
| create-outline | After authoring a heading, GitLab stores its text, prose and the directive | improvement |
| create-outline | The reader links to the new heading | improvement |
| create-outline | The final rich editor shows one outline with the new heading | improvement |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
