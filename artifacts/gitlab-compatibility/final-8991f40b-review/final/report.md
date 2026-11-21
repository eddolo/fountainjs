# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1f16e1b0abf20468b0d439ea65b0ddd6058240e5 · runtime 345d2f2c4233274201a0247f0fe09858bf6b74e365b1e1c2feae9d8e0986a03b · integration 62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| posted-range-review | Selected source characters | parity |
| posted-range-review | Source at first visible Markdown field | parity |
| posted-range-review | Source after declared observation window | parity |
| posted-range-review | Selected target offsets | parity |
| posted-range-review | Initial posted proposal retains original source | parity |
| posted-range-review | Initial posted proposal retains target offsets | parity |
| posted-range-review | Posted proposal reopens with exact source and range | parity |
| posted-range-review | Editing source retains the original target range | parity |
| posted-range-review | Changing the range retains edited source | parity |
| posted-range-review | Undoing range adjustment restores prior range and preserves edited source | parity |
| posted-range-review | Redoing range adjustment restores the selected range and edited source | parity |
| posted-range-review | Source-mode handoff retains reviewed source | parity |
| posted-range-review | Source-mode handoff retains reviewed offsets | parity |
| posted-range-review | Saving review changes only the intended source and range | parity |
| posted-range-review | Reloading reviewed rich proposal retains source | parity |
| posted-range-review | Reloading reviewed rich proposal retains offsets | parity |
| posted-range-review | Posted review does not write repository contents | parity |
| posted-range-review | Posted review does not create a source commit | parity |
| posted-range-review | Applying reviewed proposal changes exactly the reviewed target | parity |
| posted-range-review | Application creates one child of the seed commit | parity |
| posted-range-review | Reviewed application has Applied metadata immediately after commit | parity |
| posted-range-shrink | Selected source characters | parity |
| posted-range-shrink | Source at first visible Markdown field | parity |
| posted-range-shrink | Source after declared observation window | parity |
| posted-range-shrink | Selected target offsets | parity |
| posted-range-shrink | Initial posted proposal retains original source | parity |
| posted-range-shrink | Initial posted proposal retains target offsets | parity |
| posted-range-shrink | Posted proposal reopens with exact source and range | parity |
| posted-range-shrink | Editing source retains the original target range | parity |
| posted-range-shrink | Changing the range retains edited source | parity |
| posted-range-shrink | Undoing range adjustment restores prior range and preserves edited source | parity |
| posted-range-shrink | Redoing range adjustment restores the selected range and edited source | parity |
| posted-range-shrink | Source-mode handoff retains reviewed source | parity |
| posted-range-shrink | Source-mode handoff retains reviewed offsets | parity |
| posted-range-shrink | Saving review changes only the intended source and range | parity |
| posted-range-shrink | Reloading reviewed rich proposal retains source | parity |
| posted-range-shrink | Reloading reviewed rich proposal retains offsets | parity |
| posted-range-shrink | Posted review does not write repository contents | parity |
| posted-range-shrink | Posted review does not create a source commit | parity |
| posted-range-shrink | Applying reviewed proposal changes exactly the reviewed target | parity |
| posted-range-shrink | Application creates one child of the seed commit | parity |
| posted-range-shrink | Reviewed application has Applied metadata immediately after commit | parity |
| posted-range-asymmetric | Selected source characters | parity |
| posted-range-asymmetric | Source at first visible Markdown field | parity |
| posted-range-asymmetric | Source after declared observation window | parity |
| posted-range-asymmetric | Selected target offsets | parity |
| posted-range-asymmetric | Initial posted proposal retains original source | parity |
| posted-range-asymmetric | Initial posted proposal retains target offsets | parity |
| posted-range-asymmetric | Posted proposal reopens with exact source and range | parity |
| posted-range-asymmetric | Editing source retains the original target range | parity |
| posted-range-asymmetric | Changing the range retains edited source | parity |
| posted-range-asymmetric | Undoing range adjustment restores prior range and preserves edited source | parity |
| posted-range-asymmetric | Redoing range adjustment restores the selected range and edited source | parity |
| posted-range-asymmetric | Source-mode handoff retains reviewed source | parity |
| posted-range-asymmetric | Source-mode handoff retains reviewed offsets | parity |
| posted-range-asymmetric | Saving review changes only the intended source and range | parity |
| posted-range-asymmetric | Reloading reviewed rich proposal retains source | parity |
| posted-range-asymmetric | Reloading reviewed rich proposal retains offsets | parity |
| posted-range-asymmetric | Posted review does not write repository contents | parity |
| posted-range-asymmetric | Posted review does not create a source commit | parity |
| posted-range-asymmetric | Applying reviewed proposal changes exactly the reviewed target | parity |
| posted-range-asymmetric | Application creates one child of the seed commit | parity |
| posted-range-asymmetric | Reviewed application has Applied metadata immediately after commit | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
