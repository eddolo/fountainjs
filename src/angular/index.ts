import {
  afterNextRender, afterRenderEffect, assertInInjectionContext, DestroyRef,
  Directive, effect, ElementRef, inject, input, NgZone, signal, untracked, type Signal,
} from '@angular/core';
import { createEditor, type Editor, type EditorConfig, type EditorState } from 'fountainjs-editor/core';
import { EditorView, type EditorFocusPosition, type EditorViewOptions } from 'fountainjs-editor';

/** Call in an Angular injection context. The owning scope creates/disposes one client editor. */
export function createFountain(config: EditorConfig | (() => EditorConfig)): Signal<Editor | null> {
  assertInInjectionContext(createFountain);
  const owner = inject(DestroyRef);
  const zone = inject(NgZone);
  const editor = signal<Editor | null>(null);
  afterNextRender(() => {
    if (!owner.destroyed) zone.runOutsideAngular(() => {
      editor.set(createEditor(typeof config === 'function' ? config() : config));
    });
  });
  owner.onDestroy(() => {
    const owned = editor(); editor.set(null); owned?.destroy();
  });
  return editor.asReadonly();
}

/** Tracks immutable engine state and releases subscriptions with its Angular scope. */
export function fountainState(source: Signal<Editor | null>): Signal<EditorState | null> {
  assertInInjectionContext(fountainState);
  const snapshot = signal<EditorState | null>(null);
  effect(onCleanup => {
    const editor = source();
    untracked(() => {
      snapshot.set(editor && !editor.isDestroyed ? editor.state : null);
      if (editor && !editor.isDestroyed) onCleanup(editor.subscribe(state => snapshot.set(state)));
    });
  });
  inject(DestroyRef).onDestroy(() => snapshot.set(null));
  return snapshot.asReadonly();
}

/** Angular owns the host; the directive owns only its DOM view, never its supplied engine. */
@Directive({ selector: '[fountainEditor]', standalone: true, exportAs: 'fountainEditor' })
export class FountainEditorDirective {
  readonly editor = input<Editor | null>(null, { alias: 'fountainEditor' });
  readonly options = input<EditorViewOptions | undefined>(undefined, { alias: 'fountainOptions' });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private currentView: EditorView | null = null;
  get view(): EditorView | null { return this.currentView; }
  focus(position?: EditorFocusPosition): void { this.currentView?.focus(position); }

  constructor() {
    afterRenderEffect(onCleanup => {
      const editor = this.editor(), options = this.options();
      if (!editor || editor.isDestroyed) return;
      untracked(() => this.zone.runOutsideAngular(() => {
        this.currentView = new EditorView(this.host.nativeElement, editor, options);
      }));
      onCleanup(() => { this.currentView?.destroy(); this.currentView = null; });
    });
  }
}
