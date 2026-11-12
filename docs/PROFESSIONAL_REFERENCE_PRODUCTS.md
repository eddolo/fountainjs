# Three professional reference products

The requested outcome is three substantial, professional, usable products
showing FountainJS at full strength. Familiar page styling, simulated services,
seeded-only interaction, fake network/collaboration or a description field
inside a branded frame do not satisfy this requirement. The small Todoist-style
task brief remains an integration example; it is not a flagship candidate.

The delivery target is a product a professional team can install, deploy,
operate and evaluate as a replacement for its current editor stack. A polished
showcase is a view into that working product, not a substitute for it. Fixed
fixtures and service doubles remain useful for isolated tests, but cannot be
the evidence for authentication, persistence, collaboration or connected
product workflows.

## GitLab first

The strongest verification route is Fountain inside the real GitLab application.
Retain actual GitLab repositories, project navigation, issue lists/boards,
merge requests, wiki, accounts, APIs, permissions, storage, uploads and services.
Replace the document/editor layer and prove the complete connected workflows
still work. Reimplementing their interfaces with local-only state is insufficient.

The [GitLab integration work area](../integrations/gitlab/README.md) pins the
upstream revision and documents completion requirements. Fountain now mounts in
the actual GitLab issue and discussion composers, with real rendering, uploads,
links, ordinary code, alerts and media properties/playback under verification. Normal account sign-in,
server persistence, private access checks and application restarts are exercised
against the real local GitLab installation. This remains an incomplete integration;
the full workflow/role/surface matrix below is the completion requirement.

## Same standard for the other two

Select substantial products with confirmed Tiptap/ProseMirror use and an actual
integration/implementation route. The earlier Confluence and publishing ideas
are candidates, not verified selections. Closed product source cannot be assumed
available. Where the original is source-available, evaluate running the real app
with Fountain before building a separate product. Provide variety across full
workflows and enough breadth to justify a flagship.

Two source-verified candidates for the remaining slots are Outline (a complete
knowledge-base product) and Directus (a complete content/data-management product).
Outline's own [package manifest](https://github.com/outline/outline/blob/main/package.json)
declares the ProseMirror model, state, view, commands, tables, history and
collaboration bindings. Directus's own [application manifest](https://github.com/directus/directus/blob/main/app/package.json)
declares Tiptap core, Vue 3, tables, images and other editor modules. These are
primary-source stack checks, not completed integration audits, comparisons or
production-ready Fountain implementations. Inspect and pin their actual editor
contracts before committing to their implementation scope.

For each product:

1. Inventory the original's real capabilities and connected workflows at a
   pinned version/edition, with source/API evidence. Keep missing features in
   the matrix rather than removing them to declare completion.
2. Implement every exposed action end to end. Include real authentication,
   authorization, persistence, asset storage, multi-user behavior, failure
   handling and recovery where the product requires them. A successful save
   must survive reload and service restart.
3. Use Fountain for all document/editor surfaces in scope, including comments,
   review and related editors, with preserved source and format semantics.
   Frontend read-only modes cannot replace backend authorization.
4. Reproduce the original's workflows, keyboard behavior and practical document
   breadth. Run original and replacement tests and native human-use recordings;
   visually inspect results, downloaded files and reopened documents.
5. Add working Fountain capabilities that make the resulting product better.
   Candidate improvements include source fidelity, huge-document handling,
   structured identities, review, specialized blocks and import/export. Claim
   advantages only after direct comparable measurements demonstrate them.
6. Deliver reproducible installation/deployment, provider and extension APIs,
   migration/rollback, documented limitations, and developer walkthroughs linked
   to the functioning products. Review resource and operational requirements.
7. Put completed products prominently in the examples hub and developer guide.
   Keep unfinished integration work clearly identified. Do not turn a proposed
   capability matrix or a green isolated test into a claim of 100% readiness.

Release each flagship only after its pinned capability/workflow matrix has
acceptance evidence and its deployment, migration, recovery and rollback
instructions work from a clean environment. Keep unmet original capabilities
visible as blockers. Disabling an action, refusing its content or narrowing the
matrix does not establish replacement parity. Demonstrate any claimed Fountain
advantage against the same original workflow and document workload.

Git hosting, CI runners and other application services remain real host services
in an integrated product. They are not capabilities supplied by the editor engine.
Using their real implementation makes the full product demonstrable while
allowing the engine replacement to be evaluated honestly.
