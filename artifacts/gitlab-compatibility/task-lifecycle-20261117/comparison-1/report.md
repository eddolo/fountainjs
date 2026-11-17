# Matched GitLab editor comparison

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| task-editing | initial: task text, completion, nesting, prose and marks | parity |
| task-editing | toggled: task text, completion, nesting, prose and marks | parity |
| task-editing | toggleUndo: task text, completion, nesting, prose and marks | parity |
| task-editing | toggleRedo: task text, completion, nesting, prose and marks | parity |
| task-editing | newEmpty: task text, completion, nesting, prose and marks | parity |
| task-editing | newFilled: task text, completion, nesting, prose and marks | parity |
| task-editing | cleared: task text, completion, nesting, prose and marks | parity |
| task-editing | lifted: task text, completion, nesting, prose and marks | parity |
| task-editing | liftUndo: task text, completion, nesting, prose and marks | parity |
| task-editing | liftRedo: task text, completion, nesting, prose and marks | parity |
| task-editing | newBeforeExit: task text, completion, nesting, prose and marks | parity |
| task-editing | exited: task text, completion, nesting, prose and marks | improvement |
| task-editing | final: task text, completion, nesting, prose and marks | improvement |
| task-editing | reopened: task text, completion, nesting, prose and marks | improvement |
| task-editing | initial: document heading loaded before task outcome inspection | parity |
| task-editing | reopened: document heading loaded before task outcome inspection | parity |
| task-editing | Settled caret before Enter is at the last task end | parity |
| task-editing | Enter creates a physically visible separate empty task row | parity |
| task-editing | New empty task caret: inside | parity |
| task-editing | New empty task caret: activeInside | parity |
| task-editing | New empty task caret: collapsed | parity |
| task-editing | New empty task caret: text | parity |
| task-editing | New empty task caret: offset | parity |
| task-editing | Explicit empty-task Enter exits to a focused plain paragraph | improvement |
| task-editing | Actual selected task text before deletion | parity |
| task-editing | Save remains directly reachable after task editing | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
