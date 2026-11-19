# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 80ae30149c8fed68f6f89802cd8f2e22e53ddbd0 · runtime 755d58d35b0ac7e3a6c56286a8089261b3334662e96357925ca1dba0cd2c78f5 · integration 908158c5319f5eb8388633ee75d534f405f638f47e3785be00b2d6e6302583c3

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| refresh-after-source-edit | GitLab prevents applying the stale suggestion | parity |
| refresh-after-source-edit | Reviewer sees a refusal with no Applied badge | parity |
| refresh-after-source-edit | Feedback identifies the reviewed line as having changed | parity |
| refresh-after-source-edit | Newer source remains exact (after review) | parity |
| refresh-after-source-edit | No extra source commit (after review) | parity |
| refresh-after-source-edit | Posted review remains exact (after review) | parity |
| refresh-after-source-edit | Outdated review stays unapplied (after review) | parity |
| refresh-after-source-edit | Suggestion identity survives (after review) | parity |
| refresh-after-source-edit | Newer source remains exact (after reload) | parity |
| refresh-after-source-edit | No extra source commit (after reload) | parity |
| refresh-after-source-edit | Posted review remains exact (after reload) | parity |
| refresh-after-source-edit | Outdated review stays unapplied (after reload) | parity |
| refresh-after-source-edit | Suggestion identity survives (after reload) | parity |
| confirm-after-source-edit | GitLab prevents applying the stale suggestion | parity |
| confirm-after-source-edit | Reviewer sees a refusal with no Applied badge | parity |
| confirm-after-source-edit | Feedback identifies the reviewed line as having changed | shared-limitation |
| confirm-after-source-edit | Newer source remains exact (after review) | parity |
| confirm-after-source-edit | No extra source commit (after review) | parity |
| confirm-after-source-edit | Posted review remains exact (after review) | parity |
| confirm-after-source-edit | Outdated review stays unapplied (after review) | parity |
| confirm-after-source-edit | Suggestion identity survives (after review) | parity |
| confirm-after-source-edit | Newer source remains exact (after reload) | parity |
| confirm-after-source-edit | No extra source commit (after reload) | parity |
| confirm-after-source-edit | Posted review remains exact (after reload) | parity |
| confirm-after-source-edit | Outdated review stays unapplied (after reload) | parity |
| confirm-after-source-edit | Suggestion identity survives (after reload) | parity |
| refresh-after-target-deletion | GitLab prevents applying the stale suggestion | parity |
| refresh-after-target-deletion | Reviewer sees a refusal with no Applied badge | parity |
| refresh-after-target-deletion | Feedback identifies the reviewed line as having changed | parity |
| refresh-after-target-deletion | Newer source remains exact (after review) | parity |
| refresh-after-target-deletion | No extra source commit (after review) | parity |
| refresh-after-target-deletion | Posted review remains exact (after review) | parity |
| refresh-after-target-deletion | Outdated review stays unapplied (after review) | parity |
| refresh-after-target-deletion | Suggestion identity survives (after review) | parity |
| refresh-after-target-deletion | Newer source remains exact (after reload) | parity |
| refresh-after-target-deletion | No extra source commit (after reload) | parity |
| refresh-after-target-deletion | Posted review remains exact (after reload) | parity |
| refresh-after-target-deletion | Outdated review stays unapplied (after reload) | parity |
| refresh-after-target-deletion | Suggestion identity survives (after reload) | parity |
| live-after-deleting-one-of-two | GitLab prevents applying the stale suggestion | parity |
| live-after-deleting-one-of-two | Reviewer sees a refusal with no Applied badge | parity |
| live-after-deleting-one-of-two | Feedback identifies the reviewed line as having changed | shared-limitation |
| live-after-deleting-one-of-two | Newer source remains exact (after review) | parity |
| live-after-deleting-one-of-two | No extra source commit (after review) | parity |
| live-after-deleting-one-of-two | Posted review remains exact (after review) | parity |
| live-after-deleting-one-of-two | Outdated review stays unapplied (after review) | parity |
| live-after-deleting-one-of-two | Suggestion identity survives (after review) | parity |
| live-after-deleting-one-of-two | Newer source remains exact (after reload) | parity |
| live-after-deleting-one-of-two | No extra source commit (after reload) | parity |
| live-after-deleting-one-of-two | Posted review remains exact (after reload) | parity |
| live-after-deleting-one-of-two | Outdated review stays unapplied (after reload) | parity |
| live-after-deleting-one-of-two | Suggestion identity survives (after reload) | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Apply after the source commit

| Workflow | Stock GitLab | Fountain |
| --- | --- | --- |
| refresh-after-source-edit | Apply submitted (HTTP 400) | Apply submitted (HTTP 400) |
| confirm-after-source-edit | Apply submitted (HTTP 400) | Apply submitted (HTTP 400) |
| refresh-after-target-deletion | Apply disabled; GitLab marked the same suggestion inapplicable | Apply disabled; GitLab marked the same suggestion inapplicable |
| live-after-deleting-one-of-two | Apply submitted (HTTP 400) | Apply submitted (HTTP 400) |
