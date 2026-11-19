# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 2cb51f61e53a3da07746cc89f81f645c4f4679ff · runtime 18cb22b436e24cfeec24534d02439d8341d8bcbcdc7d0a8dee9ed3d60d386c3a · integration d2394d5a033f4f0c153cdb7b81ac204951f61a3002ce4df45556880315944071

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| colspan | initial: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | cut: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | cutUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | pasted: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | pasteUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | missing-evidence |
| colspan | pasteRedo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | missing-evidence |
| colspan | reopened: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | missing-evidence |
| colspan | Actual copySelection covers exactly the requested rectangle | parity |
| colspan | Actual cutSelection covers exactly the requested rectangle | parity |
| colspan | Unselected control cell keeps identical pixels during copySelection | parity |
| colspan | Unselected control cell keeps identical pixels during cutSelection | parity |
| colspan | initial: document and both tables are loaded | parity |
| colspan | reopened: document and both tables are loaded | missing-evidence |
| colspan | Cell copy supplies exact TSV boundaries | improvement |
| colspan | Cell copy supplies actual rich HTML | parity |
| colspan | Cell cut supplies exact TSV boundaries | improvement |
| colspan | Cell paste retains the copied payload | improvement |
| colspan | Actual external rich paste preserves body-cell roles and semantics | parity |
| colspan | Actual external plain paste preserves TSV | improvement |
| colspan | Paste begins with a verified caret in the target cell | parity |
| colspan | Save remains directly reachable after table paste | missing-evidence |
| rowspan | initial: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | cut: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | cutUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | pasted: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | pasteUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | missing-evidence |
| rowspan | pasteRedo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | missing-evidence |
| rowspan | reopened: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | missing-evidence |
| rowspan | Actual copySelection covers exactly the requested rectangle | parity |
| rowspan | Actual cutSelection covers exactly the requested rectangle | parity |
| rowspan | Unselected control cell keeps identical pixels during copySelection | parity |
| rowspan | Unselected control cell keeps identical pixels during cutSelection | parity |
| rowspan | initial: document and both tables are loaded | parity |
| rowspan | reopened: document and both tables are loaded | missing-evidence |
| rowspan | Cell copy supplies exact TSV boundaries | improvement |
| rowspan | Cell copy supplies actual rich HTML | parity |
| rowspan | Cell cut supplies exact TSV boundaries | improvement |
| rowspan | Cell paste retains the copied payload | improvement |
| rowspan | Actual external rich paste preserves body-cell roles and semantics | parity |
| rowspan | Actual external plain paste preserves TSV | improvement |
| rowspan | Paste begins with a verified caret in the target cell | parity |
| rowspan | Save remains directly reachable after table paste | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
