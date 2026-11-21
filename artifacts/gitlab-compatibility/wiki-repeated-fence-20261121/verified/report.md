# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 45bc84fb81c2e21a46cd3cc3d722457b9b38f26c · runtime 16cf0fdf221a38633e92a9b0d3f49d64f2d105c1f8a3c8be1b13231e0933e2f2 · integration 7517edf9aacef8b793a36b25c62d8c6d5d1ebc192cefcee1721a89d8abf48644

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

Wiki controller on stock / replacement: source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af` / source-preserving patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af`.

| Case | Invariant | Classification |
| --- | --- | --- |
| wiki-repeated-fence-parameters | The joining author receives the first author’s unsaved draft | parity |
| wiki-repeated-fence-parameters | The first editor identifies the second author after both move their cursors | parity |
| wiki-repeated-fence-parameters | The second editor identifies the first author after both move their cursors | parity |
| wiki-repeated-fence-parameters | Both rich editors render the other author’s named caret | parity |
| wiki-repeated-fence-parameters | Peer undo retains the first author’s edit | parity |
| wiki-repeated-fence-parameters | Peer redo restores the second edit on the first screen | parity |
| wiki-repeated-fence-parameters | The reopened reader exposes the second listing’s original parameter | parity |
| wiki-repeated-fence-parameters | The joining editor sees the indented code | parity |
| wiki-repeated-fence-parameters | Undo restores the original code on the other screen | parity |
| wiki-repeated-fence-parameters | Redo restores the code edit on the other screen | parity |
| wiki-repeated-fence-parameters | The GitLab reader displays the edited code with its indentation | parity |
| wiki-repeated-fence-parameters | The wiki API stores both edits, paragraphs and original formatting | improvement |
| wiki-repeated-fence-parameters | The wiki API also retains the original line endings | improvement |
| wiki-repeated-fence-parameters | Both edits survive in the other author’s reloaded reader | parity |
| wiki-repeated-fence-parameters | The reader retains the owner’s bold name | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
