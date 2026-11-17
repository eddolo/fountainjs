# Matched GitLab editor comparison

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| quoted-conversion | before: code indentation is intact before conversion | parity |
| quoted-conversion | readerBefore: code indentation is intact before conversion | parity |
| quoted-conversion | Real creation dialog has the intended title | shared-limitation |
| quoted-conversion | Untouched creation prefill preserves code indentation | parity |
| quoted-conversion | Creation dialog uses the verified editor | parity |
| quoted-conversion | Created child title | shared-limitation |
| quoted-conversion | Created child type | parity |
| quoted-conversion | Saved child preserves exact description source | inconclusive-different-failures |
| quoted-conversion | Created child is actually linked to the original parent | parity |
| quoted-conversion | Reloaded parent retains nested checklist, siblings and prose | shared-limitation |
| quoted-conversion | Backend parent retains the intended remaining task counts | shared-limitation |
| quoted-conversion | Conversion leaves parent Open | parity |
| quoted-conversion | Child reopens in the verified editor | parity |
| quoted-conversion | Reopened child preserves executable code indentation | parity |
| quoted-conversion | Reopened child retains bold detail | parity |
| quoted-conversion | Reopened child retains its link | parity |
| quoted-conversion | before: real outer quote ownership | parity |
| quoted-conversion | readerBefore: real outer quote ownership | parity |
| quoted-conversion | before: original list nesting survives import and Save | parity |
| quoted-conversion | readerBefore: original list nesting survives import and Save | parity |
| quoted-conversion | prefill: child source excludes parent-only quote wrappers | shared-limitation |
| quoted-conversion | childReopened: child source excludes parent-only quote wrappers | shared-limitation |
| quoted-conversion | Typing, Save and reload retain the parent structure | shared-limitation |
| quoted-conversion | Normal Save remains reachable after parent reopen | parity |
| quoted-conversion | Resaved parent remains Open | parity |
| quoted-conversion | Resaved backend checklist counts remain correct | shared-limitation |
| deep-quoted-conversion | before: code indentation is intact before conversion | parity |
| deep-quoted-conversion | readerBefore: code indentation is intact before conversion | parity |
| deep-quoted-conversion | Real creation dialog has the intended title | shared-limitation |
| deep-quoted-conversion | Untouched creation prefill preserves code indentation | shared-limitation |
| deep-quoted-conversion | Creation dialog uses the verified editor | parity |
| deep-quoted-conversion | Created child title | shared-limitation |
| deep-quoted-conversion | Created child type | parity |
| deep-quoted-conversion | Saved child preserves exact description source | inconclusive-different-failures |
| deep-quoted-conversion | Created child is actually linked to the original parent | parity |
| deep-quoted-conversion | Reloaded parent retains nested checklist, siblings and prose | shared-limitation |
| deep-quoted-conversion | Backend parent retains the intended remaining task counts | shared-limitation |
| deep-quoted-conversion | Conversion leaves parent Open | parity |
| deep-quoted-conversion | Child reopens in the verified editor | parity |
| deep-quoted-conversion | Reopened child preserves executable code indentation | shared-limitation |
| deep-quoted-conversion | Reopened child retains bold detail | shared-limitation |
| deep-quoted-conversion | Reopened child retains its link | shared-limitation |
| deep-quoted-conversion | before: real outer quote ownership | parity |
| deep-quoted-conversion | readerBefore: real outer quote ownership | parity |
| deep-quoted-conversion | before: original list nesting survives import and Save | parity |
| deep-quoted-conversion | readerBefore: original list nesting survives import and Save | parity |
| deep-quoted-conversion | prefill: child source excludes parent-only quote wrappers | shared-limitation |
| deep-quoted-conversion | childReopened: child source excludes parent-only quote wrappers | shared-limitation |
| deep-quoted-conversion | Typing, Save and reload retain the parent structure | shared-limitation |
| deep-quoted-conversion | Normal Save remains reachable after parent reopen | parity |
| deep-quoted-conversion | Resaved parent remains Open | parity |
| deep-quoted-conversion | Resaved backend checklist counts remain correct | shared-limitation |
| listed-quote-conversion | before: code indentation is intact before conversion | parity |
| listed-quote-conversion | readerBefore: code indentation is intact before conversion | parity |
| listed-quote-conversion | Real creation dialog has the intended title | shared-limitation |
| listed-quote-conversion | Untouched creation prefill preserves code indentation | parity |
| listed-quote-conversion | Creation dialog uses the verified editor | parity |
| listed-quote-conversion | Created child title | shared-limitation |
| listed-quote-conversion | Created child type | parity |
| listed-quote-conversion | Saved child preserves exact description source | inconclusive-different-failures |
| listed-quote-conversion | Created child is actually linked to the original parent | parity |
| listed-quote-conversion | Reloaded parent retains nested checklist, siblings and prose | shared-limitation |
| listed-quote-conversion | Backend parent retains the intended remaining task counts | shared-limitation |
| listed-quote-conversion | Conversion leaves parent Open | parity |
| listed-quote-conversion | Child reopens in the verified editor | parity |
| listed-quote-conversion | Reopened child preserves executable code indentation | parity |
| listed-quote-conversion | Reopened child retains bold detail | parity |
| listed-quote-conversion | Reopened child retains its link | parity |
| listed-quote-conversion | before: real outer quote ownership | parity |
| listed-quote-conversion | readerBefore: real outer quote ownership | parity |
| listed-quote-conversion | before: original list nesting survives import and Save | parity |
| listed-quote-conversion | readerBefore: original list nesting survives import and Save | parity |
| listed-quote-conversion | prefill: child source excludes parent-only quote wrappers | shared-limitation |
| listed-quote-conversion | childReopened: child source excludes parent-only quote wrappers | shared-limitation |
| listed-quote-conversion | Typing, Save and reload retain the parent structure | shared-limitation |
| listed-quote-conversion | Normal Save remains reachable after parent reopen | parity |
| listed-quote-conversion | Resaved parent remains Open | parity |
| listed-quote-conversion | Resaved backend checklist counts remain correct | shared-limitation |
| inline-quote-conversion | before: code indentation is intact before conversion | parity |
| inline-quote-conversion | readerBefore: code indentation is intact before conversion | parity |
| inline-quote-conversion | Real creation dialog has the intended title | inconclusive-different-failures |
| inline-quote-conversion | Untouched creation prefill preserves code indentation | parity |
| inline-quote-conversion | Creation dialog uses the verified editor | parity |
| inline-quote-conversion | Created child title | inconclusive-different-failures |
| inline-quote-conversion | Created child type | parity |
| inline-quote-conversion | Saved child preserves exact description source | inconclusive-different-failures |
| inline-quote-conversion | Created child is actually linked to the original parent | parity |
| inline-quote-conversion | Reloaded parent retains nested checklist, siblings and prose | inconclusive-different-failures |
| inline-quote-conversion | Backend parent retains the intended remaining task counts | shared-limitation |
| inline-quote-conversion | Conversion leaves parent Open | parity |
| inline-quote-conversion | Child reopens in the verified editor | parity |
| inline-quote-conversion | Reopened child preserves executable code indentation | parity |
| inline-quote-conversion | Reopened child retains bold detail | parity |
| inline-quote-conversion | Reopened child retains its link | parity |
| inline-quote-conversion | before: real outer quote ownership | parity |
| inline-quote-conversion | readerBefore: real outer quote ownership | parity |
| inline-quote-conversion | before: original list nesting survives import and Save | improvement |
| inline-quote-conversion | readerBefore: original list nesting survives import and Save | improvement |
| inline-quote-conversion | prefill: child source excludes parent-only quote wrappers | shared-limitation |
| inline-quote-conversion | childReopened: child source excludes parent-only quote wrappers | shared-limitation |
| inline-quote-conversion | Typing, Save and reload retain the parent structure | inconclusive-different-failures |
| inline-quote-conversion | Normal Save remains reachable after parent reopen | parity |
| inline-quote-conversion | Resaved parent remains Open | parity |
| inline-quote-conversion | Resaved backend checklist counts remain correct | regression |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
