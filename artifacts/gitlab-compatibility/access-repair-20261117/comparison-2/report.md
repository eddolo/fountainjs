# Matched GitLab editor comparison

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| guest-readonly | Initial project membership is the declared role | parity |
| guest-readonly | Non-author member can read intact content | parity |
| guest-readonly | Task-owned account ends with Guest access | parity |
| guest-readonly | Guest has no update permission on this root-authored record | parity |
| guest-readonly | editControlAbsent | parity |
| guest-readonly | editableRootsAbsent | parity |
| guest-readonly | writeDenied | parity |
| guest-readonly | serverUnchanged | parity |
| guest-readonly | anonymousContentAbsent | parity |
| guest-readonly | anonymousEditAbsent | parity |
| guest-readonly | anonymousAPIDenied | parity |
| guest-readonly | Denied update leaves the reloaded document intact | parity |
| guest-readonly | Authenticated task member has no browser errors | parity |
| developer-revocation | Initial project membership is the declared role | parity |
| developer-revocation | Non-author member can read intact content | parity |
| developer-revocation | Task-owned account ends with Guest access | parity |
| developer-revocation | Developer starts with update authority | parity |
| developer-revocation | Downgrade revokes update authority | parity |
| developer-revocation | Restoring Developer grants update authority again | parity |
| developer-revocation | initialWriteSucceeded | parity |
| developer-revocation | draftStayedLocal | parity |
| developer-revocation | revokedWriteBlocked | parity |
| developer-revocation | deniedSaveReported | improvement |
| developer-revocation | draftRetainedAfterDenial | improvement |
| developer-revocation | draftRecoveredAfterReload | improvement |
| developer-revocation | finalSourceExact | improvement |
| developer-revocation | finalReopenExact | improvement |
| developer-revocation | confirmed: content, marks, link and code are intact | parity |
| developer-revocation | recovered: content, marks, link and code are intact | improvement |
| developer-revocation | final: content, marks, link and code are intact | improvement |
| developer-revocation | Authenticated task member has no browser errors | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
