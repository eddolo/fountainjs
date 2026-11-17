# Matched GitLab editor comparison

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| rich-clipboard | initial: headings | parity |
| rich-clipboard | initial: prose | parity |
| rich-clipboard | initial: bold | parity |
| rich-clipboard | initial: italic | parity |
| rich-clipboard | initial: links | parity |
| rich-clipboard | initial: inlineCode | parity |
| rich-clipboard | initial: quotes | parity |
| rich-clipboard | initial: tables | parity |
| rich-clipboard | initial: tasks | parity |
| rich-clipboard | initial: code | parity |
| rich-clipboard | externalRich: headings | parity |
| rich-clipboard | externalRich: prose | parity |
| rich-clipboard | externalRich: bold | parity |
| rich-clipboard | externalRich: italic | parity |
| rich-clipboard | externalRich: links | parity |
| rich-clipboard | externalRich: inlineCode | parity |
| rich-clipboard | externalRich: quotes | parity |
| rich-clipboard | externalRich: tables | parity |
| rich-clipboard | externalRich: code | parity |
| rich-clipboard | pasted: headings | improvement |
| rich-clipboard | pasted: prose | improvement |
| rich-clipboard | pasted: bold | improvement |
| rich-clipboard | pasted: italic | improvement |
| rich-clipboard | pasted: links | improvement |
| rich-clipboard | pasted: inlineCode | improvement |
| rich-clipboard | pasted: quotes | improvement |
| rich-clipboard | pasted: tables | improvement |
| rich-clipboard | pasted: tasks | improvement |
| rich-clipboard | pasted: code | improvement |
| rich-clipboard | undo: headings | parity |
| rich-clipboard | undo: prose | parity |
| rich-clipboard | undo: bold | parity |
| rich-clipboard | undo: italic | parity |
| rich-clipboard | undo: links | parity |
| rich-clipboard | undo: inlineCode | parity |
| rich-clipboard | undo: quotes | parity |
| rich-clipboard | undo: tables | parity |
| rich-clipboard | undo: tasks | parity |
| rich-clipboard | undo: code | parity |
| rich-clipboard | redo: headings | improvement |
| rich-clipboard | redo: prose | improvement |
| rich-clipboard | redo: bold | improvement |
| rich-clipboard | redo: italic | improvement |
| rich-clipboard | redo: links | improvement |
| rich-clipboard | redo: inlineCode | improvement |
| rich-clipboard | redo: quotes | improvement |
| rich-clipboard | redo: tables | improvement |
| rich-clipboard | redo: tasks | improvement |
| rich-clipboard | redo: code | improvement |
| rich-clipboard | cut: headings | parity |
| rich-clipboard | cut: prose | parity |
| rich-clipboard | cut: bold | parity |
| rich-clipboard | cut: italic | parity |
| rich-clipboard | cut: links | parity |
| rich-clipboard | cut: inlineCode | parity |
| rich-clipboard | cut: quotes | parity |
| rich-clipboard | cut: tables | parity |
| rich-clipboard | cut: tasks | parity |
| rich-clipboard | cut: code | parity |
| rich-clipboard | afterCutPaste: headings | improvement |
| rich-clipboard | afterCutPaste: prose | improvement |
| rich-clipboard | afterCutPaste: bold | improvement |
| rich-clipboard | afterCutPaste: italic | improvement |
| rich-clipboard | afterCutPaste: links | improvement |
| rich-clipboard | afterCutPaste: inlineCode | improvement |
| rich-clipboard | afterCutPaste: quotes | improvement |
| rich-clipboard | afterCutPaste: tables | improvement |
| rich-clipboard | afterCutPaste: tasks | improvement |
| rich-clipboard | afterCutPaste: code | improvement |
| rich-clipboard | reopened: headings | improvement |
| rich-clipboard | reopened: prose | improvement |
| rich-clipboard | reopened: bold | improvement |
| rich-clipboard | reopened: italic | improvement |
| rich-clipboard | reopened: links | improvement |
| rich-clipboard | reopened: inlineCode | improvement |
| rich-clipboard | reopened: quotes | improvement |
| rich-clipboard | reopened: tables | improvement |
| rich-clipboard | reopened: tasks | improvement |
| rich-clipboard | reopened: code | improvement |
| rich-clipboard | Copied plain text retains every declared token | parity |
| rich-clipboard | Copy supplies an actual rich HTML clipboard payload | parity |
| rich-clipboard | External text paste equals the actual copied plain payload | parity |
| rich-clipboard | Append begins with a verified caret in the intended empty paragraph | missing-evidence |
| rich-clipboard | Append clipboard still contains the original copied payload | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
