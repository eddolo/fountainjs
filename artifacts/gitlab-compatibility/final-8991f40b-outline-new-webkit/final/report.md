# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1f16e1b0abf20468b0d439ea65b0ddd6058240e5 · runtime 345d2f2c4233274201a0247f0fe09858bf6b74e365b1e1c2feae9d8e0986a03b · integration 62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824

Browser on stock / replacement: webkit 26.5 (linux) / webkit 26.5 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

original recorded 3 browser error(s). See the errors in its [run report](../original-1/report.json).

| Case | Invariant | Classification |
| --- | --- | --- |
| create-outline | GitLab returned an empty reader preview for the saved outline-only source | parity |
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
