# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 7beb38a9871875f1acaeed346e4f9e76e4c7dcaf56fab3d6b81ef81db2be6cee

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| description-and-comment | Same saved description and bold comment in the API and a fresh browser after GitLab restarts | parity |
| description-and-comment | Bold applies to the comment | parity |
| description-and-comment | Description stays plain | parity |
| description-and-comment | Undo clears the comment text | parity |
| description-and-comment | Comment undo preserves the description draft | parity |
| description-and-comment | Redo restores the comment text | parity |
| description-and-comment | Undo in the description restores its original paragraph | parity |
| description-and-comment | The formatted comment survives description undo | parity |
| description-and-comment | Redo restores the description edit | parity |
| description-and-comment | The description toolbar italicizes its selection | parity |
| description-and-comment | The description toolbar leaves the comment bold and upright | parity |
| description-and-comment | Undo removes just the description formatting | parity |
| description-and-comment | Source mode shows the edited description | parity |
| description-and-comment | The comment editor stays open in rich mode | parity |
| description-and-comment | Switching description modes preserves the comment draft | parity |
| description-and-comment | Both drafts stay local before saving | parity |
| description-and-comment | Only the submitted record reaches GitLab | parity |
| description-and-comment | The other editor retains its draft | parity |
| description-and-comment | Posting clears the comment composer | parity |
| description-and-comment | GitLab stores both records independently | parity |
| description-and-comment | Reload shows the saved description | parity |
| description-and-comment | Reload shows the bold comment | parity |
| description-and-comment | The completed workflow raises no browser exceptions | parity |
| description-before-comment | Same saved description and bold comment in the API and a fresh browser after GitLab restarts | parity |
| description-before-comment | Bold applies to the comment | parity |
| description-before-comment | Description stays plain | parity |
| description-before-comment | Undo clears the comment text | parity |
| description-before-comment | Comment undo preserves the description draft | parity |
| description-before-comment | Redo restores the comment text | parity |
| description-before-comment | Undo in the description restores its original paragraph | parity |
| description-before-comment | The formatted comment survives description undo | parity |
| description-before-comment | Redo restores the description edit | parity |
| description-before-comment | The description toolbar italicizes its selection | parity |
| description-before-comment | The description toolbar leaves the comment bold and upright | parity |
| description-before-comment | Undo removes just the description formatting | parity |
| description-before-comment | Source mode shows the edited description | parity |
| description-before-comment | The comment editor stays open in rich mode | parity |
| description-before-comment | Switching description modes preserves the comment draft | parity |
| description-before-comment | Both drafts stay local before saving | parity |
| description-before-comment | Only the submitted record reaches GitLab | parity |
| description-before-comment | The other editor retains its draft | parity |
| description-before-comment | Posting clears the comment composer | parity |
| description-before-comment | GitLab stores both records independently | parity |
| description-before-comment | Reload shows the saved description | parity |
| description-before-comment | Reload shows the bold comment | parity |
| description-before-comment | The completed workflow raises no browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## GitLab service restart

| Editor | Container | Started before (UTC) | Started after (UTC) | Issues read after restart |
| --- | --- | --- | --- | --- |
| original | 7b75dcae8baa | 2026-11-19T16:45:38.727023521Z | 2026-11-19T16:47:46.49206055Z | #564, #565 |
| fountain | a1a3efc9ec4b | 2026-11-19T16:40:17.378723358Z | 2026-11-19T16:42:46.103633168Z | #562, #563 |

The restart checks compare each saved description and formatted comment in the API and a fresh browser session. The input reports contain the volume records and the browser build identity after restart.
