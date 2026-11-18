# FountainJS starters

Download a project from the developer guide, or copy its directory from
this repository. Each is a standalone npm project that uses the published
FountainJS beta.

- [Plain DOM](plain-dom) uses `EditorView` and defines a custom callout.
- [React](react) uses `useFountain` and the supplied editor and toolbar.
- [Node.js](node) validates and converts local Markdown and HTML without a
  browser or build step. Install it with `npm install` and run `npm start`.
- [Document templates](templates) lets an author design a template, invite respondents,
  and review their completed documents. It uses SQLite on the local machine.
  With Node 24.12 or later, run `npm install` and `npm start` in the project.

The guide's browser test verifies that the downloads contain the same files
as these directories and that the demos link back to their starter cards.
To check a packed candidate, run the following from the FountainJS repository.
Preparation installs each starter in its own temporary project, builds the
browser applications, and exercises the Node converter and SQLite workflow.

```sh
pnpm audit:starters:prepare
pnpm audit:starters
```

The recorded workflows use the installed candidate in Chromium, Firefox,
and WebKit. They check typed edits, undo and redo, the custom block,
JSON updates, and a respondent submitting a rich-text document for review. The automation attaches navigation-to-editable and
click-to-callout timings. These exclude installation and measure this local
setup. One Windows run with Node 24 and npm 11.6.2 measured 224–651 ms to an
editable surface and 62–164 ms from clicking Insert callout to seeing it.
Independent developer onboarding trials remain open.

The React starter uses the full toolbar. Its published-beta production build
triggers Vite's chunk-size warning, with about 622 kB raw JavaScript in one
chunk. The plain DOM build emits about 383 kB of raw JavaScript.
