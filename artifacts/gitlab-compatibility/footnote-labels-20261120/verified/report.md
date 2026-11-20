# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ c568c035b58b16386630cd5dc96fb57a0d3f0513 · runtime e67f686f32b0a8bbecab1a97abadaa1f55e1d8de927a05a109f2973be38f30d2 · integration 12442228f9d6f18d49d9bbbd9a7e8344a28ec700b6797e044ad583877f7524ef

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| reference-and-appendix | The issue starts with the exact source including eleven unused definitions | parity |
| reference-and-appendix | An author edits ordinary prose in the verified rich editor | parity |
| reference-and-appendix | Every saved footnote retains its label, order, body and emphasis | improvement |
| reference-and-appendix | Only the intended prose changes in the saved issue | improvement |
| reference-and-appendix | The reloaded GitLab reader displays the prose edit | parity |
| reference-and-appendix | The reader’s footnote link resolves to the intended definition | parity |
| reference-and-appendix | The reopened rich editor hands all twelve definitions back to source editing | improvement |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
