# Matched GitLab editor comparison

**Original** — Unverified (missing expected or observed build)

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 7beb38a9871875f1acaeed346e4f9e76e4c7dcaf56fab3d6b81ef81db2be6cee

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: false. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| description-and-comment | Same saved description and bold comment in the API and a fresh browser after GitLab restarts | missing-evidence |
| description-and-comment | Bold applies to the comment | missing-evidence |
| description-and-comment | Description stays plain | missing-evidence |
| description-and-comment | Undo clears the comment text | missing-evidence |
| description-and-comment | Comment undo preserves the description draft | missing-evidence |
| description-and-comment | Redo restores the comment text | missing-evidence |
| description-and-comment | Undo in the description restores its original paragraph | missing-evidence |
| description-and-comment | The formatted comment survives description undo | missing-evidence |
| description-and-comment | Redo restores the description edit | missing-evidence |
| description-and-comment | The description toolbar italicizes its selection | missing-evidence |
| description-and-comment | The description toolbar leaves the comment bold and upright | missing-evidence |
| description-and-comment | Undo removes just the description formatting | missing-evidence |
| description-and-comment | Source mode shows the edited description | missing-evidence |
| description-and-comment | The comment editor stays open in rich mode | missing-evidence |
| description-and-comment | Switching description modes preserves the comment draft | missing-evidence |
| description-and-comment | Both drafts stay local before saving | missing-evidence |
| description-and-comment | Only the submitted record reaches GitLab | missing-evidence |
| description-and-comment | The other editor retains its draft | missing-evidence |
| description-and-comment | Posting clears the comment composer | missing-evidence |
| description-and-comment | GitLab stores both records independently | missing-evidence |
| description-and-comment | Reload shows the saved description | missing-evidence |
| description-and-comment | Reload shows the bold comment | missing-evidence |
| description-and-comment | The completed workflow raises no browser exceptions | missing-evidence |
| description-before-comment | Same saved description and bold comment in the API and a fresh browser after GitLab restarts | missing-evidence |
| description-before-comment | Bold applies to the comment | missing-evidence |
| description-before-comment | Description stays plain | missing-evidence |
| description-before-comment | Undo clears the comment text | missing-evidence |
| description-before-comment | Comment undo preserves the description draft | missing-evidence |
| description-before-comment | Redo restores the comment text | missing-evidence |
| description-before-comment | Undo in the description restores its original paragraph | missing-evidence |
| description-before-comment | The formatted comment survives description undo | missing-evidence |
| description-before-comment | Redo restores the description edit | missing-evidence |
| description-before-comment | The description toolbar italicizes its selection | missing-evidence |
| description-before-comment | The description toolbar leaves the comment bold and upright | missing-evidence |
| description-before-comment | Undo removes just the description formatting | missing-evidence |
| description-before-comment | Source mode shows the edited description | missing-evidence |
| description-before-comment | The comment editor stays open in rich mode | missing-evidence |
| description-before-comment | Switching description modes preserves the comment draft | missing-evidence |
| description-before-comment | Both drafts stay local before saving | missing-evidence |
| description-before-comment | Only the submitted record reaches GitLab | missing-evidence |
| description-before-comment | The other editor retains its draft | missing-evidence |
| description-before-comment | Posting clears the comment composer | missing-evidence |
| description-before-comment | GitLab stores both records independently | missing-evidence |
| description-before-comment | Reload shows the saved description | missing-evidence |
| description-before-comment | Reload shows the bold comment | missing-evidence |
| description-before-comment | The completed workflow raises no browser exceptions | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## GitLab service restart

| Editor | Container | Started before (UTC) | Started after (UTC) | Issues read after restart |
| --- | --- | --- | --- | --- |
| original | Unverified | Unverified | Unverified | Unverified |
| fountain | a1a3efc9ec4b | 2026-11-19T16:40:17.378723358Z | 2026-11-19T16:42:46.103633168Z | #562, #563 |

The restart checks compare each saved description and formatted comment in the API and a fresh browser session. The input reports contain the volume records and the browser build identity after restart.
