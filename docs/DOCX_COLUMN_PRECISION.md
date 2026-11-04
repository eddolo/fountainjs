# Fractional table-column retention (unmerged)

Word stores column widths in twentieths of a point; Fountain stores CSS pixels.
The retained scientific paper declares three 3312-unit columns (220.8 px each).
The previous bridge rounded these to 221 px and emitted 3315 units, enlarging the
grid. Import now retains the numeric fraction, and export rounds only once to
native integer units. Cell spans and inferred fixed-table widths sum those exact
native grid integers. Genuine export quantization is reported at the owning cell.

The existing 40–2000 px bounds and 100-column limit remain. The zero sentinel for
an unknown column remains distinct from a known positive width. Safe browser and
server HTML retain fractional and partial grids through authoritative
`data-colwidth`; CSS fallback accepts actual pixel lengths rather than treating
percentages or font-relative units as pixels. Both importers share one DOM-free
reader. The public API/declaration snapshot is unchanged.

Resize, merge/split and history retain unaffected fractions. Pointer resizing
snaps the movement delta, preserving the starting fractional width. A stationary
drag no longer changes data or consumes an undo step. The existing RTL/logical-end
resize contracts remain covered. Live ratios and HTML geometry use the same model.

Focused verification passes 57 cases, including 19 new Node/DOM cases. Three
recorded Chromium/Firefox/WebKit workflows pass actual cell typing, stationary
handle use, a 12 px drag, undo, equation/caption editing, HTML reading and DOCX
download/reopen. Full units pass 3,628 tests across 258 files. Independent native
rendering confirms exact 3312-unit columns and a 496.75 pt painted merged width;
the table remains shifted 0.3 pt horizontally, as described below.

The broad PR browser run passed 847 cases and failed the same DOCX expectation
in three engines. The expectation omitted the newly retained image-paragraph
layout. It now explicitly expects the generated 6 pt / 4 pt spacing and verifies
the corresponding 120 / 80 native-unit XML declaration; complete-document equality
remains required. That journey passes locally in Chromium, Firefox and WebKit
(`artifacts/docx-retention-expectation-browser-20261104.log`). The broad cloud
matrix must still run against this correction. Performance and real Lean cloud
checks passed on the preceding commit. Seven size failures remain; no limit or
runtime code changes are included in this expectation correction.

## Remaining placement boundaries

The source also declares centered table placement; the current table schema does
not retain that declaration. Correct column widths alone do not certify matching
placement, borders, row heights or a full Word page. Header/title and footnote
differences remain separately open.

The header source omits inline drawing distance attributes, while the exporter
writes explicit zeros. LibreOffice 24.2.7.2 initializes horizontal drawing margins
to 319 hundredths of a millimetre and resets them when the corresponding inline
distance attributes occur. This predicts the observed header shift, but a
controlled native variant has not yet verified causality. Do not encode that
renderer default as ordinary Fountain image spacing. The next boundary decision
is faithful source-declaration retention and an explicit receiving-renderer policy.
[Pinned LibreOffice implementation](https://github.com/LibreOffice/core/blob/libreoffice-24.2.7.2/writerfilter/source/dmapper/GraphicImport.cxx#L282).

These are ongoing fidelity repairs. They do not change completion percentages or
authorize a release, new capacity allowance or npm publication.
