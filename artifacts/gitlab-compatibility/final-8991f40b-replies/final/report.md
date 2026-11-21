# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1f16e1b0abf20468b0d439ea65b0ddd6058240e5 · runtime 345d2f2c4233274201a0247f0fe09858bf6b74e365b1e1c2feae9d8e0986a03b · integration 62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824

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
| two-personal-libraries | The second writer holds the Reporter role | parity |
| two-personal-libraries | GitLab attributes each posted Markdown reply to its author | parity |
| two-personal-libraries | Both sessions complete without browser exceptions | parity |
| two-personal-libraries | root sees only their own matching personal template | parity |
| two-personal-libraries | root sees both formatted comments after reload | parity |
| two-personal-libraries | fountain_compat_access sees only their own matching personal template | parity |
| two-personal-libraries | fountain_compat_access sees both formatted comments after reload | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
