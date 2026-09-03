# Security policy

## Supported versions

Security fixes are provided for the latest published minor version while FountainJS is in public beta.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for `eddolo/fountainjs`. Do not open a public issue containing an exploit, credential, or sensitive document data.

Include the affected version, impact, reproduction, and any suggested mitigation. You can expect an acknowledgement within seven days.

## Security boundaries

FountainJS safely escapes its built-in HTML exporter and filters unsafe URL protocols. Custom node views, DOM specs, imported extension code, application-provided MCP endpoints, and custom fetch implementations remain application trust boundaries. Never expose permanent service credentials in browser code.
