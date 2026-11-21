# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 69bd996de9c4fc02df1e001b058faf8fa3425c7f · runtime 2013da8ddca588075020322e2cd8ed0ca1dba561f2e132a52e82fb33f1857f59 · integration b60daf55cdfaef268951050b3d2c04398e32b91ce4850a5dcee1f9fcd348eb05

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
