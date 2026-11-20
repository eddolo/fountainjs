# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ c088660e184276e74899bb33afc70d89d87147e2 · runtime a4984167ddd54f13316f71078963dd365273e06ed7b4874122aa3691cdefc639 · integration 05168327d748ffdad6e68892dd7be7cc042b06d2e77311bb180c5817ded438cc

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| release-table | The size picker inserts a two-row, three-column table with a header | parity |
| release-table | The six typed cell values are in their intended cells | parity |
| release-table | Adding a row preserves existing cells | parity |
| release-table | Adding a column preserves existing cells | parity |
| release-table | Deleting the added column preserves both original rows | parity |
| release-table | Deleting the added row restores the original geometry | parity |
| release-table | Merging adjacent header cells preserves both labels | parity |
| release-table | Splitting the merged cell restores its geometry and retains its content | parity |
| release-table | Delete table removes the table from the editor | parity |
| release-table | The heading and surrounding prose survive deletion | parity |
| release-table | Undo restores all cells and their content | improvement |
| release-table | Redo removes the table again | parity |
| release-table | A final undo restores the table before Save | improvement |
| release-table | The issue API contains all six authored values | parity |
| release-table | The reloaded reader shows the intended cells | parity |
| release-table | The rich editor reopens the authored table | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
