# FountainJS 0.5.0-beta.4

## GitLab and Directus

FountainJS passed all six local acceptance gates inside GitLab CE 19.5.3 on editor build `1f16e1b0`. Two application nodes loaded the identified build. During failover, both authors kept their pending wiki edits. After rollback, the stock editor reopened the same wiki and saved another edit. Physical mobile devices and hosted staging still need verification. [Sign-off and rollback evidence](https://github.com/eddolo/fountainjs/blob/v0.5.0-beta.4/integrations/gitlab/COMPATIBILITY_SUITE_PLAN.md)

The Directus 12.7.0 integration is in development. In local Chromium testing, authors edited HTML fields, switched between visual and source editing, and saved file-library images with captions, named sizes and inline placement. The stock editor reopened the same items after switching back. Linked images, restricted-account asset access and broader item workflows remain open. [Directus integration and test results](https://github.com/eddolo/fountainjs/blob/v0.5.0-beta.4/integrations/directus/README.md)

## Editor package

The library adds table-backed charts, spreadsheet paste, native editable chart export to Word and an optional Mermaid adapter. List and quote commands now let host applications control how much of a selection they change. The GitLab and Directus integrations are distributed as source in the repository. [Changelog](https://github.com/eddolo/fountainjs/blob/v0.5.0-beta.4/CHANGELOG.md)

Upgrading an existing Yjs XML room requires the legacy entry or an explicit data migration. [Collaboration upgrade guide](https://github.com/eddolo/fountainjs/blob/v0.5.0-beta.4/docs/YJS_DEFAULT_ADOPTION.md)

## Website

The homepage opens at the top on a fresh visit. Links to Review and Collaboration open those sections, and the embedded demos keep their sample suggestions and comment.
