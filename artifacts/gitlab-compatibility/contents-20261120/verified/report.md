# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1d252c22c7ea8594fb8ab5f93bfc9cfc1b13a17f · runtime 3ab32bb29e3945dbabe082c3e1c91a987d6b5c05434b7db3036df2283557a1f4 · integration 7335ead958c9c3015a654a6179d7a1731b457b07ad93080de728fdfc519c45db

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| outline | The rich outline contains the original heading | parity |
| outline | The rich outline reflects the heading edit | parity |
| outline | The saved issue retains an active contents directive | parity |
| outline | The saved directive retains the author’s spelling | improvement |
| outline | The reloaded reader links to both headings | parity |
| outline | The rich editor reopens with the updated outline | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
