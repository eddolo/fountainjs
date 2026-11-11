import {
  computed, defineComponent, getCurrentInstance, getCurrentScope, h, mergeProps, onBeforeUnmount,
  onMounted, onUnmounted, onScopeDispose, shallowReadonly, shallowRef, toRaw, toValue, watch,
  type MaybeRefOrGetter, type PropType, type ShallowRef,
} from 'vue';
import { createEditor, EditorState, Plugin, type Editor, type EditorConfig, type Node, type NodeJSON } from '../core';
import { COLLABORATION_REMOTE_META } from '../extensions/collaboration-core';
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

export interface FountainDocumentFieldHandle {
  readonly editor: Editor | null;
  focus(position?: EditorFocusPosition): void;
}

const modelWrite = 'fountain$vueDocumentField';

/** An owned document editor with a portable JSON Vue v-model. */
export const FountainDocumentField = defineComponent({
  name: 'FountainDocumentField',
  inheritAttrs: false,
  props: {
    modelValue: { type: Object as PropType<NodeJSON | null>, default: null },
    config: { type: Object as PropType<Pick<EditorConfig, 'schema' | 'plugins'>>, required: true },
    options: { type: Object as PropType<EditorViewOptions>, default: undefined },
    disabled: Boolean,
  },
  emits: {
    'update:modelValue': (_value: NodeJSON) => true,
    blur: (_event: FocusEvent) => true,
  },
  setup(props, { attrs, emit, expose }) {
    const surface = shallowRef<FountainEditorHandle | null>(null);
    let lastPublished: NodeJSON | undefined;
    let replacing = false;
    const editor = useFountain(() => {
      const { schema, plugins = [] } = toRaw(props.config);
      const guard = new Plugin({ filterTransaction: tx => replacing || !props.disabled
        || !tx.docChanged || tx.getMeta(COLLABORATION_REMOTE_META) === true });
      return {
        schema,
        content: props.modelValue ?? undefined,
        plugins: [guard, ...plugins],
        onUpdate: (state, transaction) => {
          const requested = transaction.getMeta<Node>(modelWrite);
          if (!transaction.docChanged || requested?.eq(state.doc)) return;
          lastPublished = state.doc.toJSON();
          emit('update:modelValue', lastPublished);
        },
      };
    });
    watch(() => props.modelValue, (value) => {
      const current = editor.value;
      const reflected = toRaw(value) === lastPublished;
      lastPublished = undefined;
      if (!current || reflected) return;
      const schema = current.state.schema;
      const next = EditorState.create({ schema, doc: value ? schema.nodeFromJSON(value) : undefined });
      if (next.doc.eq(current.state.doc)) return;
      const transaction = current.createTransaction().replaceDocument(next.doc)
        .setSelection(next.selection).setStoredMarks(next.storedMarks)
        .setMeta('content$replace', true).setMeta('addToHistory', false)
        .setMeta('history$reset', true).setMeta(modelWrite, next.doc);
      replacing = true;
      try {
        if (!current.dispatch(transaction)) throw new Error('The Fountain form field rejected the document.');
      } finally {
        replacing = false;
      }
    });
    const viewOptions = computed(() => props.disabled ? {
      ...props.options,
      attributes: { ...props.options?.attributes, contenteditable: 'false', tabindex: '-1', 'aria-disabled': 'true' },
    } : props.options);
    const focusOut = (event: FocusEvent) => {
      const host = event.currentTarget as HTMLElement;
      const NodeClass = host.ownerDocument.defaultView?.Node;
      if (!props.disabled && !(NodeClass && event.relatedTarget instanceof NodeClass && host.contains(event.relatedTarget))) {
        emit('blur', event);
      }
    };
    expose({
      get editor() { return editor.value; },
      focus(position) { if (!props.disabled) surface.value?.focus(position); },
    } satisfies FountainDocumentFieldHandle);
    return () => h(FountainEditor, mergeProps(attrs, {
      editor: editor.value,
      options: viewOptions.value,
      inert: props.disabled || undefined,
      onFocusout: focusOut,
      ref: surface,
    }));
  },
});
