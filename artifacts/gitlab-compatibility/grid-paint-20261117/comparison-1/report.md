# Matched GitLab editor comparison

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| cell-grid-forward | initial: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-forward | cut: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-forward | cutUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-forward | pasted: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-forward | pasteUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-forward | pasteRedo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-forward | reopened: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-forward | Actual copySelection covers exactly the requested rectangle | parity |
| cell-grid-forward | Actual cutSelection covers exactly the requested rectangle | parity |
| cell-grid-forward | Unselected control cell keeps identical pixels during copySelection | parity |
| cell-grid-forward | Unselected control cell keeps identical pixels during cutSelection | parity |
| cell-grid-forward | initial: document and both tables are loaded | parity |
| cell-grid-forward | reopened: document and both tables are loaded | parity |
| cell-grid-forward | Cell copy supplies exact TSV boundaries | parity |
| cell-grid-forward | Cell copy supplies actual rich HTML | parity |
| cell-grid-forward | Cell cut supplies exact TSV boundaries | parity |
| cell-grid-forward | Cell paste retains the copied payload | parity |
| cell-grid-forward | Actual external rich paste preserves body-cell roles and semantics | parity |
| cell-grid-forward | Actual external plain paste preserves TSV | parity |
| cell-grid-forward | Paste begins with a verified caret in the target cell | parity |
| cell-grid-forward | Save remains directly reachable after table paste | parity |
| cell-grid-backward | initial: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-backward | cut: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-backward | cutUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-backward | pasted: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-backward | pasteUndo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-backward | pasteRedo: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-backward | reopened: exact table geometry, cell roles, paragraphs, marks, links and surrounding prose | parity |
| cell-grid-backward | Actual copySelection covers exactly the requested rectangle | parity |
| cell-grid-backward | Actual cutSelection covers exactly the requested rectangle | parity |
| cell-grid-backward | Unselected control cell keeps identical pixels during copySelection | parity |
| cell-grid-backward | Unselected control cell keeps identical pixels during cutSelection | parity |
| cell-grid-backward | initial: document and both tables are loaded | parity |
| cell-grid-backward | reopened: document and both tables are loaded | parity |
| cell-grid-backward | Cell copy supplies exact TSV boundaries | parity |
| cell-grid-backward | Cell copy supplies actual rich HTML | parity |
| cell-grid-backward | Cell cut supplies exact TSV boundaries | parity |
| cell-grid-backward | Cell paste retains the copied payload | parity |
| cell-grid-backward | Actual external rich paste preserves body-cell roles and semantics | parity |
| cell-grid-backward | Actual external plain paste preserves TSV | parity |
| cell-grid-backward | Paste begins with a verified caret in the target cell | parity |
| cell-grid-backward | Save remains directly reachable after table paste | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
