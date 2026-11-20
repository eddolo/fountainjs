# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 442191162f18d104a446bb8f5e4684da0895ee92 · runtime 167d91c06ce5931c9ad48dd4f7c4eb17db062cf82293f496dad850e7d047bf8e · integration dec7e985304723772ba4abc53621b00b78176f38fdc9b310bcc23f330f728c12

Browser on stock / replacement: firefox 153.0 (linux) / firefox 153.0 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| create-merge-request | The create form uses the selected source and target branches | parity |
| create-merge-request | GitLab creates the open request with the intended branches, head and title | parity |
| create-merge-request | The saved description retains its Markdown | parity |
| create-merge-request | The created request displays the formatted paragraph | parity |
| create-merge-request | The reopened editor retains the paragraph and bold range | parity |
| create-merge-request | The follow-up edit is persisted alongside the initial formatting | parity |
| create-merge-request | The reloaded reader displays both paragraphs and the bold range | parity |
| create-merge-request | The source branch has exactly one merge request with the original number | parity |
| create-merge-request | Updating the description preserves the branch head, title and open state | parity |
| create-merge-request | The creation and edit journey finishes without browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
