# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 0f7b324cb9c0812dc1362258208c6e5aebcabbe0 · runtime bbe85ae1f4c9f3d7602807b1ff19f9e271534134e010263b21f3eefe392bf651 · integration 3792f47211cb1b6f626421f5675861a9730bd9d9b50ba1128b09f358535537e3

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

Packaged GitLab rollback data retention: open.

| Authoring editor | Issue | Markdown edit and original source | Rich edit saved | Table content and attributes after rich Save | Reader control alignment on arrival |
| --- | ---: | --- | --- | --- | --- |
| fountain | #735 | Preserved | Changed | Preserved | left, left, left |
| original | #737 | Preserved | Changed | Preserved | center |
| fountain | #736 | Preserved | Changed | Preserved | left, left, left |
| original | #738 | Preserved | Changed | Preserved | right |

| Case | Invariant | Classification |
| --- | --- | --- |
| merge-center-aligned-gates | All three original checkbox states are editable in their own cells | parity |
| merge-center-aligned-gates | The merged draft retains both selected checkboxes and the neighboring pending task | parity |
| merge-center-aligned-gates | The saved issue retains the edit made before merging the cells | parity |
| merge-center-aligned-gates | The saved reader retains all three checkbox states in the intended layout | improvement |
| merge-center-aligned-gates | The rich editor reopens the merged table with all three checkbox states | improvement |
| merge-center-aligned-gates | Checkbox controls follow the authored center alignment (initialPositions) | improvement |
| merge-center-aligned-gates | Checkbox controls follow the authored center alignment (readerPositions) | parity |
| merge-center-aligned-gates | Checkbox controls follow the authored center alignment (reopenedPositions) | improvement |
| merge-right-aligned-gates | All three original checkbox states are editable in their own cells | parity |
| merge-right-aligned-gates | The merged draft retains both selected checkboxes and the neighboring pending task | parity |
| merge-right-aligned-gates | The saved issue retains the edit made before merging the cells | parity |
| merge-right-aligned-gates | The saved reader retains all three checkbox states in the intended layout | improvement |
| merge-right-aligned-gates | The rich editor reopens the merged table with all three checkbox states | improvement |
| merge-right-aligned-gates | Checkbox controls follow the authored right alignment (initialPositions) | improvement |
| merge-right-aligned-gates | Checkbox controls follow the authored right alignment (readerPositions) | parity |
| merge-right-aligned-gates | Checkbox controls follow the authored right alignment (reopenedPositions) | improvement |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
