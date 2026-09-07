# Angular integration

**Unreleased:** this entry is in the repository build. The existing npm release
does not contain it; publication remains gated on the full release objective.
Run `pnpm build` to try this checkout.

`fountainjs-editor/angular` provides `createFountain`, `fountainState` and the
standalone `FountainEditorDirective`. Angular 22 is an external optional peer;
other Fountain entry points do not load it. Angular owns the surrounding UI and
signals; Fountain owns document transactions, history and the editable DOM.

## A standalone component

```ts
import { Component } from '@angular/core';
import { StarterKit, toggleMark } from 'fountainjs-editor';
import { createFountain, fountainState, FountainEditorDirective } from 'fountainjs-editor/angular';

@Component({
  standalone: true,
  imports: [FountainEditorDirective],
  template: `
    <button [disabled]="!editor()" (mousedown)="$event.preventDefault()" (click)="bold()">Bold</button>
    <div [fountainEditor]="editor()" [fountainOptions]="options"></div>
    <p>{{snapshot()?.doc.textContent.length ?? 0}} characters</p>
  `,
})
export class ArticleEditor {
  readonly editor = createFountain(() => ({
    schema: StarterKit.schema,
    plugins: StarterKit.plugins,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  }));
  readonly snapshot = fountainState(this.editor);
  readonly options = { ariaLabel: 'Article editor', placeholder: 'Start writing…' };
  bold() { const editor = this.editor(); if (editor) toggleMark(editor, 'strong'); }
}
```

Include `fountainjs-editor/styles.css` in your application's global styles, or
provide your own. The directive does not impose toolbar, theme or document CSS.
Use the ordinary Angular application build/linker, not a TypeScript-only
transpiler, for the directive and your templates.

## Ownership and reactive state

- Call the helpers in an Angular injection context, normally component field
  initializers or constructors. Calls outside a context fail explicitly.
- `createFountain(configOrFactory)` returns a readonly `Signal<Editor | null>`.
  A client post-render callback creates the engine once; its owning `DestroyRef`
  disposes it. A factory is preferable when configuration reads component inputs.
- Configuration is initial, not a reactive document binding. Do not recreate an
  editor for every signal change. Dispatch commands/transactions; deliberately
  replace a keyed owner component when starting a different session.
- `fountainState(editorSignal)` returns a readonly signal of the final immutable
  `EditorState`, or null. Its Angular effect switches the engine subscription
  and cleans up on scope destruction. Signal/DOM updates follow Angular's
  scheduling; the engine transaction itself remains synchronous.
- No Angular proxy wraps the editor, schema or document. Store serializable
  data with `editor.getJSON()`, rather than attempting to serialize its signal.
- The directive accepts an externally owned editor too. Destroying the directive
  never destroys the supplied engine. The application's owner must do that.
- An `@if` around the directive host can hide/reopen the view without losing the
  owner's document or history. Destroying the owner ends the session. Route
  persistence requires application-owned storage or a longer-lived owner.

The directive's `fountainOptions` input forwards `EditorViewOptions`, including
paste reports, image/asset upload adapters, accessibility, block handles and
virtualization. Keep the options object stable. A new editor/options identity
rebuilds the DOM view, not the engine/history. Custom renderer signal reads do
not become accidental dependencies that rebuild the whole view.

The directive exports itself as `fountainEditor`. Use `#surface="fountainEditor"`
for its `view` getter and `focus('current' | 'start' | 'end')` method. Angular
owns the host element only: do not bind `innerHTML`, `ngModel`, or Angular child
templates inside it. Use the logical engine selection and commands. Formatting
buttons preserve native mouse selection with `preventDefault()` as above.

The supplied helpers initialize the editor/view outside `NgZone`; accepted
state updates notify Angular through signals. The campaign demo uses zoneless
change detection with `OnPush` components. This is not a guarantee about every
third-party zone-dependent plugin; test application-specific integrations.

## Persistence, providers and end-user policy

Save accepted changes through `EditorConfig.onUpdate`, checking
`transaction.docChanged`. Debouncing, storage, access control, conflict handling
and errors belong to the host. Supply collaboration plugins as for any Fountain
surface, and use adapter replacement when changing rooms instead of recreating
the whole engine during rendering.

`editable: false` is a presentation/input policy, not authorization. Enforce
permissions in your storage/provider backend. For a finished reader experience,
use a reader projection without the campaign demo's authoring controls.

Upload handlers belong to `fountainOptions`, not the document schema. Return a
validated persistent asset URL from your storage service. The demo embeds the
actual selected PNG/JPEG/GIF/WebP bytes locally; it does not send them to a server.
Other media uploads explicitly request a host adapter, rather than substituting
a stock file or weakening the engine's URL validation. Local-image files are
limited to 10 MiB. The existing remote audio, video and attachment fixtures can
be selected, edited and deleted independently of that upload boundary.

## Compilation and server rendering

The Angular entry is **ESM, partial-Ivy**, compiled by Angular's compiler.
Its declaration includes the directive/input metadata needed by Angular's
template checker. A normal consuming Angular application links it into its
own build. Fountain does not bundle Angular or the JIT compiler, and it does
not offer a separate CommonJS Angular build. Other Fountain entry points keep
their existing ESM/CommonJS contracts.

This follows Angular's [library distribution guidance](https://angular.dev/tools/libraries/creating-libraries#publishing-libraries).
The repository isolates Angular's TypeScript 6 compiler requirement in
`tools/angular-build`; the document engine still builds with TypeScript 7.
`pnpm build:angular` emits the partial library, then fully compiles the campaign
demo. A build-time Babel linker connects the demo consumer without shipping a
browser JIT compiler. These development tools do not become runtime dependencies.

Client-only [post-render callbacks](https://angular.dev/api/core/afterNextRender)
leave the editor and host inert during Angular server rendering: no editor
factory, view or provider is started. For document content in server HTML, use
Fountain's headless serializer/reader projection instead. The Angular SSR test
uses Angular's own server renderer (including its DOM emulation), not a claim
that Angular itself is a DOM-free document processor. Fountain's separate
`/core` entry remains the enforced no-DOM engine boundary.

## Demo and verification

The [Angular campaign demo](https://eddolo.github.io/fountainjs/demos/angular-media.html)
uses compiled Angular components, a directive and signals for the actual
editor, toolbar, metadata controls and inspector. React hosts the gallery
navigation only. Source: `examples/angular/campaign.ts` and
`campaign-editor.html`; generated application code is not committed.

`tests/angular-lifecycle.test.ts` checks client ownership, view remount/history,
custom-block disposal before engine destruction, external editor replacement,
options, signals and injection-context errors. `tests/angular-ssr.test.ts`
checks inert rendering with Angular's real server renderer. The browser journey
uses keyboard editing, reverse selection, formatting, attachment selection,
metadata editing, deletion/undo, exact local-image bytes, view remounts,
Markdown output and repeated owner resets. A separate recorded journey is
available under `tests/manual`.

The demo component host has explicit block layout; an inline custom host caused
intermittent WebKit control-visibility failures during the audit. Metadata
drafts track the selected node's metadata signature, not every selection update.
The external YouTube fixture can be unavailable: embed URL/sandbox validation
is not a guarantee of third-party playback or availability.

This binding does not provide an Angular version of every optional React panel,
or prove older Angular majors, every form-library integration, physical-device
IME, or screen-reader accessibility. Those remain explicit verification work.
