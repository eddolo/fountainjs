# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 80ae30149c8fed68f6f89802cd8f2e22e53ddbd0 · runtime 755d58d35b0ac7e3a6c56286a8089261b3334662e96357925ca1dba0cd2c78f5 · integration 0b53fdc6fd29fdf59cf5052af158e91e563f4ffbc5916ca9f80ed856b60cee5e

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| refresh-after-insertion | Apply succeeds on the relocated target | parity |
| refresh-after-insertion | Branch commit survives reload | parity |
| refresh-after-insertion | Exact whole file, including the relocated line (after Apply) | parity |
| refresh-after-insertion | Branch and file commit match the observed decision (after Apply) | parity |
| refresh-after-insertion | Original note and suggestion identity retain the correct Applied state (after Apply) | parity |
| refresh-after-insertion | Exact whole file, including the relocated line (after reload) | parity |
| refresh-after-insertion | Branch and file commit match the observed decision (after reload) | parity |
| refresh-after-insertion | Original note and suggestion identity retain the correct Applied state (after reload) | parity |
| live-after-moving-target | Apply succeeds on the relocated target | shared-limitation |
| live-after-moving-target | Branch commit survives reload | parity |
| live-after-moving-target | Exact whole file, including the relocated line (after Apply) | parity |
| live-after-moving-target | Branch and file commit match the observed decision (after Apply) | parity |
| live-after-moving-target | Original note and suggestion identity retain the correct Applied state (after Apply) | parity |
| live-after-moving-target | Exact whole file, including the relocated line (after reload) | parity |
| live-after-moving-target | Branch and file commit match the observed decision (after reload) | parity |
| live-after-moving-target | Original note and suggestion identity retain the correct Applied state (after reload) | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Apply after the source commit

| Workflow | Stock GitLab | Fountain |
| --- | --- | --- |
| refresh-after-insertion | Apply submitted (HTTP 200) | Apply submitted (HTTP 200) |
| live-after-moving-target | Apply submitted (HTTP 400) | Apply submitted (HTTP 400) |
