# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 8fb3bd2cbb8e31c3c8c96d0cf2ef68128ab8ebd8 · runtime 167d91c06ce5931c9ad48dd4f7c4eb17db062cf82293f496dad850e7d047bf8e · integration 424effd7a3cccd97082fc2e4cbf28804c4168e8d036ef4a1ba4ad8ae74df23e6

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| board-to-issue-and-back | Creating a board card creates the intended open GitLab issue | parity |
| board-to-issue-and-back | The opened drawer links to the new issue number in the same project | parity |
| board-to-issue-and-back | The drawer reader shows the saved description and bold text | parity |
| board-to-issue-and-back | The issue API retains the Markdown written in the drawer | parity |
| board-to-issue-and-back | Following the drawer link shows the same formatted description | parity |
| board-to-issue-and-back | The full-page discussion saves one formatted note on the board issue | parity |
| board-to-issue-and-back | Reloading the board returns the same issue card | parity |
| board-to-issue-and-back | Reopening the card preserves the description and its mark | parity |
| board-to-issue-and-back | The reopened drawer displays the full-page comment and its mark | parity |
| board-to-issue-and-back | Board and full-page navigation finish without browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
