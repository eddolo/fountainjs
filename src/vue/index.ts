import {
  defineComponent, getCurrentInstance, getCurrentScope, h, onBeforeUnmount,
  onMounted, onUnmounted, onScopeDispose, shallowReadonly, shallowRef, toValue, watch,
  type MaybeRefOrGetter, type PropType, type ShallowRef,
} from 'vue';
import { createEditor, type Editor, type EditorConfig, type EditorState } from '../core';
import { EditorView, type EditorFocusPosition, type EditorViewOptions } from '../view';

/** Creates one client-side editor per component mount; the composable owns disposal. */
export function useFountain(config: EditorConfig | (() => EditorConfig)): Readonly<ShallowRef<Editor | null>> {
  if (!getCurrentInstance()) throw new Error('useFountain must be called synchronously in Vue setup().');
  const editor = shallowRef<Editor | null>(null);
  onMounted(() => { editor.value = createEditor(typeof config === 'function' ? config() : config); });
  onUnmounted(() => {
    const owned = editor.value;
    editor.value = null;
    owned?.destroy();
  });
  return shallowReadonly(editor);
}

/** Tracks immutable engine state without deeply proxying the editor, schema, or document. */
export function useFountainState(source: MaybeRefOrGetter<Editor | null>): Readonly<ShallowRef<EditorState | null>> {
  if (!getCurrentScope()) throw new Error('useFountainState requires an active Vue effect scope.');
  const state = shallowRef<EditorState | null>(null);
  const stop = watch(() => toValue(source), (editor, _previous, onCleanup) => {
    state.value = editor && !editor.isDestroyed ? editor.state : null;
    if (editor && !editor.isDestroyed) {
      onCleanup(editor.subscribe((next) => { state.value = next; }));
    }
  }, { immediate: true, flush: 'sync' });
  onScopeDispose(() => { stop(); state.value = null; });
  return shallowReadonly(state);
}

export interface FountainEditorHandle {
  readonly view: EditorView | null;
  focus: (position?: EditorFocusPosition) => void;
}

/** Vue owns the host element; EditorView exclusively owns its editable descendants. */
export const FountainEditor = defineComponent({
  name: 'FountainEditor',
  inheritAttrs: false,
  props: {
    editor: { type: Object as PropType<Editor | null>, default: null },
    options: { type: Object as PropType<EditorViewOptions>, default: undefined },
  },
  setup(props, { attrs, expose }) {
    const mount = shallowRef<HTMLElement | null>(null);
    let view: EditorView | null = null;
    const handle: FountainEditorHandle = {
      get view() { return view; },
      focus: position => view?.focus(position),
    };
    expose(handle);
    const destroyView = () => { view?.destroy(); view = null; };
    watch([mount, () => props.editor, () => props.options], ([element, editor]) => {
      destroyView();
      if (element && editor && !editor.isDestroyed) view = new EditorView(element, editor, props.options);
    }, { flush: 'post' });
    onBeforeUnmount(destroyView);
    // Fallthrough attributes style/label the host. Use options for the editable surface.
    return () => h('div', { ...attrs, 'data-fountain-root': '', ref: mount });
  },
});
