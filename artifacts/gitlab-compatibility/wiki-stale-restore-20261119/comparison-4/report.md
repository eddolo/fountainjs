# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 0f3db5f6bfe550275fd0ff440c78d47d5cbab7eb · runtime 167d91c06ce5931c9ad48dd4f7c4eb17db062cf82293f496dad850e7d047bf8e · integration 3102f5bd338dc814d48579f5dfec64910acc2b5306cf225f92bfdbe74e00bd64

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| stale-restore | The first tab opens Restore with the v2 revision | parity |
| stale-restore | The first edit is stored as v2 | parity |
| stale-restore | The second tab sees its own saved change | parity |
| stale-restore | The second tab saves the expected source | parity |
| stale-restore | The author sees the concurrent edit notice after confirming the stale restore | parity |
| stale-restore | The warning renders its full message without translation placeholders | parity |
| stale-restore | The warning opens the current wiki page | parity |
| stale-restore | Following the warning shows the competing writer’s saved paragraph | parity |
| stale-restore | The stale restore leaves the newer source intact | parity |
| stale-restore | The current page shows the newer edit before retry | parity |
| stale-restore | The rejected restore adds no revision and earlier entries retain their IDs and messages | parity |
| stale-restore | A fresh Restore uses the competing writer’s current revision | parity |
| stale-restore | Explicit retry restores the v1 source byte for byte | parity |
| stale-restore | The restored page shows the original paragraph | parity |
| stale-restore | Explicit retry adds one v4 and retains the preceding three entries | parity |
| stale-restore | Each history row points to its own retrieved revision | parity |
| stale-restore | All four historical revision sources remain retrievable | parity |
| stale-restore | Neither author tab reports browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

Both deployments used wiki controller patch `1851b9617c70382cb4d61567a02b7b64a62462a4d0385b6a6b69b857815a9baa`.

## Wiki restore history

| Editor | Revision | Git commit | Commit message |
| --- | --- | --- | --- |
| original | v4 | `0607ab7dfcb59257f54a0bb6a5cc18b564597a80` | Restore original handoff after checking latest draft |
| original | v3 | `2614bebd26078b35cf928d4e765585c106534e7b` | Record Monday approval |
| original | v2 | `d178c7ec4658cbfac6f76cbdae61cb0c340abf49` | Verify deployment checklist |
| original | v1 | `490666529630a17a3b7af758cebe18d972f5cdfd` | root created page: Operations handoff-original-wiki-stale-restore-20261119-a4 |
| fountain | v4 | `834cc8907a89c555db09cf09c2dfec672aad9747` | Restore original handoff after checking latest draft |
| fountain | v3 | `bd9592ad20875bdfeef676c80e380531a4020a4d` | Record Monday approval |
| fountain | v2 | `ddd6e38469b32c016d712ee8c64566ac2d7f2d8f` | Verify deployment checklist |
| fountain | v1 | `8cc529bad673608cdcd35cca4192c6f3e5a84eaf` | root created page: Operations handoff-fountain-wiki-stale-restore-20261119-a4 |
