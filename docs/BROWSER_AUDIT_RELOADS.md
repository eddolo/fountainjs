# Browser audit isolation

## Investigated Firefox failure, 2026-09-08

The first `preformatted-crlf-browsers` Firefox run appeared to lose Select All
before HTML paste. The trace instead shows a **new document load between the
selection action and paste**. The original editor no longer existed when the
locator found the replacement editor.

Evidence from the retained `trace.zip` under
`artifacts/preformatted-crlf-browsers/editor-recovers-paragraph--2eea3-locks-and-a-reopened-reader-firefox/`:

| Trace event | Monotonic time (ms) |
| --- | ---: |
| First issue-page document request | 36106.369 |
| Ctrl/Cmd+A begins | 37446.317 |
| Ctrl/Cmd+A completes | 57213.082 |
| Paste locator reports waiting for navigation | 57241.581 |
| Second request for the same issue-page HTML | 57255.144 |
| Vite client reconnects in the new page | 57521.436 |
| Replacement editor resolves for paste | 57926.432 |

The requests occurred at `05:38:12.538Z` and `05:38:33.697Z`. Another audit
rebuilt the shared `dist` while the first Vite-backed browser suite was running;
that run also disrupted an Angular module import in the overlapping unit suite.
The document-replacement evidence explains this failure without changing the
editor's selection implementation. A timing failure alone would not establish
that explanation; three passing reruns alone would not establish it either.

## Isolation and regression checks

Do not run build-backed suites simultaneously against one checkout. In
particular, `pnpm audit:ui` rebuilds the package before starting its server.
Run it before or after `pnpm check` and other browser audits, or use independent
checkouts and ports. Do not fix an invalidated run by forcing a new selection
after an unnoticed reload.

`tests/browser/stable-document.ts` fails an interaction if its main frame
navigates. The paragraph recovery journey guards each click/Select All/paste
sequence; its existing exact document, whitespace, editing, undo and file
reopening assertions remain intact. Real failures remain the error cause when
navigation also occurs. Event listeners are always removed.

Verification:

- Forced reload and real-error propagation checked in Chromium, Firefox and
  WebKit: six guard/journey checks passed.
- Complete paragraph/list/preformatted journey repeated three times per desktop
  engine: nine passed without rebuilding the served files.
- A separate recorded Firefox journey passed. Editor, list-reader, preformatted
  editor and narrow-reader screenshots were visually inspected; the exact three
  preformatted lines and second-line indentation are retained.
- Four helper tests verify success/failure cleanup, navigation rejection, error
  causes and ignoring child-frame navigation.
- The complete sequential `pnpm check` passed: 1,451 tests / 115 files, including
  compiled package/server, headless, API, conformance and performance gates.

Record the Firefox journey with:

```sh
pnpm exec playwright test -c playwright.audit.config.ts firefox-paragraph-recovery-audit.spec.ts
```

The recorded run is under `artifacts/firefox-stable-document-recorded/` locally.
These tests use real browser keyboard input and a public synthetic paste event;
they do not certify an operating-system clipboard, physical mobile devices,
arbitrary plugin behavior, or all possible selection races. The editor engine
and public API are unchanged by this investigation.
