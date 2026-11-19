# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 80ae30149c8fed68f6f89802cd8f2e22e53ddbd0 · runtime 755d58d35b0ac7e3a6c56286a8089261b3334662e96357925ca1dba0cd2c78f5 · integration 0b53fdc6fd29fdf59cf5052af158e91e563f4ffbc5916ca9f80ed856b60cee5e

Browser on stock / replacement: webkit 26.5 (linux) / webkit 26.5 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| append-immediately | Saved Markdown immediately after submit | missing-evidence |
| append-immediately | Saved Markdown after reload | missing-evidence |
| append-immediately | Text shown in the reloaded issue | missing-evidence |
| append-immediately | Paragraphs in the reopened editor | missing-evidence |
| append-immediately | Browser exceptions | missing-evidence |
| delete-immediately | Saved Markdown immediately after submit | missing-evidence |
| delete-immediately | Saved Markdown after reload | missing-evidence |
| delete-immediately | Text shown in the reloaded issue | missing-evidence |
| delete-immediately | Paragraphs in the reopened editor | missing-evidence |
| delete-immediately | Browser exceptions | missing-evidence |
| append-after-review | Saved Markdown immediately after submit | parity |
| append-after-review | Saved Markdown after reload | parity |
| append-after-review | Text shown in the reloaded issue | parity |
| append-after-review | Paragraphs in the reopened editor | parity |
| append-after-review | Browser exceptions | improvement |
| delete-after-review | Saved Markdown immediately after submit | parity |
| delete-after-review | Saved Markdown after reload | parity |
| delete-after-review | Text shown in the reloaded issue | parity |
| delete-after-review | Paragraphs in the reopened editor | parity |
| delete-after-review | Browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Final key to Save click

| Workflow | Stock GitLab | Fountain | Persisted Markdown after reload |
| --- | ---: | ---: | --- |
| append-immediately | 212.0 ms | 285.0 ms | missing-evidence |
| delete-immediately | 197.0 ms | 156.0 ms | missing-evidence |
| append-after-review | 575.0 ms | 578.0 ms | parity |
| delete-after-review | 576.0 ms | 570.0 ms | parity |

Immediate clicks must arrive within 100 ms of the final keydown. The review controls wait at least 500 ms. Both sides must show the intended paragraph at click time.
