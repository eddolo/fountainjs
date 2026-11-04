# Native paragraph spacing bridge (2026-11-04, unmerged)

The DOCX adapter now writes a shared native paragraph style for each portable
spacing group and direct `w:contextualSpacing` on/off declarations. Original
before/after values remain declarations; the adapter never substitutes the
currently computed gap. Omitted spacing in an owned group becomes explicit
zero, avoiding generated Normal-style spacing on reopen.

Groups are independent of paragraph kind. A paragraph, heading and code block
can share the same native style identity. Heading roles use native outline
levels; direct paragraph/run properties retain their generated appearance.
Explicit font, size, emphasis and colour overrides remain authoritative.
CodeChar keeps its own face and inherits paragraph size, matching the generated
legacy styles. Code LF characters become native line breaks and reopen as LF.
CR/CRLF conversion is explicitly reported; this is not byte-preserving code
storage.

## Ownership and platform boundary

`src/docx/paragraph-bridge.ts` owns the mapping. A bounded, internal,
relationship-owned `customXml/fountainParagraphs.xml` part contains only:

- Native paragraph-style IDs paired with opaque portable group identities.
- Code/caption roles bound to a native paragraph ID and its actual document
  part/style. Code roles also retain language and line-number intent.

There are no stored document, formatting, computed-gap or source snapshots to
restore over external edits. Native paragraph declarations and outline levels
remain authoritative. Generated-looking style names alone confer no metadata
ownership. Removing the optional metadata leaves Word's style-based spacing
and native heading outline semantics intact; original opaque group names and
non-native code/caption roles then need their documented fallbacks.

Paragraph IDs are unique within their document part. Ambiguous IDs, changed
native styles or a native heading outline prevent code/caption restoration.
Invalid metadata produces a located warning and falls back to native content.
An orphaned part is not expanded. External/ambiguous/missing relationships do
not restore aliases or roles. Existing ZIP/XML expansion limits still apply;
metadata expansion failures propagate rather than being swallowed as warnings.
The bridge caps native group definitions at 4,000, metadata at 8,000,000 expanded
bytes and role records at the existing 500,000-node bound. It performs no network
access, extension loading or execution.

This is a private DOM-free format boundary. Portable paragraph layout and the
document engine acquire no Word style, namespace or paragraph-ID concepts.

## Verification in progress

The new Node contracts cover all four on/off combinations, distinct/case-sensitive
identities, omitted intent, native declaration edits, metadata removal, native
heading precedence, shared heading/code/caption identity, multiline code,
inline font overrides, per-part body/header/footnote bindings, namespace aliases,
foreign lookalikes, duplicate identities/IDs/roles, invalid languages/roles,
relationship failures and size limits. The retained scientific paper is imported,
exported and reopened with its original 7 pt declarations and zero internal list
gaps. These checks are structural evidence, not independent native-layout proof.

The full suite, recorded public conversion-lab journeys, actual packed consumers,
workerd and independent native PDF comparison are being verified for this source.
No new passing native-render or complete-fidelity claim is made here yet.

## Remaining scope

Quote containers and custom blocks still need a verified native flow mapping.
Image/caption spacing identities can round-trip, but the portable view does not
yet project their adjacency as paragraph flow; the mismatch stays reported.
Multi-paragraph list-item ownership, broader marker/tab behaviour, header
positioning and the source-footnote renderer discrepancy remain separate work.
Existing size and HTML timing failures are not waived. No merge, npm publication
or parity-percentage promotion follows from structural checks.

The native rules are documented by Microsoft:
[contextual spacing](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.contextualspacing?view=openxml-3.0.1),
[outline levels](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.outlinelevel?view=openxml-3.0.1),
and [part-scoped paragraph IDs](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-docx/a0e7d2e2-2246-44c6-96e8-1cf009823615).
