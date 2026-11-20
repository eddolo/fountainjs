# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 29415c5e03f5c126158df9ef2d4e14c0c6bdb934 · runtime 5f832988c0aaad7ed503137d467d753f8238b0712bb9c16f5abbca2ac53880ab · integration d4defd1b4c6a4cb9ca2631e95c1bf5105133d9be333d66aca25f56d90a908579

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| project-label | The editor displays the project label (native extension on Fountain) | parity |
| project-label | Undoing the prose edit retains the label | parity |
| project-label | Redoing the edit retains the label | parity |
| project-label | The GitLab API stores the exact edited issue Markdown | parity |
| project-label | The saved reader still links to the same GitLab label | parity |
| project-label | The verified rich editor reopens the label in its configured representation | parity |
| project-label | Switching the reopened editor to Markdown retains the complete edited issue | parity |
| project-label | Undo restores the original key inside the keyboard mark | parity |
| project-label | Redo restores the updated key inside the keyboard mark | parity |
| project-label | GitLab renders the saved key as keyboard text | parity |
| project-label | The rich editor reopens the key with the configured keyboard mark | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
