# Installed starter release audit

The required `recorded-ui` CI job checks the candidate in standalone plain DOM,
React and Node projects. This complements the production-site download tests:
those compare the ZIP contents with the source; this audit installs the same
starter source and exercises the packed library outside the checkout.

From a checkout, use Node 24 and the repository's pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm audit:starters:prepare
pnpm audit:starters
```

Preparation creates a fresh OS temporary directory and packs the current
candidate there. Each starter's single Fountain dependency is changed from its
pinned registry version to that tarball because the candidate is unpublished.
All other starter files are checked byte for byte. Dependencies are installed
without workspace resolution or automatic peer installation. All installed
distribution files must match the checkout's build. Plain DOM and React then
build using their own installed Vite; their preview servers have no repository
aliases or inherited Vite configuration.

The existing browser journeys run in Chromium, Firefox and WebKit. They type
and edit a custom callout, select text backward, apply bold, undo/redo and check
the resulting document JSON. Uncaught application errors fail the journeys.
These are production-bundle consumer checks; they do not replace development
Strict Mode/lifecycle, physical-device, accessibility or full-feature testing.

The Node starter is exercised as supplied for JSON, exact untouched Markdown,
HTML export and HTML reimport. A Node 24 probe additionally blocks resolution
of React, React DOM, Yjs and jsdom, verifies that browser globals are absent,
and imports the package/schema and runs the Markdown CLI. Blocking is explicit
because ancestor-level packages on a developer machine can otherwise hide an
unwanted dependency. This restriction is test instrumentation, not a constraint
on applications that intentionally use those optional modules.

Evidence is in `artifacts/installed-starters/`: the tested tarball, its hash and
consumer locations in `projects.json`, install/build logs, Node outputs and
browser recordings, traces, screenshots and reports. Each preparation uses a
new temporary directory; the receipt is marked complete only after all three
projects pass preparation. Temporary consumers remain available for debugging.
Run preparation again before testing another candidate. CI uploads the evidence
after success or failure, with the usual seven-day retention.

This uses pnpm to install the local archive. It does not establish publication,
an npm-CLI installation or a registry consumer check. The final release still
needs hosted CI, matched package/tag metadata, registry verification and the
documented browser/export review.
