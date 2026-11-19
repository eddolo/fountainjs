# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 80ae30149c8fed68f6f89802cd8f2e22e53ddbd0 · runtime 755d58d35b0ac7e3a6c56286a8089261b3334662e96357925ca1dba0cd2c78f5 · integration 0b53fdc6fd29fdf59cf5052af158e91e563f4ffbc5916ca9f80ed856b60cee5e

Browser on stock / replacement: webkit 26.5 (linux) / webkit 26.5 (linux)

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
| delete-after-review | Browser exceptions | improvement |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

## Final key to Save click

| Workflow | Stock GitLab | Fountain | Persisted Markdown after reload |
| --- | ---: | ---: | --- |
| append-immediately | 21.0 ms | 36.0 ms | improvement |
| delete-immediately | 22.0 ms | 24.0 ms | improvement |
| append-after-review | 521.0 ms | 524.0 ms | parity |
| delete-after-review | 571.0 ms | 527.0 ms | parity |

Immediate clicks must arrive within 100 ms of the final keydown. The review controls wait at least 500 ms. Both sides must show the intended paragraph at click time.
