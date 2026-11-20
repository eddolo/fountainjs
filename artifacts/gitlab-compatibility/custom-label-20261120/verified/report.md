# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ bd992c65f77cfd22156f7ec07b64fb5c4b25c8d9 · runtime 9a1be562dbf3ecf5c8380049f14ca64419769d8852ccb947222176987ab82044 · integration 680118786ad99a490122f41d9645bdafe8ebc37783734e28561b3ddaab1a8588

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| project-label | The editor displays the project label (native extension on Fountain) | parity |
| project-label | Undoing the prose edit retains the label | parity |
| project-label | Redoing the edit retains the label | parity |
| project-label | The GitLab API stores the exact prose and label reference | parity |
| project-label | The saved reader still links to the same GitLab label | parity |
| project-label | The verified rich editor reopens the label in its configured representation | parity |
| project-label | Switching the reopened editor to Markdown retains the complete edited issue | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
