# Matched GitLab editor comparison

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| empty-deletion | Selected source characters | parity |
| empty-deletion | Source at first visible Markdown field | parity |
| empty-deletion | Source after declared observation window | parity |
| empty-deletion | Selected target offsets | parity |
| empty-deletion | Rich editing preserves exact empty or whitespace replacement | parity |
| empty-deletion | Rich editing explicitly explains the deletion effect in words | improvement |
| empty-deletion | Empty deletion needs no extra whitespace consent | parity |
| empty-deletion | Saved deletion source | parity |
| empty-deletion | Saved target offsets | parity |
| empty-deletion | Reloaded rich proposal retains exact deletion source | parity |
| empty-deletion | Draft does not write repository contents | parity |
| empty-deletion | Draft does not create a source commit | parity |
| empty-deletion | Deletion removes only the intended file lines | parity |
| empty-deletion | Application creates one child of the seed commit | parity |
| empty-deletion | Successful deletion has Applied metadata immediately after commit | parity |
| whitespace-deletion | Selected source characters | parity |
| whitespace-deletion | Source at first visible Markdown field | parity |
| whitespace-deletion | Source after declared observation window | parity |
| whitespace-deletion | Selected target offsets | parity |
| whitespace-deletion | Rich editing preserves exact empty or whitespace replacement | parity |
| whitespace-deletion | Rich editing explicitly explains the deletion effect in words | improvement |
| whitespace-deletion | Nonempty whitespace deletion requires affirmative intent before acceptance | improvement |
| whitespace-deletion | Saved deletion source | parity |
| whitespace-deletion | Saved target offsets | parity |
| whitespace-deletion | Reloaded rich proposal retains exact deletion source | improvement |
| whitespace-deletion | Draft does not write repository contents | parity |
| whitespace-deletion | Draft does not create a source commit | parity |
| whitespace-deletion | Deletion removes only the intended file lines | parity |
| whitespace-deletion | Application creates one child of the seed commit | parity |
| whitespace-deletion | Successful deletion has Applied metadata immediately after commit | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
