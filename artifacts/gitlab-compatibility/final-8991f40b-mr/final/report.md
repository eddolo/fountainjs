# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 1f16e1b0abf20468b0d439ea65b0ddd6058240e5 · runtime 345d2f2c4233274201a0247f0fe09858bf6b74e365b1e1c2feae9d8e0986a03b · integration 62bab23a4d078670b032f65e353e0d36feca43d13ebe3b083b84ae7ca2d08824

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| developer-creates-merge-request | GitLab identifies the signed-in Developer as author after creation and after reopening | parity |
| developer-creates-merge-request | Reload restores the unposted comment and its bold text without publishing it | parity |
| developer-creates-merge-request | Posting the recovered comment preserves its formatting, author and earlier discussion and clears the composer | parity |
| developer-creates-merge-request | The Developer can recover the same private draft and read it in the review drawer | parity |
| developer-creates-merge-request | Submitting the review publishes one comment and clears the pending draft | parity |
| developer-creates-merge-request | The existing review comment survives navigation in the reader and the notes API | parity |
| developer-creates-merge-request | The create form uses the selected source and target branches | parity |
| developer-creates-merge-request | GitLab creates the open request with the intended branches, head and title | parity |
| developer-creates-merge-request | The saved description retains its Markdown | parity |
| developer-creates-merge-request | The created request displays the formatted paragraph | parity |
| developer-creates-merge-request | The reopened editor retains the paragraph and bold range | parity |
| developer-creates-merge-request | The follow-up edit is persisted alongside the initial formatting | parity |
| developer-creates-merge-request | The reloaded reader displays both paragraphs and the bold range | parity |
| developer-creates-merge-request | The source branch has exactly one merge request with the original number | parity |
| developer-creates-merge-request | Updating the description preserves the branch head, title and open state | parity |
| developer-creates-merge-request | The creation and edit journey finishes without browser exceptions | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
