# Local package checkpoint at 235b88fd

This is an unpublished build whose manifest still says `0.4.0-beta.2`. It is
not the registry artifact bearing that version. The installation probe tests
the locally packed candidate, with optional peer auto-installation disabled.

To reproduce, build the `235b88fd` runtime with its frozen lockfile, pack it
with `pnpm pack --pack-destination artifacts/release-preflight-235b88fd`, and
place the resulting tarball beside this file. From `consumer/`, run:

```sh
pnpm --ignore-workspace install --ignore-scripts --no-optional
node verify.mjs
```

The probe verifies ESM and CommonJS schema, extension composition, a text
transaction, exact untouched Markdown source, and server HTML parsing without
browser globals. It does not exercise optional framework or Yjs peers.

`consumer-install.log` and `consumer-verification.log` record the local run.
The tarball and installed dependencies are generated locally and are not
committed. The release policy still requires the final versioned candidate to
pass the complete hosted matrix and publication checks.
