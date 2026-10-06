# Local verification evidence

Selected small verification summaries are committed here. Their capture, video,
trace, and log paths identify evidence retained in the original local checkout;
those large generated files are not part of this repository. A hash records which
capture was reviewed, not a claim that the capture is included in a fresh clone.

Reproduce current browser journeys with `pnpm exec playwright test --config
playwright.input-audit.config.ts`. This isolated configuration records video and
traces and does not reuse the user's demo server. Individual summaries describe
the exact test filters, source snapshots, review scope, failures, and limitations.

The homepage spacing regression covers desktop and narrow viewports. It is not
physical mobile-device or native Safari certification. The export-fidelity
summaries likewise distinguish browser screen evidence from native Word/PDF
layout certification.
