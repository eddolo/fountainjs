# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 45bc84fb81c2e21a46cd3cc3d722457b9b38f26c · runtime 16cf0fdf221a38633e92a9b0d3f49d64f2d105c1f8a3c8be1b13231e0933e2f2 · integration 7517edf9aacef8b793a36b25c62d8c6d5d1ebc192cefcee1721a89d8abf48644

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| wiki-restore-role-change | The Developer edits the wiki and saves the exact Markdown | parity |
| wiki-restore-role-change | The Reporter can still read the selected revision | parity |
| wiki-restore-role-change | A freshly opened historical page hides Restore from the Reporter | parity |
| wiki-restore-role-change | The already-open confirmation withdraws Restore after the role changes | shared-limitation |
| wiki-restore-role-change | The pending confirmation retains its typed commit message | parity |
| wiki-restore-role-change | Cancelling the confirmation sends no restore submission | parity |
| wiki-restore-role-change | Cancelling as Reporter preserves the saved Markdown | parity |
| wiki-restore-role-change | The role change and Cancel leave the same two revision IDs and credits | parity |
| wiki-restore-role-change | After Developer access returns one explicit restore is submitted | parity |
| wiki-restore-role-change | History credits one new restore to the Developer and retains both previous revisions | parity |
| wiki-restore-role-change | All three revisions reopen with their original Markdown and distinct IDs | parity |
| wiki-restore-role-change | The final reader shows the restored paragraph | parity |
| wiki-restore-role-change | The author and reader encounter no browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
