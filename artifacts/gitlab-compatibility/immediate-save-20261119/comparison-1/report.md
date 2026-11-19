# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 711ee7f2955eecb24af6e6c0384686bf42305a3c · runtime 52e5e274514b0d268c1c2a43c8219b412d757c0dbf0de7005ef4d363c01692b2 · integration 5f383fa6ea22fcbcf7484be3358d328967fefa3080d2e02c038101208c77b6d3

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| append-immediately | Saved Markdown immediately after submit | improvement |
| append-immediately | Saved Markdown after reload | improvement |
| append-immediately | Text shown in the reloaded issue | improvement |
| append-immediately | Paragraphs in the reopened editor | improvement |
| append-immediately | Browser exceptions | parity |
| delete-immediately | Saved Markdown immediately after submit | improvement |
| delete-immediately | Saved Markdown after reload | improvement |
| delete-immediately | Text shown in the reloaded issue | improvement |
| delete-immediately | Paragraphs in the reopened editor | improvement |
| delete-immediately | Browser exceptions | parity |
| append-after-review | Saved Markdown immediately after submit | parity |
| append-after-review | Saved Markdown after reload | parity |
| append-after-review | Text shown in the reloaded issue | parity |
| append-after-review | Paragraphs in the reopened editor | parity |
| append-after-review | Browser exceptions | parity |
| delete-after-review | Saved Markdown immediately after submit | parity |
| delete-after-review | Saved Markdown after reload | parity |
| delete-after-review | Text shown in the reloaded issue | parity |
| delete-after-review | Paragraphs in the reopened editor | parity |
| delete-after-review | Browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Final key to Save click

| Workflow | Stock GitLab | Fountain | Persisted Markdown after reload |
| --- | ---: | ---: | --- |
| append-immediately | 55.8 ms | 50.3 ms | improvement |
| delete-immediately | 48.6 ms | 55.6 ms | improvement |
| append-after-review | 560.0 ms | 561.5 ms | parity |
| delete-after-review | 566.4 ms | 552.4 ms | parity |

Immediate clicks must arrive within 100 ms of the final keydown. The review controls wait at least 500 ms. Both sides must show the intended paragraph at click time.
