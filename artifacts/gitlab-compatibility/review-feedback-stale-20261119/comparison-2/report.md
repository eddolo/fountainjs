# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — Unverified (missing expected or observed build)

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: false. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| refresh-after-source-edit | GitLab prevents applying the stale suggestion | missing-evidence |
| refresh-after-source-edit | Reviewer sees a refusal with no Applied badge | missing-evidence |
| refresh-after-source-edit | Feedback identifies the reviewed line as having changed | missing-evidence |
| refresh-after-source-edit | Newer source remains exact (after review) | missing-evidence |
| refresh-after-source-edit | No extra source commit (after review) | missing-evidence |
| refresh-after-source-edit | Posted review remains exact (after review) | missing-evidence |
| refresh-after-source-edit | Outdated review stays unapplied (after review) | missing-evidence |
| refresh-after-source-edit | Suggestion identity survives (after review) | missing-evidence |
| refresh-after-source-edit | Newer source remains exact (after reload) | missing-evidence |
| refresh-after-source-edit | No extra source commit (after reload) | missing-evidence |
| refresh-after-source-edit | Posted review remains exact (after reload) | missing-evidence |
| refresh-after-source-edit | Outdated review stays unapplied (after reload) | missing-evidence |
| refresh-after-source-edit | Suggestion identity survives (after reload) | missing-evidence |
| confirm-after-source-edit | GitLab prevents applying the stale suggestion | missing-evidence |
| confirm-after-source-edit | Reviewer sees a refusal with no Applied badge | missing-evidence |
| confirm-after-source-edit | Feedback identifies the reviewed line as having changed | missing-evidence |
| confirm-after-source-edit | Newer source remains exact (after review) | missing-evidence |
| confirm-after-source-edit | No extra source commit (after review) | missing-evidence |
| confirm-after-source-edit | Posted review remains exact (after review) | missing-evidence |
| confirm-after-source-edit | Outdated review stays unapplied (after review) | missing-evidence |
| confirm-after-source-edit | Suggestion identity survives (after review) | missing-evidence |
| confirm-after-source-edit | Newer source remains exact (after reload) | missing-evidence |
| confirm-after-source-edit | No extra source commit (after reload) | missing-evidence |
| confirm-after-source-edit | Posted review remains exact (after reload) | missing-evidence |
| confirm-after-source-edit | Outdated review stays unapplied (after reload) | missing-evidence |
| confirm-after-source-edit | Suggestion identity survives (after reload) | missing-evidence |
| refresh-after-target-deletion | GitLab prevents applying the stale suggestion | missing-evidence |
| refresh-after-target-deletion | Reviewer sees a refusal with no Applied badge | missing-evidence |
| refresh-after-target-deletion | Feedback identifies the reviewed line as having changed | missing-evidence |
| refresh-after-target-deletion | Newer source remains exact (after review) | missing-evidence |
| refresh-after-target-deletion | No extra source commit (after review) | missing-evidence |
| refresh-after-target-deletion | Posted review remains exact (after review) | missing-evidence |
| refresh-after-target-deletion | Outdated review stays unapplied (after review) | missing-evidence |
| refresh-after-target-deletion | Suggestion identity survives (after review) | missing-evidence |
| refresh-after-target-deletion | Newer source remains exact (after reload) | missing-evidence |
| refresh-after-target-deletion | No extra source commit (after reload) | missing-evidence |
| refresh-after-target-deletion | Posted review remains exact (after reload) | missing-evidence |
| refresh-after-target-deletion | Outdated review stays unapplied (after reload) | missing-evidence |
| refresh-after-target-deletion | Suggestion identity survives (after reload) | missing-evidence |
| live-after-deleting-one-of-two | GitLab prevents applying the stale suggestion | missing-evidence |
| live-after-deleting-one-of-two | Reviewer sees a refusal with no Applied badge | missing-evidence |
| live-after-deleting-one-of-two | Feedback identifies the reviewed line as having changed | missing-evidence |
| live-after-deleting-one-of-two | Newer source remains exact (after review) | missing-evidence |
| live-after-deleting-one-of-two | No extra source commit (after review) | missing-evidence |
| live-after-deleting-one-of-two | Posted review remains exact (after review) | missing-evidence |
| live-after-deleting-one-of-two | Outdated review stays unapplied (after review) | missing-evidence |
| live-after-deleting-one-of-two | Suggestion identity survives (after review) | missing-evidence |
| live-after-deleting-one-of-two | Newer source remains exact (after reload) | missing-evidence |
| live-after-deleting-one-of-two | No extra source commit (after reload) | missing-evidence |
| live-after-deleting-one-of-two | Posted review remains exact (after reload) | missing-evidence |
| live-after-deleting-one-of-two | Outdated review stays unapplied (after reload) | missing-evidence |
| live-after-deleting-one-of-two | Suggestion identity survives (after reload) | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Apply after the source commit

| Workflow | Stock GitLab | Fountain |
| --- | --- | --- |
| refresh-after-source-edit | Unverified | Unverified |
| confirm-after-source-edit | Unverified | Unverified |
| refresh-after-target-deletion | Unverified | Unverified |
| live-after-deleting-one-of-two | Unverified | Unverified |
