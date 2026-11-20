# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 0f3db5f6bfe550275fd0ff440c78d47d5cbab7eb · runtime 167d91c06ce5931c9ad48dd4f7c4eb17db062cf82293f496dad850e7d047bf8e · integration 3102f5bd338dc814d48579f5dfec64910acc2b5306cf225f92bfdbe74e00bd64

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| default-history | The project used the requested rename-history setting and recovered its prior configuration | parity |
| default-history | Saving the new path opens the renamed wiki page | parity |
| default-history | The source before the move contains only the intended edit | parity |
| default-history | Renaming the path keeps the saved Markdown byte for byte | parity |
| default-history | The original page bookmark redirects to the new path | parity |
| default-history | The original bookmark shows the latest edited content | parity |
| default-history | The bookmarked historical version still shows the original paragraph | parity |
| default-history | The original revision is retrievable by its path and commit ID | parity |
| default-history | History after the rename retains both earlier revision IDs and messages | shared-limitation |
| default-history | The original revision is selectable through the renamed page’s history | shared-limitation |
| default-history | The original revision selected at the new path shows the original content | shared-limitation |
| default-history | Restoring at the new path retains the selected original bytes and reader content | shared-limitation |
| default-history | Restore adds one entry and retains all three earlier history rows | shared-limitation |
| default-history | All four revision IDs retrieve the exact contents at the corresponding historical paths | shared-limitation |
| default-history | The browser reports no wiki exceptions | parity |
| project-history | The project used the requested rename-history setting and recovered its prior configuration | parity |
| project-history | Saving the new path opens the renamed wiki page | parity |
| project-history | The source before the move contains only the intended edit | parity |
| project-history | Renaming the path keeps the saved Markdown byte for byte | parity |
| project-history | The original page bookmark redirects to the new path | parity |
| project-history | The original bookmark shows the latest edited content | parity |
| project-history | The bookmarked historical version still shows the original paragraph | parity |
| project-history | The original revision is retrievable by its path and commit ID | parity |
| project-history | History after the rename retains both earlier revision IDs and messages | parity |
| project-history | The original revision is selectable through the renamed page’s history | parity |
| project-history | The original revision selected at the new path shows the original content | parity |
| project-history | Restoring at the new path retains the selected original bytes and reader content | parity |
| project-history | Restore adds one entry and retains all three earlier history rows | parity |
| project-history | All four revision IDs retrieve the exact contents at the corresponding historical paths | parity |
| project-history | The browser reports no wiki exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## History at the new page path

| Project setting | Editor | History after move | Original revision selectable | History after restore |
| --- | --- | --- | --- | --- |
| GitLab default | original | v1 (`59542d78c3eb`) | No | Restore unavailable from history |
| Follow renames | original | v3 (`801399f79f19`), v2 (`9abf22ac07b7`), v1 (`9cc27c23dca7`) | Yes | v4 (`e18f906883c1`), v3 (`801399f79f19`), v2 (`9abf22ac07b7`), v1 (`9cc27c23dca7`) |
| GitLab default | fountain | v1 (`b81f6e64e120`) | No | Restore unavailable from history |
| Follow renames | fountain | v3 (`7a4037e6e3a8`), v2 (`c800fa74d168`), v1 (`d372258e77c8`) | Yes | v4 (`4a2c4b85193f`), v3 (`7a4037e6e3a8`), v2 (`c800fa74d168`), v1 (`d372258e77c8`) |
