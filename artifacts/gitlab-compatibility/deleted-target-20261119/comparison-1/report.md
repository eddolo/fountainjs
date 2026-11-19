# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 80ae30149c8fed68f6f89802cd8f2e22e53ddbd0 · runtime 755d58d35b0ac7e3a6c56286a8089261b3334662e96357925ca1dba0cd2c78f5 · integration 0b53fdc6fd29fdf59cf5052af158e91e563f4ffbc5916ca9f80ed856b60cee5e

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| refresh-after-source-edit | GitLab refuses the stale submission | parity |
| refresh-after-source-edit | Alert identifies the reviewed line as having changed | parity |
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
| confirm-after-source-edit | GitLab refuses the stale submission | parity |
| confirm-after-source-edit | Alert identifies the reviewed line as having changed | shared-limitation |
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
| refresh-after-target-deletion | GitLab refuses the stale submission | missing-evidence |
| refresh-after-target-deletion | Alert identifies the reviewed line as having changed | missing-evidence |
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
| live-after-deleting-one-of-two | GitLab refuses the stale submission | parity |
| live-after-deleting-one-of-two | Alert identifies the reviewed line as having changed | shared-limitation |
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
