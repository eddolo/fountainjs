# Matched GitLab editor comparison

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| posted-range-review | Selected source characters | parity |
| posted-range-review | Source at first visible Markdown field | parity |
| posted-range-review | Source after declared observation window | parity |
| posted-range-review | Selected target offsets | parity |
| posted-range-review | Initial posted proposal retains original source | parity |
| posted-range-review | Initial posted proposal retains target offsets | parity |
| posted-range-review | Posted proposal reopens with exact source and range | parity |
| posted-range-review | Editing source retains the original target range | parity |
| posted-range-review | Expanding the range retains edited source | parity |
| posted-range-review | Undoing range adjustment restores prior range and preserves edited source | parity |
| posted-range-review | Redoing range adjustment restores expanded range and edited source | parity |
| posted-range-review | Source-mode handoff retains reviewed source | parity |
| posted-range-review | Source-mode handoff retains reviewed offsets | parity |
| posted-range-review | Saving review changes only the intended source and range | parity |
| posted-range-review | Reloading reviewed rich proposal retains source | parity |
| posted-range-review | Reloading reviewed rich proposal retains offsets | parity |
| posted-range-review | Posted review does not write repository contents | parity |
| posted-range-review | Posted review does not create a source commit | parity |
| posted-range-review | Applying reviewed proposal changes exactly the expanded target | parity |
| posted-range-review | Application creates one child of the seed commit | parity |
| posted-range-review | Reviewed application has Applied metadata immediately after commit | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
