# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1f16e1b0abf20468b0d439ea65b0ddd6058240e5 · runtime 345d2f2c4233274201a0247f0fe09858bf6b74e365b1e1c2feae9d8e0986a03b · integration 62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| developer-removed-text | Initial project membership is the declared role | parity |
| developer-removed-text | Non-author member can read intact content | parity |
| developer-removed-text | Task-owned account ends with Guest access | parity |
| developer-removed-text | Developer starts with update authority | parity |
| developer-removed-text | Task membership is fully removed | parity |
| developer-removed-text | REST and GraphQL description reads work before removal | parity |
| developer-removed-text | Removed actor cannot read private source through REST | parity |
| developer-removed-text | Removed actor cannot read private work item through GraphQL | parity |
| developer-removed-text | Denial preserves the same authenticated actor | parity |
| developer-removed-text | Removed actor cannot write through REST | parity |
| developer-removed-text | Denied REST probe leaves persisted source unchanged | parity |
| developer-removed-text | Denied Save does not report a false edit conflict | parity |
| developer-removed-text | Returning from source inspection does not leave a render error | improvement |
| developer-removed-text | Exact pending source at retainedSource | parity |
| developer-removed-text | Exact pending source at recoveredSource | parity |
| developer-removed-text | Exact pending source at finalReopenedSource | parity |
| developer-removed-text | Pending rich document remains visible at deniedBeforeInspection | parity |
| developer-removed-text | Pending rich document remains visible at deniedAfterInspection | improvement |
| developer-removed-text | Restoring Developer grants update authority again | parity |
| developer-removed-text | initialWriteSucceeded | parity |
| developer-removed-text | draftStayedLocal | parity |
| developer-removed-text | revokedWriteBlocked | parity |
| developer-removed-text | deniedSaveReported | improvement |
| developer-removed-text | draftRetainedAfterDenial | parity |
| developer-removed-text | draftRecoveredAfterReload | parity |
| developer-removed-text | finalSourceExact | parity |
| developer-removed-text | finalReopenExact | parity |
| developer-removed-text | confirmed: content, marks, link and code are intact | parity |
| developer-removed-text | recovered: content, marks, link and code are intact | parity |
| developer-removed-text | final: content, marks, link and code are intact | parity |
| developer-removed-text | Authenticated task member has no browser errors | parity |
| developer-removed-empty | Initial project membership is the declared role | parity |
| developer-removed-empty | Non-author member can read intact content | parity |
| developer-removed-empty | Task-owned account ends with Guest access | parity |
| developer-removed-empty | Developer starts with update authority | parity |
| developer-removed-empty | Task membership is fully removed | parity |
| developer-removed-empty | REST and GraphQL description reads work before removal | parity |
| developer-removed-empty | Removed actor cannot read private source through REST | parity |
| developer-removed-empty | Removed actor cannot read private work item through GraphQL | parity |
| developer-removed-empty | Denial preserves the same authenticated actor | parity |
| developer-removed-empty | Removed actor cannot write through REST | parity |
| developer-removed-empty | Denied REST probe leaves persisted source unchanged | parity |
| developer-removed-empty | Denied Save does not report a false edit conflict | parity |
| developer-removed-empty | Returning from source inspection does not leave a render error | parity |
| developer-removed-empty | Exact pending source at retainedSource | parity |
| developer-removed-empty | Exact pending source at recoveredSource | improvement |
| developer-removed-empty | Exact pending source at finalReopenedSource | improvement |
| developer-removed-empty | Pending rich document remains visible at deniedBeforeInspection | parity |
| developer-removed-empty | Pending rich document remains visible at deniedAfterInspection | parity |
| developer-removed-empty | The author actually clears the draft | parity |
| developer-removed-empty | Empty intent survives host null/empty persistence | improvement |
| developer-removed-empty | Restoring Developer grants update authority again | parity |
| developer-removed-empty | initialWriteSucceeded | parity |
| developer-removed-empty | draftStayedLocal | parity |
| developer-removed-empty | revokedWriteBlocked | parity |
| developer-removed-empty | deniedSaveReported | improvement |
| developer-removed-empty | draftRetainedAfterDenial | parity |
| developer-removed-empty | draftRecoveredAfterReload | improvement |
| developer-removed-empty | finalEmptyStored | improvement |
| developer-removed-empty | finalReopenExact | improvement |
| developer-removed-empty | confirmed: content, marks, link and code are intact | parity |
| developer-removed-empty | recovered: content, marks, link and code are intact | improvement |
| developer-removed-empty | final: content, marks, link and code are intact | improvement |
| developer-removed-empty | Authenticated task member has no browser errors | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
