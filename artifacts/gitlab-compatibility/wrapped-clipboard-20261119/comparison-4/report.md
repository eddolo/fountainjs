# Matched GitLab editor comparison

**Original** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · stock Tiptap/ProseMirror · frontend manifest 8198a3fa9feab7a59f708cc2ff97dc0256501d391b843dc575a08234cbc61504

**Replacement** — GitLab CE 19.5.3 @ 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf · FountainJS 0.5.0-beta.2 @ 2cb51f61e53a3da07746cc89f81f645c4f4679ff · runtime 18cb22b436e24cfeec24534d02439d8341d8bcbcdc7d0a8dee9ed3d60d386c3a · integration d2394d5a033f4f0c153cdb7b81ac204951f61a3002ce4df45556880315944071

Browser on stock / replacement: chromium 151.0.7922.34 (linux) / chromium 151.0.7922.34 (linux)

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| pointer-forward | initial: headings | parity |
| pointer-forward | initial: prose | parity |
| pointer-forward | initial: bold | parity |
| pointer-forward | initial: links | parity |
| pointer-forward | initial: no unintended other structure | parity |
| pointer-forward | cut: headings | parity |
| pointer-forward | cut: prose | parity |
| pointer-forward | cut: bold | parity |
| pointer-forward | cut: links | parity |
| pointer-forward | cut: no unintended other structure | parity |
| pointer-forward | cutUndo: headings | parity |
| pointer-forward | cutUndo: prose | parity |
| pointer-forward | cutUndo: bold | parity |
| pointer-forward | cutUndo: links | parity |
| pointer-forward | cutUndo: no unintended other structure | parity |
| pointer-forward | pasted: headings | parity |
| pointer-forward | pasted: prose | parity |
| pointer-forward | pasted: bold | parity |
| pointer-forward | pasted: links | parity |
| pointer-forward | pasted: no unintended other structure | parity |
| pointer-forward | pasteUndo: headings | parity |
| pointer-forward | pasteUndo: prose | parity |
| pointer-forward | pasteUndo: bold | parity |
| pointer-forward | pasteUndo: links | parity |
| pointer-forward | pasteUndo: no unintended other structure | parity |
| pointer-forward | pasteRedo: headings | parity |
| pointer-forward | pasteRedo: prose | parity |
| pointer-forward | pasteRedo: bold | parity |
| pointer-forward | pasteRedo: links | parity |
| pointer-forward | pasteRedo: no unintended other structure | parity |
| pointer-forward | reopened: headings | parity |
| pointer-forward | reopened: prose | parity |
| pointer-forward | reopened: bold | parity |
| pointer-forward | reopened: links | parity |
| pointer-forward | reopened: no unintended other structure | parity |
| pointer-forward | Actual copySelection retains intended text and direction | parity |
| pointer-forward | Actual cutSelection retains intended text and direction | parity |
| pointer-forward | Selection spans separate visual lines of one paragraph | parity |
| pointer-forward | Selection spans separate visual lines of one paragraph | parity |
| pointer-forward | External selected fragment: text | parity |
| pointer-forward | External selected fragment: bold | parity |
| pointer-forward | External selected fragment: links | parity |
| pointer-forward | Copied plain text retains the selected content and paragraph boundaries | parity |
| pointer-forward | Save button remains directly reachable after pasted-link history | parity |
| pointer-forward | Selected fragment supplies actual HTML payload | parity |
| pointer-forward | Cut clipboard retains exactly the selected fragment | parity |
| pointer-forward | Paste clipboard retains exactly the selected fragment | parity |
| pointer-forward | Paste begins at verified focused empty paragraph | parity |
| pointer-forward | initial: document loaded before snapshot | parity |
| pointer-forward | reopened: document loaded before snapshot | parity |
| pointer-backward | initial: headings | parity |
| pointer-backward | initial: prose | parity |
| pointer-backward | initial: bold | parity |
| pointer-backward | initial: links | parity |
| pointer-backward | initial: no unintended other structure | parity |
| pointer-backward | cut: headings | parity |
| pointer-backward | cut: prose | parity |
| pointer-backward | cut: bold | parity |
| pointer-backward | cut: links | parity |
| pointer-backward | cut: no unintended other structure | parity |
| pointer-backward | cutUndo: headings | parity |
| pointer-backward | cutUndo: prose | parity |
| pointer-backward | cutUndo: bold | parity |
| pointer-backward | cutUndo: links | parity |
| pointer-backward | cutUndo: no unintended other structure | parity |
| pointer-backward | pasted: headings | parity |
| pointer-backward | pasted: prose | parity |
| pointer-backward | pasted: bold | parity |
| pointer-backward | pasted: links | parity |
| pointer-backward | pasted: no unintended other structure | parity |
| pointer-backward | pasteUndo: headings | parity |
| pointer-backward | pasteUndo: prose | parity |
| pointer-backward | pasteUndo: bold | parity |
| pointer-backward | pasteUndo: links | parity |
| pointer-backward | pasteUndo: no unintended other structure | parity |
| pointer-backward | pasteRedo: headings | parity |
| pointer-backward | pasteRedo: prose | parity |
| pointer-backward | pasteRedo: bold | parity |
| pointer-backward | pasteRedo: links | parity |
| pointer-backward | pasteRedo: no unintended other structure | parity |
| pointer-backward | reopened: headings | parity |
| pointer-backward | reopened: prose | parity |
| pointer-backward | reopened: bold | parity |
| pointer-backward | reopened: links | parity |
| pointer-backward | reopened: no unintended other structure | parity |
| pointer-backward | Actual copySelection retains intended text and direction | parity |
| pointer-backward | Actual cutSelection retains intended text and direction | parity |
| pointer-backward | Selection spans separate visual lines of one paragraph | parity |
| pointer-backward | Selection spans separate visual lines of one paragraph | parity |
| pointer-backward | External selected fragment: text | parity |
| pointer-backward | External selected fragment: bold | parity |
| pointer-backward | External selected fragment: links | parity |
| pointer-backward | Copied plain text retains the selected content and paragraph boundaries | parity |
| pointer-backward | Save button remains directly reachable after pasted-link history | parity |
| pointer-backward | Selected fragment supplies actual HTML payload | parity |
| pointer-backward | Cut clipboard retains exactly the selected fragment | parity |
| pointer-backward | Paste clipboard retains exactly the selected fragment | parity |
| pointer-backward | Paste begins at verified focused empty paragraph | parity |
| pointer-backward | initial: document loaded before snapshot | parity |
| pointer-backward | reopened: document loaded before snapshot | parity |
| stock-emoji-shortcode | initial: headings | parity |
| stock-emoji-shortcode | initial: prose | parity |
| stock-emoji-shortcode | initial: bold | parity |
| stock-emoji-shortcode | initial: links | parity |
| stock-emoji-shortcode | initial: no unintended other structure | parity |
| stock-emoji-shortcode | cut: headings | parity |
| stock-emoji-shortcode | cut: prose | parity |
| stock-emoji-shortcode | cut: bold | parity |
| stock-emoji-shortcode | cut: links | parity |
| stock-emoji-shortcode | cut: no unintended other structure | parity |
| stock-emoji-shortcode | cutUndo: headings | parity |
| stock-emoji-shortcode | cutUndo: prose | parity |
| stock-emoji-shortcode | cutUndo: bold | parity |
| stock-emoji-shortcode | cutUndo: links | parity |
| stock-emoji-shortcode | cutUndo: no unintended other structure | parity |
| stock-emoji-shortcode | pasted: headings | parity |
| stock-emoji-shortcode | pasted: prose | parity |
| stock-emoji-shortcode | pasted: bold | parity |
| stock-emoji-shortcode | pasted: links | parity |
| stock-emoji-shortcode | pasted: no unintended other structure | parity |
| stock-emoji-shortcode | pasteUndo: headings | parity |
| stock-emoji-shortcode | pasteUndo: prose | parity |
| stock-emoji-shortcode | pasteUndo: bold | parity |
| stock-emoji-shortcode | pasteUndo: links | parity |
| stock-emoji-shortcode | pasteUndo: no unintended other structure | parity |
| stock-emoji-shortcode | pasteRedo: headings | parity |
| stock-emoji-shortcode | pasteRedo: prose | parity |
| stock-emoji-shortcode | pasteRedo: bold | parity |
| stock-emoji-shortcode | pasteRedo: links | parity |
| stock-emoji-shortcode | pasteRedo: no unintended other structure | parity |
| stock-emoji-shortcode | reopened: headings | parity |
| stock-emoji-shortcode | reopened: prose | parity |
| stock-emoji-shortcode | reopened: bold | parity |
| stock-emoji-shortcode | reopened: links | parity |
| stock-emoji-shortcode | reopened: no unintended other structure | parity |
| stock-emoji-shortcode | Actual copySelection retains intended text and direction | parity |
| stock-emoji-shortcode | Actual cutSelection retains intended text and direction | parity |
| stock-emoji-shortcode | Selection spans separate visual lines of one paragraph | parity |
| stock-emoji-shortcode | Selection spans separate visual lines of one paragraph | parity |
| stock-emoji-shortcode | External selected fragment: text | parity |
| stock-emoji-shortcode | External selected fragment: bold | parity |
| stock-emoji-shortcode | External selected fragment: links | parity |
| stock-emoji-shortcode | Copied plain text retains the selected content and paragraph boundaries | parity |
| stock-emoji-shortcode | Save button remains directly reachable after pasted-link history | parity |
| stock-emoji-shortcode | Selected fragment supplies actual HTML payload | parity |
| stock-emoji-shortcode | Cut clipboard retains exactly the selected fragment | parity |
| stock-emoji-shortcode | Paste clipboard retains exactly the selected fragment | parity |
| stock-emoji-shortcode | Paste begins at verified focused empty paragraph | parity |
| stock-emoji-shortcode | initial: document loaded before snapshot | parity |
| stock-emoji-shortcode | reopened: document loaded before snapshot | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
