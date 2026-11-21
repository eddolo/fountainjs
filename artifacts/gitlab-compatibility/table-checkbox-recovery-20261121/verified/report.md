# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 5cb44f523751bbbb4a2535c6d216699387147224 · runtime 423a9c1dc84bc4daa5e3e84f124b92fb4ae9dff08ec9bc94638fe9174d83acee · integration c796a875e19c4162dfcde93e0359af7f2ca1bdce8dbcec08bfe5b2913f08b0d2

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| merge-release-gates | All three original checkbox states are editable in their own cells | parity |
| merge-release-gates | The merged draft retains both selected checkboxes and the neighboring pending task | parity |
| merge-release-gates | The saved issue retains the edit made before merging the cells | parity |
| merge-release-gates | The saved reader retains all three checkbox states in the intended layout | improvement |
| merge-release-gates | The rich editor reopens the merged table with all three checkbox states | improvement |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
