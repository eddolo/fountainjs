import { defineComponent, h, resolveComponent } from 'vue';
import { canRedo, canUndo, isMarkActive, redo, toggleMark, undo } from '../../src/index';
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

export const defaultToolbar = ['bold', 'italic', 'underline'];
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
    return () => {
      const keys = [...new Set(props.buttons ?? defaultToolbar)].filter(key => actions.has(key));
      if (!keys.length || !state.value) return null;
      return h('div', { class: 'fountain-directus-toolbar', role: 'group', 'aria-label': 'Rich text formatting' },
        keys.map(key => {
          const action = actions.get(key);
          return h('button', {
            key, type: 'button', title: action.label, 'aria-label': action.label,
            'aria-pressed': action.pressed?.(props.editor), disabled: action.available && !action.available(props.editor),
            onMousedown: event => event.preventDefault(),
            onClick: () => {
              action.run(props.editor);
              emit('refocus');
            },
          }, [h(icon, { name: action.icon, small: true })]);
        }));
    };
  },
});
