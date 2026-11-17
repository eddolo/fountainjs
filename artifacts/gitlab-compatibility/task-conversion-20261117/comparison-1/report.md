# Matched GitLab editor comparison

Environment matched: true. Comparison complete: true.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| plain-conversion | before: code indentation is intact before conversion | parity |
| plain-conversion | readerBefore: code indentation is intact before conversion | parity |
| plain-conversion | Real creation dialog has the intended title | parity |
| plain-conversion | Untouched creation prefill preserves code indentation | shared-limitation |
| plain-conversion | Creation dialog uses the verified editor | parity |
| plain-conversion | Created child title | parity |
| plain-conversion | Created child type | parity |
| plain-conversion | Saved child preserves exact description source | shared-limitation |
| plain-conversion | Created child is actually linked to the original parent | parity |
| plain-conversion | Reloaded parent retains nested checklist, siblings and prose | parity |
| plain-conversion | Backend parent contains three remaining tasks with one complete | parity |
| plain-conversion | Conversion leaves parent Open | parity |
| plain-conversion | Child reopens in the verified editor | parity |
| plain-conversion | Reopened child preserves executable code indentation | shared-limitation |
| plain-conversion | Reopened child retains bold detail | parity |
| plain-conversion | Reopened child retains its link | parity |
| scoped-conversion | before: code indentation is intact before conversion | parity |
| scoped-conversion | readerBefore: code indentation is intact before conversion | parity |
| scoped-conversion | Real creation dialog has the intended title | parity |
| scoped-conversion | Untouched creation prefill preserves code indentation | shared-limitation |
| scoped-conversion | Creation dialog uses the verified editor | parity |
| scoped-conversion | Created child title | parity |
| scoped-conversion | Created child type | parity |
| scoped-conversion | Saved child preserves exact description source | shared-limitation |
| scoped-conversion | Created child is actually linked to the original parent | parity |
| scoped-conversion | Reloaded parent retains nested checklist, siblings and prose | regression |
| scoped-conversion | Backend parent contains three remaining tasks with one complete | parity |
| scoped-conversion | Conversion leaves parent Open | parity |
| scoped-conversion | Child reopens in the verified editor | parity |
| scoped-conversion | Reopened child preserves executable code indentation | shared-limitation |
| scoped-conversion | Reopened child retains bold detail | parity |
| scoped-conversion | Reopened child retains its link | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
