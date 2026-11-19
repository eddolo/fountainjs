# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 73591945dd7543c420a8355582bca2708101c7172994caf7fa7dad5096cfe3ff

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

Collection attempts for this run: stock 1, replacement 1.

The restored packaged GitLab services reopened 4 notes from the repaired deployment. Their saved suggestion identities, Applied flags, eligibility, file bytes and branch heads matched.

| Case | Invariant | Classification |
| --- | --- | --- |
| applied-with-neighbors | Selected source characters | parity |
| applied-with-neighbors | Source at first visible Markdown field | parity |
| applied-with-neighbors | Source after declared observation window | parity |
| applied-with-neighbors | Selected target offsets | parity |
| applied-with-neighbors | Saved replacement source | parity |
| applied-with-neighbors | Saved target offsets | parity |
| applied-with-neighbors | Draft does not write repository contents | parity |
| applied-with-neighbors | Draft does not create a source commit | parity |
| applied-with-neighbors | Applied repository file contents | parity |
| applied-with-neighbors | Application creates one child of the seed commit | parity |
| applied-with-neighbors | Prose editing changes only the intended comment suffix | parity |
| applied-with-neighbors | Prose editing retains repository content and head | parity |
| applied-with-neighbors | Prose editing retains Applied flag | shared-limitation |
| applied-with-neighbors | Prose editing retains unchanged suggestion identity | shared-limitation |
| applied-with-neighbors | Reloaded prose edit displays the original Applied badge | shared-limitation |
| applied-with-neighbors | Adding a neighbor retains the applied record and gives the new proposal a fresh ID | shared-limitation |
| applied-with-neighbors | Swapping distinct proposals preserves both IDs, contents and Applied flags | shared-limitation |
| applied-with-neighbors | Ambiguous duplication is explained by the server and preserves the prior saved note | shared-limitation |
| applied-with-neighbors | Refused duplication leaves the submitted draft in the source field | shared-limitation |
| applied-with-neighbors | GitLab renders the reason for refusing the ambiguous duplicate | shared-limitation |
| applied-with-neighbors | The refusal reason is on screen without scrolling after Save | shared-limitation |
| applied-with-neighbors | Changed source gets a fresh unapplied ID while its neighbor keeps its identity | shared-limitation |
| applied-with-neighbors | Changed target range gets its own fresh identity and the correct two source lines | shared-limitation |
| applied-with-neighbors | No review-note edit changes the applied file or its commit | parity |
| applied-with-neighbors | Reload after replacing the applied proposal has no Applied badges | parity |
| outdated-neighbor | Selected source characters | parity |
| outdated-neighbor | Source at first visible Markdown field | parity |
| outdated-neighbor | Source after declared observation window | parity |
| outdated-neighbor | Selected target offsets | parity |
| outdated-neighbor | Saved replacement source | parity |
| outdated-neighbor | Saved target offsets | parity |
| outdated-neighbor | Draft does not write repository contents | parity |
| outdated-neighbor | Draft does not create a source commit | parity |
| outdated-neighbor | Applied repository file contents | parity |
| outdated-neighbor | Application creates one child of the seed commit | parity |
| outdated-neighbor | Prose editing changes only the intended comment suffix | parity |
| outdated-neighbor | Prose editing retains repository content and head | parity |
| outdated-neighbor | Prose editing retains Applied flag | shared-limitation |
| outdated-neighbor | Prose editing retains unchanged suggestion identity | shared-limitation |
| outdated-neighbor | Reloaded prose edit displays the original Applied badge | shared-limitation |
| outdated-neighbor | Adding a neighbor retains the applied record and gives the new proposal a fresh ID | shared-limitation |
| outdated-neighbor | Prose editing retains the original IDs and stored contents of both the applied and outdated proposals | shared-limitation |
| outdated-neighbor | The outdated pending proposal remains ineligible after the prose edit | parity |
| outdated-neighbor | The saved note changes only by the intended prose suffix | parity |
| outdated-neighbor | The competing commit and file remain exact after the subsequent note edit | parity |
| outdated-neighbor | The applied proposal still has its badge after the stale review reloads | shared-limitation |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
