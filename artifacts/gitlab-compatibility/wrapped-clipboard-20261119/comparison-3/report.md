# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 7756a29fcd8ed2de750620d488051b8a9022b0e8 · runtime 187d26bc9a1b77d76177c024e74f8df08e18ad76383ddbbfd201fbcf8f565851 · integration c24095c5b2c8ec06ae7f20b34c47ceb27b7a84b95f04539ab883432e90dbd01d

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: false.
Regression gate: failed/incomplete. Absolute feature acceptance: not achieved.

| Case | Invariant | Classification |
| --- | --- | --- |
| pointer-forward | initial: headings | missing-evidence |
| pointer-forward | initial: prose | missing-evidence |
| pointer-forward | initial: bold | missing-evidence |
| pointer-forward | initial: links | missing-evidence |
| pointer-forward | initial: no unintended other structure | missing-evidence |
| pointer-forward | cut: headings | missing-evidence |
| pointer-forward | cut: prose | missing-evidence |
| pointer-forward | cut: bold | missing-evidence |
| pointer-forward | cut: links | missing-evidence |
| pointer-forward | cut: no unintended other structure | missing-evidence |
| pointer-forward | cutUndo: headings | missing-evidence |
| pointer-forward | cutUndo: prose | missing-evidence |
| pointer-forward | cutUndo: bold | missing-evidence |
| pointer-forward | cutUndo: links | missing-evidence |
| pointer-forward | cutUndo: no unintended other structure | missing-evidence |
| pointer-forward | pasted: headings | missing-evidence |
| pointer-forward | pasted: prose | missing-evidence |
| pointer-forward | pasted: bold | missing-evidence |
| pointer-forward | pasted: links | missing-evidence |
| pointer-forward | pasted: no unintended other structure | missing-evidence |
| pointer-forward | pasteUndo: headings | missing-evidence |
| pointer-forward | pasteUndo: prose | missing-evidence |
| pointer-forward | pasteUndo: bold | missing-evidence |
| pointer-forward | pasteUndo: links | missing-evidence |
| pointer-forward | pasteUndo: no unintended other structure | missing-evidence |
| pointer-forward | pasteRedo: headings | missing-evidence |
| pointer-forward | pasteRedo: prose | missing-evidence |
| pointer-forward | pasteRedo: bold | missing-evidence |
| pointer-forward | pasteRedo: links | missing-evidence |
| pointer-forward | pasteRedo: no unintended other structure | missing-evidence |
| pointer-forward | reopened: headings | missing-evidence |
| pointer-forward | reopened: prose | missing-evidence |
| pointer-forward | reopened: bold | missing-evidence |
| pointer-forward | reopened: links | missing-evidence |
| pointer-forward | reopened: no unintended other structure | missing-evidence |
| pointer-forward | Actual copySelection retains intended text and direction | missing-evidence |
| pointer-forward | Actual cutSelection retains intended text and direction | missing-evidence |
| pointer-forward | Selection spans separate visual lines of one paragraph | missing-evidence |
| pointer-forward | Selection spans separate visual lines of one paragraph | missing-evidence |
| pointer-forward | External selected fragment: text | missing-evidence |
| pointer-forward | External selected fragment: bold | missing-evidence |
| pointer-forward | External selected fragment: links | missing-evidence |
| pointer-forward | Copied plain text retains the selected content and paragraph boundaries | missing-evidence |
| pointer-forward | Save button remains directly reachable after pasted-link history | missing-evidence |
| pointer-forward | Selected fragment supplies actual HTML payload | missing-evidence |
| pointer-forward | Cut clipboard retains exactly the selected fragment | missing-evidence |
| pointer-forward | Paste clipboard retains exactly the selected fragment | missing-evidence |
| pointer-forward | Paste begins at verified focused empty paragraph | missing-evidence |
| pointer-forward | initial: document loaded before snapshot | missing-evidence |
| pointer-forward | reopened: document loaded before snapshot | missing-evidence |
| pointer-backward | initial: headings | missing-evidence |
| pointer-backward | initial: prose | missing-evidence |
| pointer-backward | initial: bold | missing-evidence |
| pointer-backward | initial: links | missing-evidence |
| pointer-backward | initial: no unintended other structure | missing-evidence |
| pointer-backward | cut: headings | missing-evidence |
| pointer-backward | cut: prose | missing-evidence |
| pointer-backward | cut: bold | missing-evidence |
| pointer-backward | cut: links | missing-evidence |
| pointer-backward | cut: no unintended other structure | missing-evidence |
| pointer-backward | cutUndo: headings | missing-evidence |
| pointer-backward | cutUndo: prose | missing-evidence |
| pointer-backward | cutUndo: bold | missing-evidence |
| pointer-backward | cutUndo: links | missing-evidence |
| pointer-backward | cutUndo: no unintended other structure | missing-evidence |
| pointer-backward | pasted: headings | missing-evidence |
| pointer-backward | pasted: prose | missing-evidence |
| pointer-backward | pasted: bold | missing-evidence |
| pointer-backward | pasted: links | missing-evidence |
| pointer-backward | pasted: no unintended other structure | missing-evidence |
| pointer-backward | pasteUndo: headings | missing-evidence |
| pointer-backward | pasteUndo: prose | missing-evidence |
| pointer-backward | pasteUndo: bold | missing-evidence |
| pointer-backward | pasteUndo: links | missing-evidence |
| pointer-backward | pasteUndo: no unintended other structure | missing-evidence |
| pointer-backward | pasteRedo: headings | missing-evidence |
| pointer-backward | pasteRedo: prose | missing-evidence |
| pointer-backward | pasteRedo: bold | missing-evidence |
| pointer-backward | pasteRedo: links | missing-evidence |
| pointer-backward | pasteRedo: no unintended other structure | missing-evidence |
| pointer-backward | reopened: headings | missing-evidence |
| pointer-backward | reopened: prose | missing-evidence |
| pointer-backward | reopened: bold | missing-evidence |
| pointer-backward | reopened: links | missing-evidence |
| pointer-backward | reopened: no unintended other structure | missing-evidence |
| pointer-backward | Actual copySelection retains intended text and direction | missing-evidence |
| pointer-backward | Actual cutSelection retains intended text and direction | missing-evidence |
| pointer-backward | Selection spans separate visual lines of one paragraph | missing-evidence |
| pointer-backward | Selection spans separate visual lines of one paragraph | missing-evidence |
| pointer-backward | External selected fragment: text | missing-evidence |
| pointer-backward | External selected fragment: bold | missing-evidence |
| pointer-backward | External selected fragment: links | missing-evidence |
| pointer-backward | Copied plain text retains the selected content and paragraph boundaries | missing-evidence |
| pointer-backward | Save button remains directly reachable after pasted-link history | missing-evidence |
| pointer-backward | Selected fragment supplies actual HTML payload | missing-evidence |
| pointer-backward | Cut clipboard retains exactly the selected fragment | missing-evidence |
| pointer-backward | Paste clipboard retains exactly the selected fragment | missing-evidence |
| pointer-backward | Paste begins at verified focused empty paragraph | missing-evidence |
| pointer-backward | initial: document loaded before snapshot | missing-evidence |
| pointer-backward | reopened: document loaded before snapshot | missing-evidence |
| stock-emoji-shortcode | initial: headings | missing-evidence |
| stock-emoji-shortcode | initial: prose | missing-evidence |
| stock-emoji-shortcode | initial: bold | missing-evidence |
| stock-emoji-shortcode | initial: links | missing-evidence |
| stock-emoji-shortcode | initial: no unintended other structure | missing-evidence |
| stock-emoji-shortcode | cut: headings | missing-evidence |
| stock-emoji-shortcode | cut: prose | missing-evidence |
| stock-emoji-shortcode | cut: bold | missing-evidence |
| stock-emoji-shortcode | cut: links | missing-evidence |
| stock-emoji-shortcode | cut: no unintended other structure | missing-evidence |
| stock-emoji-shortcode | cutUndo: headings | missing-evidence |
| stock-emoji-shortcode | cutUndo: prose | missing-evidence |
| stock-emoji-shortcode | cutUndo: bold | missing-evidence |
| stock-emoji-shortcode | cutUndo: links | missing-evidence |
| stock-emoji-shortcode | cutUndo: no unintended other structure | missing-evidence |
| stock-emoji-shortcode | pasted: headings | missing-evidence |
| stock-emoji-shortcode | pasted: prose | missing-evidence |
| stock-emoji-shortcode | pasted: bold | missing-evidence |
| stock-emoji-shortcode | pasted: links | missing-evidence |
| stock-emoji-shortcode | pasted: no unintended other structure | missing-evidence |
| stock-emoji-shortcode | pasteUndo: headings | missing-evidence |
| stock-emoji-shortcode | pasteUndo: prose | missing-evidence |
| stock-emoji-shortcode | pasteUndo: bold | missing-evidence |
| stock-emoji-shortcode | pasteUndo: links | missing-evidence |
| stock-emoji-shortcode | pasteUndo: no unintended other structure | missing-evidence |
| stock-emoji-shortcode | pasteRedo: headings | missing-evidence |
| stock-emoji-shortcode | pasteRedo: prose | missing-evidence |
| stock-emoji-shortcode | pasteRedo: bold | missing-evidence |
| stock-emoji-shortcode | pasteRedo: links | missing-evidence |
| stock-emoji-shortcode | pasteRedo: no unintended other structure | missing-evidence |
| stock-emoji-shortcode | reopened: headings | missing-evidence |
| stock-emoji-shortcode | reopened: prose | missing-evidence |
| stock-emoji-shortcode | reopened: bold | missing-evidence |
| stock-emoji-shortcode | reopened: links | missing-evidence |
| stock-emoji-shortcode | reopened: no unintended other structure | missing-evidence |
| stock-emoji-shortcode | Actual copySelection retains intended text and direction | missing-evidence |
| stock-emoji-shortcode | Actual cutSelection retains intended text and direction | missing-evidence |
| stock-emoji-shortcode | Selection spans separate visual lines of one paragraph | missing-evidence |
| stock-emoji-shortcode | Selection spans separate visual lines of one paragraph | missing-evidence |
| stock-emoji-shortcode | External selected fragment: text | missing-evidence |
| stock-emoji-shortcode | External selected fragment: bold | missing-evidence |
| stock-emoji-shortcode | External selected fragment: links | missing-evidence |
| stock-emoji-shortcode | Copied plain text retains the selected content and paragraph boundaries | missing-evidence |
| stock-emoji-shortcode | Save button remains directly reachable after pasted-link history | missing-evidence |
| stock-emoji-shortcode | Selected fragment supplies actual HTML payload | missing-evidence |
| stock-emoji-shortcode | Cut clipboard retains exactly the selected fragment | missing-evidence |
| stock-emoji-shortcode | Paste clipboard retains exactly the selected fragment | missing-evidence |
| stock-emoji-shortcode | Paste begins at verified focused empty paragraph | missing-evidence |
| stock-emoji-shortcode | initial: document loaded before snapshot | missing-evidence |
| stock-emoji-shortcode | reopened: document loaded before snapshot | missing-evidence |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
