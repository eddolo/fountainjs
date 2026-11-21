# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1f16e1b0abf20468b0d439ea65b0ddd6058240e5 · runtime 345d2f2c4233274201a0247f0fe09858bf6b74e365b1e1c2feae9d8e0986a03b · integration 62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| outline | GitLab returned a generated outline to the editor on initial load and reopen | parity |
| outline | The rich outline contains the original heading | parity |
| outline | The rich outline reflects the heading edit | parity |
| outline | The saved issue retains an active contents directive | parity |
| outline | The saved directive retains the author’s spelling | improvement |
| outline | The reloaded reader links to both headings | parity |
| outline | The rich editor reopens with the updated outline | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
