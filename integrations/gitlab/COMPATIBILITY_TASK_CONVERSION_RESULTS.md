# Matched checklist-to-child conversion audit — 2026-11-17

The real GitLab CE 19.5.3/Fountain comparison records **25 parity checks, one
strict UI-structure regression and six shared-limitation checks** across two
workflows. Both collections completed and the environment matched. **Neither the
regression gate nor feature acceptance passes.** These are correlated checks,
not independent features or a product-wide percentage.

## What the actual UI did

The plain and direction-wrapped profiles start with the same heading, four
checklist items, a nested item, bold text, a link and a fenced Python function.
The author appends a marker through rich editing and saves. The reader's real
**Convert to child item** menu opens GitLab's New task modal. The audit inspects
its untouched rich content and presses Create task without repairing the prefill.
It follows the actual child link, verifies persisted source and parent identity
through a read-only GraphQL query, and reloads both editors.

Both implementations create actual Task records linked to the right parent.
The target checklist item is removed, its nested checklist item is retained and
outdented, the other two checklist items survive, and backend task counts become
three with one complete. Bold text, the link and the Python fence language survive.
Both parent issues remain Open. API writes create fixtures only; all editing,
conversion and creation use normal UI controls.

## Confirmed shared source loss

Before conversion, both editors and the server-rendered readers contain:

```python
def identity(value):
    return value
```

In both untouched creation modals, saved child descriptions and reopened child
editors, the `return` line loses all four leading spaces. This changes Python
semantics. The three correlated failures in each profile remain unmet requirements,
not parity passes merely because both implementations lose the same content.

The owner is GitLab's shared frontend `deleteTaskListItem` helper in
`app/assets/javascripts/issues/show/utils.js`: description extraction calls
`trimStart()` on every line. `work_item_description_rendered.vue` passes that
result into child creation and removes the checklist source after creation.
Both source files were verified byte-for-byte against the pinned GitLab commit;
[ownership hashes](../../artifacts/gitlab-compatibility/task-conversion-20261117/upstream-ownership.json)
record the paths and line references. This is not evidence of a Tiptap parser defect
or a Fountain transaction defect. No production repair has been applied here.

The next repair must remove structural list indentation while preserving relative
source indentation, and retain the existing nested-checklist behavior. It needs
ordered/nested list, fenced/indented code and whitespace coverage, then another
real UI pair. Changing the expected Python text to the damaged version is not a fix.

## Additional Fountain UI difference retained

The direction-wrapped parent reopens with an additional empty paragraph in the
Fountain DOM graph. The original has only the intended marker paragraph. The
strict parent-graph invariant therefore reports one regression. This is a UI
structure difference; this audit does **not** prove saved document corruption:
its persisted source has no extra paragraph content.

The engine has an explicit automatic trailing-caret repair with provenance in
`src/extensions/trailing-editable-block.ts` and `src/core/editing-provenance.ts`.
That is a possible explanation, not proof about this particular captured DOM node.
The audit does not ignore all empty paragraphs. Qualification requires capturing
its actual DOM/model provenance and checking typing, Save/reopen and export before
deciding whether the observer should exclude a known cursor affordance or whether
the product needs repair. The failing comparison remains unchanged meanwhile.

## Evidence, observer corrections and limits

The accepted collection pair is **original-4 / fountain-1**. Earlier original
attempts are retained and not scored: attempt 1 matched parent and nested menu
buttons; attempt 2 checked the source-mode switch before the editor finished
mounting; attempt 3 looked up the old exact marker text after typing changed it.
The corrected collector verifies button ownership, waits for mounted rich content
and UI settling, and requires the new marker in persisted source before proceeding.
The source switch exists; its earlier absence was an observation-timing mistake.

The comparison normalizes only outer LF delimiters of the child description.
It does not trim code indentation, normalize Unicode, rewrite Markdown or repair
any failed UI step. Actual editor identity is checked in parent, modal and child.
Source/API receipts and PNGs are retained; credentialed recordings are not retained.

All **1,462 integration tests / 57 files** and strict TypeScript pass. Eleven
unchanged prior corpora retain their exact classification and gate results under
the extended comparator; those replays are not fresh browser executions. Unit
checks validate the classification policy, not the real application outcome.
No engine, native runtime, backend, dependency, public API, budget, version or
publication change was made. Broader roles, browsers and product acceptance remain
open. GitHub push and hosted CI are still pending CLI sign-in.

Original PNGs were visually inspected for the plain creation prefill, linked child
and reopened child, and scoped reopened parent. Fountain PNGs were inspected for
both prefills, the plain reopened child and scoped reopened parent. The images
confirm the flattened code, retained nested checklist and real parent/child UI.
The native integration-incomplete warning remains visible and accurate.

- [Comparison with failing gate](../../artifacts/gitlab-compatibility/task-conversion-20261117/comparison-1/report.md)
- [Original report](../../artifacts/gitlab-compatibility/task-conversion-20261117/original-4/report.json)
- [Fountain report](../../artifacts/gitlab-compatibility/task-conversion-20261117/fountain-1/report.json)
- [Validation and source hashes](../../artifacts/gitlab-compatibility/task-conversion-20261117/validation.json)
- [Prior-corpus interpretation replay](../../artifacts/gitlab-compatibility/task-conversion-20261117/prior-corpus-replay.json)
- [Fixture](fixtures/compatibility-task-conversion.json)
- [Collector](../../scripts/audit-gitlab-compatibility-task-conversion.mjs)

Run the guarded compatibility runner sequentially with a fresh immutable run ID,
`--suite task-conversion` and each editor side. This checkpoint is a saved audit
finding, not a release-ready claim of successful technical-content conversion.
