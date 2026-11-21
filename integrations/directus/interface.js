import { computed, defineComponent, h } from 'vue';
import { HTMLExporter, HTMLImporter, Schema, StarterKit } from '../../src/index';
import { FountainDocumentField } from '../../src/vue';

const schema = new Schema(StarterKit.schema);
const config = { schema: StarterKit.schema, plugins: StarterKit.plugins };
const options = { ariaLabel: 'Rich text', attributes: { 'data-fountain-directus-build': __FOUNTAIN_DIRECTUS_BUILD__ } };
// Directus joins top-level elements directly. Keep whitespace inside each block intact.
const serialize = doc => doc.content.map(block => HTMLExporter.export(block, { document: false })).join('');

export default {
  id: 'fountain-rich-text-html',
  name: 'Fountain rich text (evaluation)',
  icon: 'format_quote',
  types: ['text'],
  group: 'standard',
  component: defineComponent({
    name: 'FountainDirectusHTML',
    props: { value: String, disabled: Boolean, nonEditable: Boolean, comparisonMode: Boolean },
    emits: ['input'],
    setup(props, { emit }) {
      const incoming = computed(() => {
        const html = props.value ?? '';
        const doc = HTMLImporter.parse(html, schema);
        return { model: doc.toJSON(), exact: !html || serialize(doc) === html };
      });
      return () => {
        // Keep the original field intact when the first adapter cannot round-trip it.
        if (!incoming.value.exact || props.comparisonMode) {
          return h('div', [
            h('p', 'This field requires the Directus HTML interface for editing.'),
            h('pre', {style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}, props.value ?? ''),
          ]);
        }
        return h(FountainDocumentField, {
          config, options, modelValue: incoming.value.model, disabled: props.disabled || props.nonEditable,
          'onUpdate:modelValue': value => {
            if (props.disabled || props.nonEditable || props.comparisonMode) return;
            const doc = schema.nodeFromJSON(value);
            const sole = doc.childCount === 1 ? doc.child(0) : null;
            const empty = sole?.type.name === 'paragraph' && sole.childCount === 0;
            emit('input', empty ? null : serialize(doc));
          },
        });
      };
    },
  }),
};
