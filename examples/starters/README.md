# FountainJS starters

Download either project from the developer guide, or copy its directory from
this repository. Each is a standalone npm project that uses the published
FountainJS beta.

- [Plain DOM](plain-dom) uses `EditorView` and defines a custom callout.
- [React](react) uses `useFountain` and the supplied editor and toolbar.

The guide's browser test verifies that the downloads contain the same files
as these directories and that the demos link back to their starter cards.
For a separate consumer check, extract both ZIPs into the same parent
directory outside the repository, then run `npm install` and
`npm run build` in each extracted project. Set `FOUNTAIN_STARTER_ROOT` to
that parent and run the following from the FountainJS repository.

```sh
pnpm exec playwright test --config playwright.starters.config.ts
```

The recorded workflows use the installed public package in Chromium, Firefox,
and WebKit. They check typed edits, undo and redo, the custom block, and
JSON updates. The automation attaches navigation-to-editable and
click-to-callout timings. These exclude installation and measure this local
setup. One Windows run with Node 24 and npm 11.6.2 measured 224–651 ms to an
editable surface and 62–164 ms from clicking Insert callout to seeing it.
Independent developer onboarding trials remain open.

The React starter uses the full toolbar. Its published-beta production build
triggers Vite's chunk-size warning, with about 622 kB raw JavaScript in one
chunk. The plain DOM build emits about 383 kB of raw JavaScript.
