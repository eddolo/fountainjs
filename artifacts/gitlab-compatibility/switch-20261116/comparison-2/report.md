# Matched GitLab editor comparison

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| ordinary-immediate | Selected source characters | parity |
| ordinary-immediate | Source at first visible Markdown field | improvement |
| ordinary-immediate | Source after declared observation window | improvement |
| ordinary-immediate | Selected target offsets | improvement |
| ordinary-settled | Selected source characters | parity |
| ordinary-settled | Source at first visible Markdown field | parity |
| ordinary-settled | Source after declared observation window | parity |
| ordinary-settled | Selected target offsets | parity |
| ordinary-settled | Saved replacement source | parity |
| ordinary-settled | Saved target offsets | parity |
| ordinary-settled | Draft does not write repository contents | parity |
| ordinary-settled | Draft does not create a source commit | parity |
| ordinary-settled | Applied repository file contents | parity |
| ordinary-settled | Application creates one child of the seed commit | parity |
| ordinary-settled | Prose editing changes only the intended comment suffix | parity |
| ordinary-settled | Prose editing retains repository content and head | parity |
| ordinary-settled | Prose editing retains Applied flag | shared-limitation |
| ordinary-settled | Prose editing retains unchanged suggestion identity | shared-limitation |
| transport-collision-immediate | Selected source characters | improvement |
| transport-collision-immediate | Source at first visible Markdown field | improvement |
| transport-collision-immediate | Source after declared observation window | improvement |
| transport-collision-immediate | Selected target offsets | improvement |
| transport-collision-settled | Selected source characters | improvement |
| transport-collision-settled | Source at first visible Markdown field | improvement |
| transport-collision-settled | Source after declared observation window | improvement |
| transport-collision-settled | Selected target offsets | parity |
| transport-collision-settled | Saved replacement source | improvement |
| transport-collision-settled | Saved target offsets | parity |
| transport-collision-settled | Draft does not write repository contents | parity |
| transport-collision-settled | Draft does not create a source commit | parity |
| transport-collision-settled | Applied repository file contents | improvement |
| transport-collision-settled | Application creates one child of the seed commit | parity |
| transport-collision-settled | Prose editing changes only the intended comment suffix | parity |
| transport-collision-settled | Prose editing retains repository content and head | parity |
| transport-collision-settled | Prose editing retains Applied flag | shared-limitation |
| transport-collision-settled | Prose editing retains unchanged suggestion identity | shared-limitation |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
