# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 4c32cdb279478e01d96a03f7b5493495d55c1835 · runtime 71c7b8c26fe6947bcc005a1e377f5a521220230265e2ae09da100353ad907cff · integration 1142403df5f94a924f07ef071d64e89c823b561c9e93f4a4fb236a6d1daa332b

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| merged-release-checklist | The issue API stores the three intended task markers and labels | parity |
| merged-release-checklist | Task states, cell spans, labels and paragraphs in before | parity |
| merged-release-checklist | Task states, cell spans, labels and paragraphs in edited | parity |
| merged-release-checklist | Task states, cell spans, labels and paragraphs in reader | parity |
| merged-release-checklist | Task states, cell spans, labels and paragraphs in reopened | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
