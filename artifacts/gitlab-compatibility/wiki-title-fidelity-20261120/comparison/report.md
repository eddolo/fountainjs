# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 0f3db5f6bfe550275fd0ff440c78d47d5cbab7eb · runtime 167d91c06ce5931c9ad48dd4f7c4eb17db062cf82293f496dad850e7d047bf8e · integration 3102f5bd338dc814d48579f5dfec64910acc2b5306cf225f92bfdbe74e00bd64

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| quoted-title | The seed wiki source matches the fixture byte for byte | parity |
| quoted-title | The author sees the edited paragraph before Save | parity |
| quoted-title | The reader shows the edit after reload | parity |
| quoted-title | The rich editor reopens with the saved paragraph | parity |
| quoted-title | Persisted Markdown preserves the exact edit and untouched source | improvement |
| quoted-title | The rich editor reopens with the new display title | parity |
| quoted-title | Restore recovers the original display title | improvement |
| quoted-title | History shows the edit and the seed as two revisions | parity |
| quoted-title | Viewing v1 shows the original paragraph | parity |
| quoted-title | Dismissing Restore keeps the edited source byte for byte | parity |
| quoted-title | Restoring v1 recovers the original source byte for byte | improvement |
| quoted-title | The restored reader shows the original paragraph | parity |
| quoted-title | The restored owner name retains its formatting | parity |
| quoted-title | Restore adds a third revision | parity |
| quoted-title | Restore keeps the two prior revision IDs and messages intact | parity |
| quoted-title | The newest revision records the supplied restore message | parity |
| quoted-title | Each of the three version IDs returns the exact bytes saved at that revision | parity |
| quoted-title | No wiki browser exceptions | parity |
| double-title | The seed wiki source matches the fixture byte for byte | parity |
| double-title | The author sees the edited paragraph before Save | parity |
| double-title | The reader shows the edit after reload | parity |
| double-title | The rich editor reopens with the saved paragraph | parity |
| double-title | Persisted Markdown preserves the exact edit and untouched source | improvement |
| double-title | The rich editor reopens with the new display title | parity |
| double-title | Restore recovers the original display title | improvement |
| double-title | History shows the edit and the seed as two revisions | parity |
| double-title | Viewing v1 shows the original paragraph | parity |
| double-title | Dismissing Restore keeps the edited source byte for byte | parity |
| double-title | Restoring v1 recovers the original source byte for byte | improvement |
| double-title | The restored reader shows the original paragraph | parity |
| double-title | The restored owner name retains its formatting | parity |
| double-title | Restore adds a third revision | parity |
| double-title | Restore keeps the two prior revision IDs and messages intact | parity |
| double-title | The newest revision records the supplied restore message | parity |
| double-title | Each of the three version IDs returns the exact bytes saved at that revision | parity |
| double-title | No wiki browser exceptions | parity |
| new-title | The seed wiki source matches the fixture byte for byte | parity |
| new-title | The author sees the edited paragraph before Save | parity |
| new-title | The reader shows the edit after reload | parity |
| new-title | The rich editor reopens with the saved paragraph | parity |
| new-title | Persisted Markdown preserves the exact edit and untouched source | improvement |
| new-title | The rich editor reopens with the new display title | parity |
| new-title | Restore recovers the original display title | parity |
| new-title | History shows the edit and the seed as two revisions | parity |
| new-title | Viewing v1 shows the original paragraph | parity |
| new-title | Dismissing Restore keeps the edited source byte for byte | parity |
| new-title | Restoring v1 recovers the original source byte for byte | improvement |
| new-title | The restored reader shows the original paragraph | parity |
| new-title | The restored owner name retains its formatting | parity |
| new-title | Restore adds a third revision | parity |
| new-title | Restore keeps the two prior revision IDs and messages intact | parity |
| new-title | The newest revision records the supplied restore message | parity |
| new-title | Each of the three version IDs returns the exact bytes saved at that revision | parity |
| new-title | No wiki browser exceptions | parity |
| literal-title | The seed wiki source matches the fixture byte for byte | parity |
| literal-title | The author sees the edited paragraph before Save | parity |
| literal-title | The reader shows the edit after reload | parity |
| literal-title | The rich editor reopens with the saved paragraph | parity |
| literal-title | Persisted Markdown preserves the exact edit and untouched source | improvement |
| literal-title | The rich editor reopens with the new display title | parity |
| literal-title | Restore recovers the original display title | improvement |
| literal-title | History shows the edit and the seed as two revisions | parity |
| literal-title | Viewing v1 shows the original paragraph | parity |
| literal-title | Dismissing Restore keeps the edited source byte for byte | parity |
| literal-title | Restoring v1 recovers the original source byte for byte | improvement |
| literal-title | The restored reader shows the original paragraph | parity |
| literal-title | The restored owner name retains its formatting | parity |
| literal-title | Restore adds a third revision | parity |
| literal-title | Restore keeps the two prior revision IDs and messages intact | parity |
| literal-title | The newest revision records the supplied restore message | parity |
| literal-title | Each of the three version IDs returns the exact bytes saved at that revision | parity |
| literal-title | No wiki browser exceptions | parity |
| plain-title | The seed wiki source matches the fixture byte for byte | parity |
| plain-title | The author sees the edited paragraph before Save | parity |
| plain-title | The reader shows the edit after reload | parity |
| plain-title | The rich editor reopens with the saved paragraph | parity |
| plain-title | Persisted Markdown preserves the exact edit and untouched source | improvement |
| plain-title | The rich editor reopens with the new display title | parity |
| plain-title | Restore recovers the original display title | improvement |
| plain-title | History shows the edit and the seed as two revisions | parity |
| plain-title | Viewing v1 shows the original paragraph | parity |
| plain-title | Dismissing Restore keeps the edited source byte for byte | parity |
| plain-title | Restoring v1 recovers the original source byte for byte | improvement |
| plain-title | The restored reader shows the original paragraph | parity |
| plain-title | The restored owner name retains its formatting | parity |
| plain-title | Restore adds a third revision | parity |
| plain-title | Restore keeps the two prior revision IDs and messages intact | parity |
| plain-title | The newest revision records the supplied restore message | parity |
| plain-title | Each of the three version IDs returns the exact bytes saved at that revision | parity |
| plain-title | No wiki browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.

Both deployments used the same wiki controller patch `ca1f72280ca4ea54133ca0d3f057968065d7ef9edbd8ffd8977aed143a4c76af`. The stock frontend submits the content field. The repaired frontend also submits the selected Git revision.

## Stored wiki revisions

| Case | Editor | Revision | Git commit | Matches expected source |
| --- | --- | --- | --- | --- |
| quoted-title | original | v2 | `3b3bc2bd46ffb9a0cb96f9986f0c14ebdd57a7c4` | Different |
| quoted-title | original | v3 | `a84459868c013feab55d2a620fec265998bf81c3` | Different |
| double-title | original | v2 | `dbf6796e67020fed378fb3598db43755a9710678` | Different |
| double-title | original | v3 | `d6685c27a581749cc4642aa09ad79cda1b2f4890` | Different |
| new-title | original | v2 | `9cd0fc95f547214abb1b57413bc775ad251382c7` | Different |
| new-title | original | v3 | `f792b34a5b46bbf5973a81a6f9946079bdc30dad` | Different |
| literal-title | original | v2 | `68d7b2aae958e999ae24599031afab598c952769` | Different |
| literal-title | original | v3 | `222529aca05e5f901c3f4472a9bfc4ac23430eb3` | Different |
| plain-title | original | v2 | `223c4d1048baa47fbd476a38263e84d78b809094` | Different |
| plain-title | original | v3 | `f5b9bf7465a910da984a17944857838a25f366b0` | Different |
| quoted-title | fountain | v2 | `e11055bdf57c67a688c7322eef96717046828d66` | Exact |
| quoted-title | fountain | v3 | `245a48798eccadc7a062e7b5399a2f00d4e11203` | Exact |
| double-title | fountain | v2 | `978a0acd73958b243212957e1c9de84470151e88` | Exact |
| double-title | fountain | v3 | `3dd000d52414475e8a34434b84cd191f1352bfd8` | Exact |
| new-title | fountain | v2 | `b5c0c0a3af7bb4d36118c5c8ea20f98e9a82cd0f` | Exact |
| new-title | fountain | v3 | `005580cbdc7fbde4dd05af44f22880bb1796a7c4` | Exact |
| literal-title | fountain | v2 | `cffbfb21850e61f788dd90ec2594597f6c947183` | Exact |
| literal-title | fountain | v3 | `141e45e435151da7d57b8f1992c8720eaedfafe7` | Exact |
| plain-title | fountain | v2 | `c7a33b67a0f6374e939f317b5bda4e3621464c84` | Exact |
| plain-title | fountain | v3 | `55599001a74eb3cd3f89080b21c92b5f532262ec` | Exact |

## Wiki Markdown line endings

| Case | Editor | Action | Form before encoding | Submitted request | Stored revision |
| --- | --- | --- | --- | --- | --- |
| quoted-title | original | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| quoted-title | original | restore | CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| double-title | original | edit | LF (no final newline) | CRLF (no final newline) | CRLF (no final newline) |
| double-title | original | restore | CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| new-title | original | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| new-title | original | restore | CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| literal-title | original | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| literal-title | original | restore | CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| plain-title | original | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| plain-title | original | restore | CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| quoted-title | fountain | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | CRLF + LF (final CRLF) |
| quoted-title | fountain | restore | CRLF (final CRLF) | CRLF (final CRLF) | CRLF + LF (final CRLF) |
| double-title | fountain | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | LF + CRLF (final CRLF) |
| double-title | fountain | restore | CRLF (final CRLF) | CRLF (final CRLF) | LF + CRLF (final CRLF) |
| new-title | fountain | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| new-title | fountain | restore | CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| literal-title | fountain | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | LF + CRLF (final CRLF) |
| literal-title | fountain | restore | CRLF (final CRLF) | CRLF (final CRLF) | LF + CRLF (final CRLF) |
| plain-title | fountain | edit | LF + CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
| plain-title | fountain | restore | CRLF (final CRLF) | CRLF (final CRLF) | CRLF (final CRLF) |
