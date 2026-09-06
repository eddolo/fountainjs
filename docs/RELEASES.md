# Release and API stability policy

FountainJS is currently a `0.x` public beta. “Beta” is not permission for
unannounced breakage: every release must state what changed, keep persisted data
recoverable, and pass the same public package/browser gates used during
development.

## Stability levels

| Surface | Current level | Compatibility rule |
| --- | --- | --- |
| Persisted versioned document envelope | Stable format v1 | Readers fail closed on unknown future versions. A format bump requires a sequential migration and fixtures. |
| Bare historical `NodeJSON` | Supported legacy encoding | Interpreted as format v1 by the migration entry. New persistence should write an envelope. |
| Extension manifest/API integer | Versioned beta contract | Incompatible runtime changes require a new `FOUNTAIN_EXTENSION_API_VERSION`; `doctor` rejects mismatches. |
| Exported package APIs and subpaths | Public beta | Patch releases must be backward compatible. Before 1.0, a minor may break an API only with release notes and a migration path; deprecation first is required when practical. |
| Persisted node/mark names and attributes | Schema contract | A breaking shape change requires a document-format migration, not only a TypeScript rename. |
| Files under `src/` not reachable through package exports | Internal | No compatibility promise. Consumers must not deep-import them. |
| Experimental host/provider integrations | Public beta and replaceable | Trust, network, cost, and availability remain controlled by the host adapter. |

After 1.0, ordinary SemVer applies: breaking public API changes require a major
release, additive capabilities a minor release, and compatible fixes a patch.
Document-format and extension-API versions remain independent so consumers can
reason about stored data and extension loading without guessing from npm SemVer.

## Deprecation policy

- Mark a deprecated export in TypeScript declarations and documentation.
- Name the replacement and include a before/after example.
- Keep it for at least one beta minor release when security and correctness
  allow. After 1.0, keep it until the next major release.
- Record removal in `CHANGELOG.md` and provide an automated transform or a
  mechanical migration recipe when possible.
- Security vulnerabilities, data-corrupting behavior, and impossible-to-safely-
  emulate APIs may be removed faster; the release notes must explain why.
- Never silently reinterpret persisted JSON. Use the document migration
  contract in [MIGRATIONS.md](MIGRATIONS.md).

No public API is currently scheduled for removal.

## Required release evidence

A release is eligible for npm staging only when all of the following are true:

1. `package.json` contains a valid SemVer and the GitHub tag is exactly
   `v<version>`.
2. `CHANGELOG.md` contains a heading for that version and the `Unreleased`
   section contains no pending entries.
3. `pnpm check` passes the production build, reviewed public-declaration
   snapshot, packed-package imports, size and performance budgets, TypeScript,
   and all behavioral tests.
4. `publint` and Are the Types Wrong pass for every public entry.
5. `pnpm pack --dry-run` shows only intended public files.
6. the complete Chromium, Firefox, WebKit, Pixel/Chromium, and iPhone/WebKit
   suite passes for changes that affect the editor/browser surface;
7. user-facing documentation and the deployed demos describe the same version
   and limitations;
8. security-sensitive changes include adversarial tests and updated trust
   boundaries.
9. the emitted server HTML entry runs without browser globals in Node, Bun,
   Deno, and Cloudflare `workerd`.
10. changes to the reference Lean checker pass `pnpm test:lean-integration`
    against the pinned real Lean toolchain; mocked provider tests alone are not
    release evidence.

`scripts/check-release.mjs` enforces items 1 and 2. The GitHub Publish npm
workflow runs it from a published release event before the complete package
gate. The workflow uses npm trusted publishing/OIDC, stages the package with
provenance, and leaves the final npm approval behind maintainer 2FA. No
long-lived npm token belongs in GitHub or the repository.

## Release procedure

1. Finish one ledger outcome and collect its public CI/browser/deployment
   evidence.
2. Move all relevant `Unreleased` notes under a dated/versioned heading.
3. Bump `package.json` and update examples/docs that display the version.
   If the exported TypeScript surface intentionally changed, review SemVer and
   deprecation impact, update the changelog, build, then run
   `pnpm test:api -- --write` and review `api-surface.json`.
4. Run:

   ```sh
   node scripts/check-release.mjs
   pnpm check
   bun scripts/smoke-server-html-runtime.mjs
   deno run --allow-read scripts/smoke-server-html-runtime.mjs
   pnpm test:browser
   pnpm audit:ui
   pnpm dlx publint@0.3.24
   pnpm dlx @arethetypeswrong/cli@0.18.5 --pack . --entrypoints . ./core ./ai/document-tools ./ai/conversation ./ai/generated-media ./document-utilities ./emoji-data ./react ./yjs ./comments ./react/comments ./tracked-changes ./react/tracked-changes ./versions ./react/versions ./details ./ruby ./text-style ./testing ./migrations ./node-ids ./structured-attributes ./html/server ./widgets ./widgets/dom ./react/widgets ./pages ./pages/dom ./pages/preview
   pnpm pack --dry-run
   ```

   Do not treat `pnpm audit:ui` as another assertion-only test. Watch the
   generated WebM under `artifacts/manual-ui-audit/` and inspect its screenshots
   for clipped controls, invisible state, unexpected scrolling, selection
   discontinuities, or document/output disagreement before approving release.

5. Commit the release, create the exact `v<version>` tag, and publish the GitHub
   release from that tag.
6. Inspect the public Publish npm run. If it stages successfully, inspect the
   package name, version, provenance, files, README, and dependency list on npm,
   then approve with maintainer 2FA.
7. Verify clean installation in an empty consumer and check the live website.
8. Add the immutable release/run links to the parity ledger.

The release workflow must never publish from an arbitrary branch head or infer
a version from a GitHub release title.

## Failure and rollback policy

npm versions are immutable. Do not overwrite or casually unpublish a bad
release. Stop approval while a package is staged. If a published release is
faulty, deprecate that exact version when appropriate, publish a corrected patch
through the full gate, and document affected data/API behavior. For a document
format defect, preserve original records and ship a tested forward repair; do
not destructively rewrite data without backups and concurrency checks.

GitHub Pages may be redeployed from a known-good commit, but documentation must
clearly identify the npm version it describes.

## Security support

The latest published beta minor receives security fixes. Older beta minors are
unsupported unless a release note explicitly extends their window. Reporting,
response expectations, supply-chain boundaries, and disclosure rules are in
[SECURITY.md](../SECURITY.md).
