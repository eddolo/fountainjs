import { onMount } from 'svelte';
import { derived, readonly, writable, type Readable } from 'svelte/store';
import { createEditor, type Editor, type EditorConfig, type EditorState } from '../core';
import { EditorView, type EditorFocusPosition, type EditorViewOptions } from '../view';

/** Call during component initialization. Owns one client editor until unmount. */
export function createFountain(config: EditorConfig | (() => EditorConfig)): Readable<Editor | null> {
  const editor = writable<Editor | null>(null);
  onMount(() => {
    const owned = createEditor(typeof config === 'function' ? config() : config);
    editor.set(owned);
    return () => { editor.set(null); owned.destroy(); };
  });
  return readonly(editor);
}

/** Lazily subscribes while observed, switching and releasing engine subscriptions. */
export function fountainState(source: Readable<Editor | null>): Readable<EditorState | null> {
  return derived<Readable<Editor | null>, EditorState | null>(source, (editor, set) => {
    if (!editor || editor.isDestroyed) { set(null); return; }
    set(editor.state);
    return editor.subscribe(state => set(state));
  }, null);
}

export interface FountainEditorParameters {
  editor: Editor | null;
  options?: EditorViewOptions;
}

export interface FountainEditorAction {
  readonly view: EditorView | null;
  focus(position?: EditorFocusPosition): void;
  update(parameters: FountainEditorParameters): void;
  destroy(): void;
}

/** Svelte use: action. Owns only the DOM view, never the supplied editor. */
export function fountainEditor(element: HTMLElement, initial: FountainEditorParameters): FountainEditorAction {
  let currentEditor: Editor | null = null;
  let currentOptions: EditorViewOptions | undefined;
  let view: EditorView | null = null;
  let destroyed = false;
  const action: FountainEditorAction = {
    get view() { return view; },
    focus: position => view?.focus(position),
    update(parameters) {
      if (destroyed) return;
      if (parameters.editor === currentEditor && parameters.options === currentOptions) return;
      view?.destroy(); view = null;
      currentEditor = parameters.editor;
      currentOptions = parameters.options;
      if (currentEditor && !currentEditor.isDestroyed) view = new EditorView(element, currentEditor, currentOptions);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      view?.destroy(); view = null; currentEditor = null; currentOptions = undefined;
    },
  };
  action.update(initial);
  return action;
}
