# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1f16e1b0abf20468b0d439ea65b0ddd6058240e5 · runtime 345d2f2c4233274201a0247f0fe09858bf6b74e365b1e1c2feae9d8e0986a03b · integration 62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| board-to-issue-and-back | The board shows one card for the new issue when its drawer is ready | parity |
| board-to-issue-and-back | Save is visible and unobstructed after editing at desktop width | parity |
| board-to-issue-and-back | Save is reachable and unobstructed at 390 CSS pixels | parity |
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

## Issue drawer layout

Distances are CSS pixels. Save position is measured from the top of the drawer. At narrow width the author scrolls Save into view.

| Editor | Viewport width | Drawer width | Editing area height | Save position | Save visible |
| --- | ---: | ---: | ---: | ---: | --- |
| original | 1280 | 823 | 140 | 453 | Yes |
| original | 390 | 388 | 140 | 474 | Yes |
| fountain | 1280 | 823 | 140 | 463 | Yes |
| fountain | 390 | 388 | 140 | 538 | Yes |
