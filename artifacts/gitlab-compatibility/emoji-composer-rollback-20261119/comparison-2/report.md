# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 2cb51f61e53a3da07746cc89f81f645c4f4679ff · runtime 18cb22b436e24cfeec24534d02439d8341d8bcbcdc7d0a8dee9ed3d60d386c3a · integration d2394d5a033f4f0c153cdb7b81ac204951f61a3002ce4df45556880315944071

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

Frontend rollback acceptance remains open. See the stock input report for the immediate rich-text Save and Markdown Save outcomes.

| Case | Invariant | Classification |
| --- | --- | --- |
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

## Saved issues after frontend rollback

| Authored in | Issue | Final key to click | Immediate rich-text Save | Reviewed Markdown Save and retained comment |
| --- | --- | ---: | --- | --- |
| fountain | #542 | 5.0 ms | Lost edit | Passed |
| original | #544 | 5.5 ms | Lost edit | Passed |
| fountain | #543 | 4.8 ms | Lost edit | Passed |
| original | #545 | 3.7 ms | Lost edit | Passed |
