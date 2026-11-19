# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 80ae30149c8fed68f6f89802cd8f2e22e53ddbd0 · runtime 755d58d35b0ac7e3a6c56286a8089261b3334662e96357925ca1dba0cd2c78f5 · integration 908158c5319f5eb8388633ee75d534f405f638f47e3785be00b2d6e6302583c3

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

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
| middle-two-lines | Selected source characters | parity |
| middle-two-lines | Source at first visible Markdown field | parity |
| middle-two-lines | Source after declared observation window | parity |
| middle-two-lines | Selected target offsets | parity |
| middle-two-lines | Rich editing preserves exact empty or whitespace replacement | parity |
| middle-two-lines | Rich editing explicitly explains the deletion effect in words | improvement |
| middle-two-lines | Empty deletion needs no extra whitespace consent | parity |
| middle-two-lines | Saved deletion source | parity |
| middle-two-lines | Saved target offsets | parity |
| middle-two-lines | Reloaded rich proposal retains exact deletion source | parity |
| middle-two-lines | Draft does not write repository contents | parity |
| middle-two-lines | Draft does not create a source commit | parity |
| middle-two-lines | Deletion removes only the intended file lines | parity |
| middle-two-lines | Application creates one child of the seed commit | parity |
| middle-two-lines | Successful deletion has Applied metadata immediately after commit | parity |
| unicode-whitespace | Selected source characters | parity |
| unicode-whitespace | Source at first visible Markdown field | missing-evidence |
| unicode-whitespace | Source after declared observation window | missing-evidence |
| unicode-whitespace | Selected target offsets | missing-evidence |
| unicode-whitespace | Rich editing preserves exact empty or whitespace replacement | missing-evidence |
| unicode-whitespace | Rich editing explicitly explains the deletion effect in words | missing-evidence |
| unicode-whitespace | Nonempty whitespace deletion requires affirmative intent before acceptance | missing-evidence |
| unicode-whitespace | Saved deletion source | missing-evidence |
| unicode-whitespace | Saved target offsets | missing-evidence |
| unicode-whitespace | Reloaded rich proposal retains exact deletion source | missing-evidence |
| unicode-whitespace | Draft does not write repository contents | missing-evidence |
| unicode-whitespace | Draft does not create a source commit | missing-evidence |
| unicode-whitespace | Deletion removes only the intended file lines | missing-evidence |
| unicode-whitespace | Application creates one child of the seed commit | missing-evidence |
| unicode-whitespace | Successful deletion has Applied metadata immediately after commit | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
