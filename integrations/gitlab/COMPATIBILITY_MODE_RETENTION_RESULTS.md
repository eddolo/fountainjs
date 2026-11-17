# Native GitLab model retention across editing modes — 2026-11-17

The recorded **original-5 / fountain-5** pair passes the 64 declared requirements:
**52 parity, 12 improvement, zero regression, zero shared-limitation and zero
incomplete checks**. These are correlated checks for text/empty drafts during
full membership removal, not 64 independent features or full GitLab parity.
The comparison and scoped acceptance gates both pass.

## Observed behavior and ownership

The same actual non-admin, non-author edits root-authored records in the same
pinned private GitLab 19.5.3 deployment. Fresh REST/GraphQL controls prove access
before removal and denial afterwards. UI Save and an independent denied REST
write leave the server description unchanged. Restoring Developer access,
reload/Edit, Save and reopen recover exact pending source without reinjection.
The dedicated account is returned to Guest after each case.

The original host destroys its editor when switching to source. Returning needs
GitLab's renderer, which now refuses access. Its rich surface becomes blank with
a render error. The native replacement now returns its already-owned model,
including heading, link, marks and code indentation, while keeping the failed-Save
warning visible. Empty intent remains empty through recovery and persistence.
The backend still refuses unauthorized reads/writes. This is a host-lifecycle
improvement in Fountain's integration; it does not demonstrate an intrinsic
limitation of ProseMirror or Tiptap.

`services/mode_retention_patch.mjs` retains one component/model per MarkdownEditor
owner using Vue keep-alive. Context identity is captured on actual mode entry,
including renderer/upload paths, form/autosave identity and capability profile.
Changing a capability while the editor is active does not remount its draft.
A different document/profile on re-entry requires a new model and real renderer.
The owner closing destroys the retained instance. The hidden rich submission
input is removed, leaving one successful form control in source mode.

The native component disconnects hidden paste handling and rechecks the existing
unsupported-host configuration validator when activated. A fatal/inactive editor
cannot subscribe to paste. The surface releases its browser view while inactive;
context surfaces detach observers/popups, and link/media hooks close or stop
transient controls. The model, codec source ownership and history stay scoped to
the same component owner. No global Markdown cache or generic parser fallback is
introduced. An exact serialization of a ready owned model also recognizes a fresh
handoff whose transaction intentionally suppressed change events.

Changed source still uses the real GitLab renderer. A failed replacement retains
its source and the previous owned model for explicit recovery. Read-only props,
unknown active host options and existing source/composition handoff guards are
preserved. The private runtime bundle is byte-identical to the preceding repair;
only its provenance gains the installer helper. Public engine, API, dependencies,
version, CSS and budgets are unchanged.

## Verification and visual scope

- **1,573 integration tests / 61 files** and strict TypeScript pass.
- **429 upstream component tests / nine suites** pass, including 15 mounted
  ownership controls. Eight controls fail with the byte-exact previous parent
  renderer and candidate child components, which are restored in `finally`.
- Undo/redo, repeated paste subscription, read-only return, owner/context changes,
  changed source, denied conversion, fresh unreported handoff and unsupported
  host reactivation are exercised through the mounted native components.
- All changed installed lifecycle components and the new spec pass upstream lint.
- **Nine recorded bridge journeys** pass in Chromium, Firefox and WebKit. These
  check the actual compiled surface/handoff/composition contract; they are not
  full running-GitLab or physical IME certification.
- **18 earlier recorded corpora** retain their interpretation summaries/gates.
  Replay is not new browser execution.
- Guarded source rollback restores exact host boundaries and reinstalls all
  **32 files** with identical digests. Compiled deployment rollback is unclaimed.

The older bridge compiler rejected existing native inline styles before browser
startup. It now includes ordinary unscoped CSS as virtual CSS modules, with six
regressions retaining actual surface CSS and refusing scoped/external/language
styles, custom blocks and missing templates. No guard or acceptance limit was
removed. Its initial startup failure is retained and is not an editor test result.

The shallow retention fixture did not exercise Vue caching; those results are
diagnostic. Mounted controls caught the initial active-profile remount and
unreported-source reconversion defects. A jsdom attribute-reflection assertion
was corrected to the real contentEditable property. An incomplete suggestion
fixture crashed the existing Markdown field; valid inactive UI fields now isolate
the unsupported option. Serial test steps and an equivalent raw-route matcher
satisfy lint without suppression. Earlier attempts remain retained.

Four original/native recordings start after authentication, reusing the actual
member session in memory. Selected contact sheets and exact-state PNGs were
visually reviewed. They show original render failure/empty-draft loss and native
warning, rich return and empty reopen. Some intermediate frames show normal
navigation/loading; these are not scored as final states. Raw videos remain
local-only; the review manifest records hashes/durations and committed contact
sheets. The bridge videos/traces remain local fixture evidence. Only selected
bridge PNGs receive visual review, not every frame or every page state.

## Remaining work and release status

Open modal/media/touch mode-switch combinations, large-document retention
endurance, simultaneous active composers, broader roles/offline/racing changes,
other native GitLab browsers/mobile and broader product acceptance remain open.
The generic comment placeholder in the empty description is still copy polish.
Full package/release qualification and hosted CI remain pending. GitHub CLI is
signed out at the checkpoint. The public registry still identifies
`0.4.0-beta.2` as latest; local `0.5.0-beta.1` is absent from the registry.
No publication or overall capability-row promotion occurs here.

[Recorded comparison](../../artifacts/gitlab-compatibility/membership-removal-20261117/comparison-mode-retention/report.md),
[video review](../../artifacts/gitlab-mode-retention-20261117/video-review/manifest.json)
and [validation](../../artifacts/gitlab-mode-retention-20261117/validation.json).
