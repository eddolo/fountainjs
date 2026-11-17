# Matched GitLab editor comparison

Environment matched: true. Comparison complete: true.
Regression gate: passed. Absolute feature acceptance: passed.

| Case | Invariant | Classification |
| --- | --- | --- |
| keyboard-forward | initial: headings | parity |
| keyboard-forward | initial: prose | parity |
| keyboard-forward | initial: bold | parity |
| keyboard-forward | initial: links | parity |
| keyboard-forward | initial: no unintended other structure | parity |
| keyboard-forward | cut: headings | parity |
| keyboard-forward | cut: prose | parity |
| keyboard-forward | cut: bold | parity |
| keyboard-forward | cut: links | parity |
| keyboard-forward | cut: no unintended other structure | parity |
| keyboard-forward | cutUndo: headings | parity |
| keyboard-forward | cutUndo: prose | parity |
| keyboard-forward | cutUndo: bold | parity |
| keyboard-forward | cutUndo: links | parity |
| keyboard-forward | cutUndo: no unintended other structure | parity |
| keyboard-forward | pasted: headings | parity |
| keyboard-forward | pasted: prose | parity |
| keyboard-forward | pasted: bold | parity |
| keyboard-forward | pasted: links | parity |
| keyboard-forward | pasted: no unintended other structure | parity |
| keyboard-forward | pasteUndo: headings | parity |
| keyboard-forward | pasteUndo: prose | parity |
| keyboard-forward | pasteUndo: bold | parity |
| keyboard-forward | pasteUndo: links | parity |
| keyboard-forward | pasteUndo: no unintended other structure | parity |
| keyboard-forward | pasteRedo: headings | parity |
| keyboard-forward | pasteRedo: prose | parity |
| keyboard-forward | pasteRedo: bold | parity |
| keyboard-forward | pasteRedo: links | parity |
| keyboard-forward | pasteRedo: no unintended other structure | parity |
| keyboard-forward | reopened: headings | parity |
| keyboard-forward | reopened: prose | parity |
| keyboard-forward | reopened: bold | parity |
| keyboard-forward | reopened: links | parity |
| keyboard-forward | reopened: no unintended other structure | parity |
| keyboard-forward | Actual copySelection retains intended text and direction | parity |
| keyboard-forward | Actual cutSelection retains intended text and direction | parity |
| keyboard-forward | Keyboard copySelection begins at a verified focused paragraph boundary | parity |
| keyboard-forward | Keyboard cutSelection begins at a verified focused paragraph boundary | parity |
| keyboard-forward | External selected fragment: bold | parity |
| keyboard-forward | External selected fragment: links | parity |
| keyboard-forward | External selected fragment: prose | parity |
| keyboard-forward | External selected fragment: outsideParagraphs | parity |
| keyboard-forward | Copied plain text retains the selected content and paragraph boundaries | improvement |
| keyboard-forward | Actual external plain paste retains both nonempty paragraphs | improvement |
| keyboard-forward | Save button remains directly reachable after pasted-link history | parity |
| keyboard-forward | Selected fragment supplies actual HTML payload | parity |
| keyboard-forward | Cut clipboard retains exactly the selected fragment | improvement |
| keyboard-forward | Paste clipboard retains exactly the selected fragment | improvement |
| keyboard-forward | Paste begins at verified focused empty paragraph | parity |
| keyboard-forward | initial: document loaded before snapshot | parity |
| keyboard-forward | reopened: document loaded before snapshot | parity |
| keyboard-backward | initial: headings | parity |
| keyboard-backward | initial: prose | parity |
| keyboard-backward | initial: bold | parity |
| keyboard-backward | initial: links | parity |
| keyboard-backward | initial: no unintended other structure | parity |
| keyboard-backward | cut: headings | parity |
| keyboard-backward | cut: prose | parity |
| keyboard-backward | cut: bold | parity |
| keyboard-backward | cut: links | parity |
| keyboard-backward | cut: no unintended other structure | parity |
| keyboard-backward | cutUndo: headings | parity |
| keyboard-backward | cutUndo: prose | parity |
| keyboard-backward | cutUndo: bold | parity |
| keyboard-backward | cutUndo: links | parity |
| keyboard-backward | cutUndo: no unintended other structure | parity |
| keyboard-backward | pasted: headings | parity |
| keyboard-backward | pasted: prose | parity |
| keyboard-backward | pasted: bold | parity |
| keyboard-backward | pasted: links | parity |
| keyboard-backward | pasted: no unintended other structure | parity |
| keyboard-backward | pasteUndo: headings | parity |
| keyboard-backward | pasteUndo: prose | parity |
| keyboard-backward | pasteUndo: bold | parity |
| keyboard-backward | pasteUndo: links | parity |
| keyboard-backward | pasteUndo: no unintended other structure | parity |
| keyboard-backward | pasteRedo: headings | parity |
| keyboard-backward | pasteRedo: prose | parity |
| keyboard-backward | pasteRedo: bold | parity |
| keyboard-backward | pasteRedo: links | parity |
| keyboard-backward | pasteRedo: no unintended other structure | parity |
| keyboard-backward | reopened: headings | parity |
| keyboard-backward | reopened: prose | parity |
| keyboard-backward | reopened: bold | parity |
| keyboard-backward | reopened: links | parity |
| keyboard-backward | reopened: no unintended other structure | parity |
| keyboard-backward | Actual copySelection retains intended text and direction | parity |
| keyboard-backward | Actual cutSelection retains intended text and direction | parity |
| keyboard-backward | Keyboard copySelection begins at a verified focused paragraph boundary | parity |
| keyboard-backward | Keyboard cutSelection begins at a verified focused paragraph boundary | parity |
| keyboard-backward | External selected fragment: bold | parity |
| keyboard-backward | External selected fragment: links | parity |
| keyboard-backward | External selected fragment: prose | parity |
| keyboard-backward | External selected fragment: outsideParagraphs | parity |
| keyboard-backward | Copied plain text retains the selected content and paragraph boundaries | improvement |
| keyboard-backward | Actual external plain paste retains both nonempty paragraphs | improvement |
| keyboard-backward | Save button remains directly reachable after pasted-link history | parity |
| keyboard-backward | Selected fragment supplies actual HTML payload | parity |
| keyboard-backward | Cut clipboard retains exactly the selected fragment | improvement |
| keyboard-backward | Paste clipboard retains exactly the selected fragment | improvement |
| keyboard-backward | Paste begins at verified focused empty paragraph | parity |
| keyboard-backward | initial: document loaded before snapshot | parity |
| keyboard-backward | reopened: document loaded before snapshot | parity |
| mouse-forward | initial: headings | parity |
| mouse-forward | initial: prose | parity |
| mouse-forward | initial: bold | parity |
| mouse-forward | initial: links | parity |
| mouse-forward | initial: no unintended other structure | parity |
| mouse-forward | cut: headings | parity |
| mouse-forward | cut: prose | parity |
| mouse-forward | cut: bold | parity |
| mouse-forward | cut: links | parity |
| mouse-forward | cut: no unintended other structure | parity |
| mouse-forward | cutUndo: headings | parity |
| mouse-forward | cutUndo: prose | parity |
| mouse-forward | cutUndo: bold | parity |
| mouse-forward | cutUndo: links | parity |
| mouse-forward | cutUndo: no unintended other structure | parity |
| mouse-forward | pasted: headings | parity |
| mouse-forward | pasted: prose | parity |
| mouse-forward | pasted: bold | parity |
| mouse-forward | pasted: links | parity |
| mouse-forward | pasted: no unintended other structure | parity |
| mouse-forward | pasteUndo: headings | parity |
| mouse-forward | pasteUndo: prose | parity |
| mouse-forward | pasteUndo: bold | parity |
| mouse-forward | pasteUndo: links | parity |
| mouse-forward | pasteUndo: no unintended other structure | parity |
| mouse-forward | pasteRedo: headings | parity |
| mouse-forward | pasteRedo: prose | parity |
| mouse-forward | pasteRedo: bold | parity |
| mouse-forward | pasteRedo: links | parity |
| mouse-forward | pasteRedo: no unintended other structure | parity |
| mouse-forward | reopened: headings | parity |
| mouse-forward | reopened: prose | parity |
| mouse-forward | reopened: bold | parity |
| mouse-forward | reopened: links | parity |
| mouse-forward | reopened: no unintended other structure | parity |
| mouse-forward | Actual copySelection retains intended text and direction | parity |
| mouse-forward | Actual cutSelection retains intended text and direction | parity |
| mouse-forward | External selected fragment: bold | parity |
| mouse-forward | External selected fragment: links | parity |
| mouse-forward | External selected fragment: prose | parity |
| mouse-forward | External selected fragment: outsideParagraphs | parity |
| mouse-forward | Copied plain text retains the selected content and paragraph boundaries | improvement |
| mouse-forward | Actual external plain paste retains both nonempty paragraphs | improvement |
| mouse-forward | Save button remains directly reachable after pasted-link history | parity |
| mouse-forward | Selected fragment supplies actual HTML payload | parity |
| mouse-forward | Cut clipboard retains exactly the selected fragment | improvement |
| mouse-forward | Paste clipboard retains exactly the selected fragment | improvement |
| mouse-forward | Paste begins at verified focused empty paragraph | parity |
| mouse-forward | initial: document loaded before snapshot | parity |
| mouse-forward | reopened: document loaded before snapshot | parity |
| mouse-backward | initial: headings | parity |
| mouse-backward | initial: prose | parity |
| mouse-backward | initial: bold | parity |
| mouse-backward | initial: links | parity |
| mouse-backward | initial: no unintended other structure | parity |
| mouse-backward | cut: headings | parity |
| mouse-backward | cut: prose | parity |
| mouse-backward | cut: bold | parity |
| mouse-backward | cut: links | parity |
| mouse-backward | cut: no unintended other structure | parity |
| mouse-backward | cutUndo: headings | parity |
| mouse-backward | cutUndo: prose | parity |
| mouse-backward | cutUndo: bold | parity |
| mouse-backward | cutUndo: links | parity |
| mouse-backward | cutUndo: no unintended other structure | parity |
| mouse-backward | pasted: headings | parity |
| mouse-backward | pasted: prose | parity |
| mouse-backward | pasted: bold | parity |
| mouse-backward | pasted: links | parity |
| mouse-backward | pasted: no unintended other structure | parity |
| mouse-backward | pasteUndo: headings | parity |
| mouse-backward | pasteUndo: prose | parity |
| mouse-backward | pasteUndo: bold | parity |
| mouse-backward | pasteUndo: links | parity |
| mouse-backward | pasteUndo: no unintended other structure | parity |
| mouse-backward | pasteRedo: headings | parity |
| mouse-backward | pasteRedo: prose | parity |
| mouse-backward | pasteRedo: bold | parity |
| mouse-backward | pasteRedo: links | parity |
| mouse-backward | pasteRedo: no unintended other structure | parity |
| mouse-backward | reopened: headings | parity |
| mouse-backward | reopened: prose | parity |
| mouse-backward | reopened: bold | parity |
| mouse-backward | reopened: links | parity |
| mouse-backward | reopened: no unintended other structure | parity |
| mouse-backward | Actual copySelection retains intended text and direction | parity |
| mouse-backward | Actual cutSelection retains intended text and direction | parity |
| mouse-backward | External selected fragment: bold | parity |
| mouse-backward | External selected fragment: links | parity |
| mouse-backward | External selected fragment: prose | parity |
| mouse-backward | External selected fragment: outsideParagraphs | parity |
| mouse-backward | Copied plain text retains the selected content and paragraph boundaries | improvement |
| mouse-backward | Actual external plain paste retains both nonempty paragraphs | improvement |
| mouse-backward | Save button remains directly reachable after pasted-link history | parity |
| mouse-backward | Selected fragment supplies actual HTML payload | parity |
| mouse-backward | Cut clipboard retains exactly the selected fragment | improvement |
| mouse-backward | Paste clipboard retains exactly the selected fragment | improvement |
| mouse-backward | Paste begins at verified focused empty paragraph | parity |
| mouse-backward | initial: document loaded before snapshot | parity |
| mouse-backward | reopened: document loaded before snapshot | parity |

Classifications apply only to these observed workflows and the recorded candidate. Shared limitations remain unmet requirements.
