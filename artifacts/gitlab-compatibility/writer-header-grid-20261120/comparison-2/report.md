# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 442191162f18d104a446bb8f5e4684da0895ee92 · runtime 167d91c06ce5931c9ad48dd4f7c4eb17db062cf82293f496dad850e7d047bf8e · integration dec7e985304723772ba4abc53621b00b78176f38fdc9b310bcc23f330f728c12

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| merged-header | initial: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| merged-header | cut: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| merged-header | cutUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| merged-header | pasted: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| merged-header | pasteUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| merged-header | pasteRedo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| merged-header | reopened: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| merged-header | Actual copySelection covers exactly the requested rectangle | parity |
| merged-header | Actual cutSelection covers exactly the requested rectangle | parity |
| merged-header | Unselected control cell keeps identical pixels during copySelection | parity |
| merged-header | Unselected control cell keeps identical pixels during cutSelection | parity |
| merged-header | initial: document and both tables are loaded | parity |
| merged-header | reopened: document and both tables are loaded | parity |
| merged-header | Writer pasted: one native Writer table | parity |
| merged-header | Writer pasted: exact cell text including whitespace | parity |
| merged-header | Writer pasted: bold emphasis on owner | parity |
| merged-header | Writer pasted: Runbook hyperlink destination | parity |
| merged-header | Writer reopened: one native Writer table | parity |
| merged-header | Writer reopened: exact cell text including whitespace | parity |
| merged-header | Writer reopened: bold emphasis on owner | parity |
| merged-header | Writer reopened: Runbook hyperlink destination | parity |
| merged-header | The stored ODT header cell spans two columns | parity |
| merged-header | Cell copy supplies exact TSV boundaries | improvement |
| merged-header | Cell copy supplies actual rich HTML | parity |
| merged-header | Cell cut supplies exact TSV boundaries | improvement |
| merged-header | Cell paste retains the copied payload | improvement |
| merged-header | External rich paste preserves cell roles, spans, marks and links | parity |
| merged-header | Actual external plain paste preserves TSV | improvement |
| merged-header | Paste begins with a verified caret in the target cell | parity |
| merged-header | Save remains directly reachable after table paste | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
