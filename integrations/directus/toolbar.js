import { computed, defineComponent, h, resolveComponent } from 'vue';
import { canRedo, canUndo, isMarkActive, redo, setBlockType, toggleList, toggleMark, undo } from '../../src/index';
import { selectedBlockPaths } from '../../src/core/block-range';
import { useFountainState } from '../../src/vue';

const marks = {
  bold: ['Bold', 'format_bold', 'strong'],
  italic: ['Italic', 'format_italic', 'em'],
  underline: ['Underline', 'format_underlined', 'underline'],
  strikethrough: ['Strikethrough', 'strikethrough_s', 'strike'],
  subscript: ['Subscript', 'subscript', 'subscript'],
  superscript: ['Superscript', 'superscript', 'superscript'],
};
const actions = new Map(Object.entries(marks).map(([key, [label, icon, mark]]) => [key, {
  label, icon, run: editor => toggleMark(editor, mark), pressed: editor => isMarkActive(editor, mark),
}]));
actions.set('undo', { label: 'Undo', icon: 'undo', run: undo, available: canUndo });
actions.set('redo', { label: 'Redo', icon: 'redo', run: redo, available: canRedo });

for (let level = 1; level <= 6; level++) {
  const key = 'h' + level;
  actions.set(key, {
    label: 'Heading ' + level, icon: 'format_h' + level,
    run: (editor, active) => active ? setBlockType(editor, 'paragraph') : setBlockType(editor, 'heading', { level }),
    pressed: (_editor, blocks) => blocks.has(key),
  });
}
for (const [key, label, kind, icon] of [
  ['numlist', 'Numbered list', 'ordered', 'format_list_numbered'],
  ['bullist', 'Bulleted list', 'bullet', 'format_list_bulleted'],
]) {
  actions.set(key, {
    label, icon, run: editor => toggleList(editor, kind, 'list'), pressed: (_editor, blocks) => blocks.has(key),
  });
}

// Intersect the structures covering the selection. A caret only needs its own ancestors.
function selectedStructures({ doc, selection }) {
  const paths = selection.kind === 'text' && selection.isCollapsed
    ? [selection.path] : selectedBlockPaths(doc, selection);
  let common;
  for (const path of paths) {
    const keys = new Set();
    let node = doc;
    for (const index of path) {
      node = node.child(index);
      if (node.type.name === 'heading') keys.add('h' + node.attrs.level);
      if (node.type.name === 'ordered_list') keys.add('numlist');
      if (node.type.name === 'bullet_list') keys.add('bullist');
    }
    common = common ? new Set([...common].filter(key => keys.has(key))) : keys;
    if (!common.size) break;
  }
  return common ?? new Set();
}

export const defaultToolbar = ['bold', 'italic', 'underline', 'h1', 'h2', 'h3', 'numlist', 'bullist'];
export const toolbarOption = {
  field: 'toolbar', name: 'Toolbar', type: 'json', schema: { default_value: defaultToolbar },
  meta: {
    interface: 'select-multiple-dropdown',
    options: { choices: Array.from(actions, ([value, action]) => ({ value, text: action.label })) },
  },
};

export const FieldToolbar = defineComponent({
  name: 'FountainDirectusToolbar',
  props: { editor: Object, buttons: Array },
  emits: ['refocus'],
  setup(props, { emit }) {
    const icon = resolveComponent('v-icon');
    const state = useFountainState(() => props.editor);
    const structures = computed(() => state.value && selectedStructures(state.value));
    return () => {
      const keys = [...new Set(props.buttons ?? defaultToolbar)].filter(key => actions.has(key));
      if (!keys.length || !state.value) return null;
      return h('div', { class: 'fountain-directus-toolbar', role: 'group', 'aria-label': 'Rich text formatting' },
        keys.map(key => {
          const action = actions.get(key);
          const pressed = action.pressed?.(props.editor, structures.value);
          return h('button', {
            key, type: 'button', title: action.label, 'aria-label': action.label,
            'aria-pressed': pressed, disabled: action.available && !action.available(props.editor),
            onMousedown: event => event.preventDefault(),
            onClick: () => {
              action.run(props.editor, pressed);
              emit('refocus');
            },
          }, [h(icon, { name: action.icon, small: true })]);
        }));
    };
  },
});
