# Security policy

## Supported versions

Security fixes are provided for the latest published minor version while FountainJS is in public beta.
Older beta minors are unsupported unless a release note explicitly extends
their window. After 1.0, the project will publish a version support matrix here
before ending support for a major line.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for `eddolo/fountainjs`. Do not open a public issue containing an exploit, credential, or sensitive document data.

Include the affected version, impact, reproduction, and any suggested mitigation. You can expect an acknowledgement within seven days.

The acknowledgement confirms receipt, not a guaranteed fix date. The project
will communicate severity, affected versions, mitigations, and a coordinated
disclosure target privately after reproduction. Do not test against systems or
documents you do not own or have permission to inspect.

## Security boundaries

FountainJS safely escapes its built-in HTML exporter and filters unsafe URL protocols. Custom node views, DOM specs, imported extension and migration code, application-provided MCP endpoints, collaboration/providers, upload handlers, and custom fetch implementations remain application trust boundaries. The extension doctor and migration validator execute trusted JavaScript; they are not sandboxes. Never expose permanent service credentials in browser code.

Published releases use npm trusted publishing from the repository's release
workflow. The workflow requests a short-lived OIDC credential and provenance;
no long-lived npm token is stored in GitHub. A maintainer must still inspect and
approve the staged package with npm 2FA. See [docs/RELEASES.md](docs/RELEASES.md).
