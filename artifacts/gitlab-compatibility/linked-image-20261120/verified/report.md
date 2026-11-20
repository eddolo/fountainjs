# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ be866ad50288dc68c2dc8fa45cc376d118d1cecc · runtime 8d39edfeb8c1c72b750515ce1eabef484d64e07dce9d14bbe7c910f6342130c0 · integration c2c4cdefc4a06fea4787a4c244159e787e546a4d8c0e94f962ba37ce012f4bfe

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| linked-figure | GitLab supplies a source position and omits the image canonical attribute | parity |
| linked-figure | The properties form identifies the image asset | parity |
| linked-figure | Changing the description keeps the displayed image address | parity |
| linked-figure | Undo restores the initial description and image address | parity |
| linked-figure | Redo restores the edited description and image address | parity |
| linked-figure | The issue API preserves the image source, separate link target and surrounding prose | parity |
| linked-figure | The saved reader loads the image with its edited description and original enclosing link | parity |
| linked-figure | The verified rich editor reopens the edited image with its source | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
