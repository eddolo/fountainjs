# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 8fb3bd2cbb8e31c3c8c96d0cf2ef68128ab8ebd8 · runtime 167d91c06ce5931c9ad48dd4f7c4eb17db062cf82293f496dad850e7d047bf8e · integration 424effd7a3cccd97082fc2e4cbf28804c4168e8d036ef4a1ba4ad8ae74df23e6

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| reply-in-comment | Dismissing the picker keeps the draft | parity |
| reply-in-comment | The reply replaces just the selection with formatted content | parity |
| reply-in-comment | Keyboard focus returns to the receiving editor | improvement |
| reply-in-comment | One undo restores the original selection text | parity |
| reply-in-comment | Redo restores the formatted reply | parity |
| reply-in-comment | Insertion preserves the separate issue draft | parity |
| reply-in-comment | Posting preserves the separate issue draft | parity |
| reply-in-comment | Posting leaves the stored issue unchanged | parity |
| reply-in-comment | GitLab stores the selected reply as Markdown | parity |
| reply-in-comment | Reload renders the saved note with emphasis | parity |
| reply-in-comment | The browser completes the workflow without exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
