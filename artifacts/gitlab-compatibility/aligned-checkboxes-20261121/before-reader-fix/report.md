# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1e065882fe46849780d41a423aca8d59b04314d1 · runtime 4d40ac7a870ce8a6879d25cda194e471207e1e228669242b92374cbb5ee03e51 · integration c0607b24e3a9825dae891497c20550e30ed96ff63b905aac5940cdad3f646a96

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| merge-center-aligned-gates | All three original checkbox states are editable in their own cells | parity |
| merge-center-aligned-gates | The merged draft retains both selected checkboxes and the neighboring pending task | parity |
| merge-center-aligned-gates | The saved issue retains the edit made before merging the cells | parity |
| merge-center-aligned-gates | The saved reader retains all three checkbox states in the intended layout | improvement |
| merge-center-aligned-gates | The rich editor reopens the merged table with all three checkbox states | improvement |
| merge-center-aligned-gates | Checkbox controls follow the authored center alignment (initialPositions) | improvement |
| merge-center-aligned-gates | Checkbox controls follow the authored center alignment (readerPositions) | regression |
| merge-center-aligned-gates | Checkbox controls follow the authored center alignment (reopenedPositions) | improvement |
| merge-right-aligned-gates | All three original checkbox states are editable in their own cells | parity |
| merge-right-aligned-gates | The merged draft retains both selected checkboxes and the neighboring pending task | parity |
| merge-right-aligned-gates | The saved issue retains the edit made before merging the cells | parity |
| merge-right-aligned-gates | The saved reader retains all three checkbox states in the intended layout | improvement |
| merge-right-aligned-gates | The rich editor reopens the merged table with all three checkbox states | improvement |
| merge-right-aligned-gates | Checkbox controls follow the authored right alignment (initialPositions) | improvement |
| merge-right-aligned-gates | Checkbox controls follow the authored right alignment (readerPositions) | regression |
| merge-right-aligned-gates | Checkbox controls follow the authored right alignment (reopenedPositions) | improvement |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
