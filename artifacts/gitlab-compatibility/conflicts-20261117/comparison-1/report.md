# Matched GitLab editor comparison

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| conflict-discard | initial: content, marks, links and code stay intact | parity |
| conflict-discard | remoteInitial: content, marks, links and code stay intact | parity |
| conflict-discard | local: content, marks, links and code stay intact | parity |
| conflict-discard | remoteSaved: content, marks, links and code stay intact | parity |
| conflict-discard | resolved: content, marks, links and code stay intact | parity |
| conflict-discard | final: content, marks, links and code stay intact | parity |
| conflict-discard | independentContexts | parity |
| conflict-discard | noAutomaticOverwrite | parity |
| conflict-discard | localDraftRetained | parity |
| conflict-discard | conflictObserved | parity |
| conflict-discard | conflictSourceExact | parity |
| conflict-discard | conflictSourceReadonly | parity |
| conflict-discard | resolutionSourceExact | parity |
| conflict-discard | freshWarningAbsent | parity |
| conflict-discard | freshSourceMatchesServer | parity |
| conflict-discard | normalSaveReachable | parity |
| conflict-discard | finalSourceMatchesServer | parity |
| conflict-discard | Second session has no browser errors | parity |
| conflict-overwrite | initial: content, marks, links and code stay intact | parity |
| conflict-overwrite | remoteInitial: content, marks, links and code stay intact | parity |
| conflict-overwrite | local: content, marks, links and code stay intact | parity |
| conflict-overwrite | remoteSaved: content, marks, links and code stay intact | parity |
| conflict-overwrite | resolved: content, marks, links and code stay intact | parity |
| conflict-overwrite | final: content, marks, links and code stay intact | parity |
| conflict-overwrite | independentContexts | parity |
| conflict-overwrite | noAutomaticOverwrite | parity |
| conflict-overwrite | localDraftRetained | parity |
| conflict-overwrite | conflictObserved | parity |
| conflict-overwrite | conflictSourceExact | parity |
| conflict-overwrite | conflictSourceReadonly | parity |
| conflict-overwrite | resolutionSourceExact | parity |
| conflict-overwrite | freshWarningAbsent | parity |
| conflict-overwrite | freshSourceMatchesServer | parity |
| conflict-overwrite | normalSaveReachable | parity |
| conflict-overwrite | finalSourceMatchesServer | parity |
| conflict-overwrite | Overwriting requires the named overwrite action | parity |
| conflict-overwrite | Second session has no browser errors | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
