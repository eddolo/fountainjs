import { computed, defineComponent, h, resolveComponent, shallowRef } from 'vue';
import { HTMLExporter, HTMLImporter, Schema, StarterKit } from '../../src/index';
import { FountainDocumentField } from '../../src/vue';
import { FieldToolbar, toolbarOption } from './toolbar';
import { updateSourceText } from './source';
import fieldCss from './field.css?inline';

const schema = new Schema(StarterKit.schema);
const config = { schema: StarterKit.schema, plugins: StarterKit.plugins };
const options = { ariaLabel: 'Rich text', attributes: { 'data-fountain-directus-build': __FOUNTAIN_DIRECTUS_BUILD__ } };
// Directus joins top-level elements directly. Keep whitespace inside each block intact.
const serialize = doc => doc.content.map(block => HTMLExporter.export(block, { document: false })).join('');

function exactDocument(html, targetSchema = schema) {
  try {
    const doc = HTMLImporter.parse(html, targetSchema);
    return !html || serialize(doc) === html ? doc : null;
  } catch {
    return null;
  }
}

export default {
  id: 'fountain-rich-text-html',
  name: 'Fountain rich text (evaluation)',
  icon: 'format_quote',
  types: ['text'],
  group: 'standard',
  options: [toolbarOption],
  component: defineComponent({
    name: 'FountainDirectusHTML',
    props: { toolbar: Array, value: String, disabled: Boolean, nonEditable: Boolean, comparisonMode: Boolean },
    emits: ['input'],
    setup(props, { emit }) {
      const drawer = resolveComponent('v-drawer');
      const button = resolveComponent('v-button');
      const field = shallowRef(null);
      const canEdit = computed(() => !props.disabled && !props.nonEditable && !props.comparisonMode);
      const incoming = computed(() => props.comparisonMode ? null : exactDocument(props.value ?? '')?.toJSON());
      const draft = shallowRef(null);
      let original, beforeSourceInput, applying = false;
      const error = shallowRef('');

      function openSource() {
        if (!canEdit.value) return;
        original = props.value;
        beforeSourceInput = undefined;
        draft.value = original ?? '';
        error.value = '';
      }
      function cancelSource() { draft.value = null; }
      function applySource() {
        if (!canEdit.value || draft.value === null) return;
        if (props.value !== original) {
          error.value = 'The field changed while this drawer was open. Copy your edits, then reopen the source.';
          return;
        }
        if (draft.value !== (original ?? '')) {
          const value = draft.value || null;
          const editor = field.value?.editor;
          const next = editor && exactDocument(value ?? '', editor.state.schema);
          if (next && !next.eq(editor.state.doc)) {
            applying = true;
            try {
              if (!editor.dispatch(editor.createTransaction().replaceDocument(next))) {
                error.value = 'The editor could not apply this change.';
                return;
              }
            } finally { applying = false; }
          }
          emit('input', value);
        }
        cancelSource();
      }
      function publish(value) {
        if (applying || !canEdit.value) return;
        const doc = schema.nodeFromJSON(value);
        const sole = doc.childCount === 1 ? doc.child(0) : null;
        const empty = sole?.type.name === 'paragraph' &&
          sole.content.every(child => child.isText && child.text === '');
        emit('input', empty ? null : serialize(doc));
      }
      return () => h('div', { class: 'fountain-directus-field', ...options.attributes }, [
        h('style', fieldCss),
        ...(incoming.value ? [
          canEdit.value && h(FieldToolbar, {
            editor: field.value?.editor, buttons: props.toolbar, onRefocus: () => field.value?.focus(), onSource: openSource,
          }),
          h(FountainDocumentField, {
            ref: field, config, options, modelValue: incoming.value, disabled: !canEdit.value, 'onUpdate:modelValue': publish,
          }),
        ] : [
          h('div', { class: 'fountain-directus-stored' }, [
            canEdit.value && h('p', 'This HTML contains markup that the visual editor cannot preserve.'),
            h('pre', props.value ?? ''),
            canEdit.value && h(button, { small: true, onClick: openSource }, () => 'Edit HTML source'),
          ]),
        ]),
        canEdit.value && draft.value !== null && h(drawer, {
          title: 'Edit HTML source', icon: 'html', modelValue: true,
          onApply: applySource, onCancel: cancelSource,
          'onUpdate:modelValue': open => { if (!open) cancelSource(); },
        }, {
          default: () => h('div', { class: 'fountain-directus-source' }, [
            h('label', ['HTML source', h('textarea', {
              value: draft.value.replace(/\r\n?/g, '\n'), spellcheck: false, autocapitalize: 'off',
              onBeforeinput: event => { beforeSourceInput = event.target.selectionStart; },
              onInput: ({ target }) => {
                draft.value = updateSourceText(draft.value, target.value, beforeSourceInput, target.selectionStart);
                beforeSourceInput = undefined;
              },
            })]),
            error.value && h('p', { role: 'alert' }, error.value),
          ]),
          'actions:primary': () => h(button, { small: true, onClick: applySource }, () => 'Apply source'),
        }),
      ]);
    },
  }),
};
