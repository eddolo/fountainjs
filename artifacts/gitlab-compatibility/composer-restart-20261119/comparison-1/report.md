# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7c85ae01fca1d715da1bc8fca7356057a0b2feb9 · runtime 56c83cc9e181a0a958cf32e86cec3980fa5ca5f59b62d374e0a2a7a60f93a379 · integration 7beb38a9871875f1acaeed346e4f9e76e4c7dcaf56fab3d6b81ef81db2be6cee

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: false. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| description-and-comment | Same saved description and bold comment in the API and a fresh browser after GitLab restarts | missing-evidence |
| description-and-comment | Bold applies to the comment | unmatched-environment |
| description-and-comment | Description stays plain | unmatched-environment |
| description-and-comment | Undo clears the comment text | unmatched-environment |
| description-and-comment | Comment undo preserves the description draft | unmatched-environment |
| description-and-comment | Redo restores the comment text | unmatched-environment |
| description-and-comment | Undo in the description restores its original paragraph | unmatched-environment |
| description-and-comment | The formatted comment survives description undo | unmatched-environment |
| description-and-comment | Redo restores the description edit | unmatched-environment |
| description-and-comment | The description toolbar italicizes its selection | unmatched-environment |
| description-and-comment | The description toolbar leaves the comment bold and upright | unmatched-environment |
| description-and-comment | Undo removes just the description formatting | unmatched-environment |
| description-and-comment | Source mode shows the edited description | unmatched-environment |
| description-and-comment | The comment editor stays open in rich mode | unmatched-environment |
| description-and-comment | Switching description modes preserves the comment draft | unmatched-environment |
| description-and-comment | Both drafts stay local before saving | unmatched-environment |
| description-and-comment | Only the submitted record reaches GitLab | unmatched-environment |
| description-and-comment | The other editor retains its draft | unmatched-environment |
| description-and-comment | Posting clears the comment composer | unmatched-environment |
| description-and-comment | GitLab stores both records independently | unmatched-environment |
| description-and-comment | Reload shows the saved description | unmatched-environment |
| description-and-comment | Reload shows the bold comment | unmatched-environment |
| description-and-comment | The completed workflow raises no browser exceptions | unmatched-environment |
| description-before-comment | Same saved description and bold comment in the API and a fresh browser after GitLab restarts | missing-evidence |
| description-before-comment | Bold applies to the comment | unmatched-environment |
| description-before-comment | Description stays plain | unmatched-environment |
| description-before-comment | Undo clears the comment text | unmatched-environment |
| description-before-comment | Comment undo preserves the description draft | unmatched-environment |
| description-before-comment | Redo restores the comment text | unmatched-environment |
| description-before-comment | Undo in the description restores its original paragraph | unmatched-environment |
| description-before-comment | The formatted comment survives description undo | unmatched-environment |
| description-before-comment | Redo restores the description edit | unmatched-environment |
| description-before-comment | The description toolbar italicizes its selection | unmatched-environment |
| description-before-comment | The description toolbar leaves the comment bold and upright | unmatched-environment |
| description-before-comment | Undo removes just the description formatting | unmatched-environment |
| description-before-comment | Source mode shows the edited description | unmatched-environment |
| description-before-comment | The comment editor stays open in rich mode | unmatched-environment |
| description-before-comment | Switching description modes preserves the comment draft | unmatched-environment |
| description-before-comment | Both drafts stay local before saving | unmatched-environment |
| description-before-comment | Only the submitted record reaches GitLab | unmatched-environment |
| description-before-comment | The other editor retains its draft | unmatched-environment |
| description-before-comment | Posting clears the comment composer | unmatched-environment |
| description-before-comment | GitLab stores both records independently | unmatched-environment |
| description-before-comment | Reload shows the saved description | unmatched-environment |
| description-before-comment | Reload shows the bold comment | unmatched-environment |
| description-before-comment | The completed workflow raises no browser exceptions | unmatched-environment |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
