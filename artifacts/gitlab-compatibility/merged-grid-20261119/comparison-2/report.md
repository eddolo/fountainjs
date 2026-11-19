# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 7beb38a9871875f1acaeed346e4f9e76e4c7dcaf56fab3d6b81ef81db2be6cee

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| colspan | initial: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | cut: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | cutUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | pasted: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | pasteUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | pasteRedo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | reopened: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| colspan | Actual copySelection covers exactly the requested rectangle | parity |
| colspan | Actual cutSelection covers exactly the requested rectangle | parity |
| colspan | Unselected control cell keeps identical pixels during copySelection | parity |
| colspan | Unselected control cell keeps identical pixels during cutSelection | parity |
| colspan | initial: document and both tables are loaded | parity |
| colspan | reopened: document and both tables are loaded | parity |
| colspan | Cell copy supplies exact TSV boundaries | improvement |
| colspan | Cell copy supplies actual rich HTML | parity |
| colspan | Cell cut supplies exact TSV boundaries | improvement |
| colspan | Cell paste retains the copied payload | improvement |
| colspan | Actual external rich paste preserves body-cell roles and semantics | parity |
| colspan | Actual external plain paste preserves TSV | improvement |
| colspan | Paste begins with a verified caret in the target cell | parity |
| colspan | Save remains directly reachable after table paste | parity |
| rowspan | initial: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | cut: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | cutUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | pasted: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | pasteUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | pasteRedo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | reopened: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| rowspan | Actual copySelection covers exactly the requested rectangle | parity |
| rowspan | Actual cutSelection covers exactly the requested rectangle | parity |
| rowspan | Unselected control cell keeps identical pixels during copySelection | parity |
| rowspan | Unselected control cell keeps identical pixels during cutSelection | parity |
| rowspan | initial: document and both tables are loaded | parity |
| rowspan | reopened: document and both tables are loaded | parity |
| rowspan | Cell copy supplies exact TSV boundaries | improvement |
| rowspan | Cell copy supplies actual rich HTML | parity |
| rowspan | Cell cut supplies exact TSV boundaries | improvement |
| rowspan | Cell paste retains the copied payload | improvement |
| rowspan | Actual external rich paste preserves body-cell roles and semantics | parity |
| rowspan | Actual external plain paste preserves TSV | improvement |
| rowspan | Paste begins with a verified caret in the target cell | parity |
| rowspan | Save remains directly reachable after table paste | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
