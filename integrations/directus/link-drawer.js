import { computed, defineComponent, h, reactive, ref, resolveComponent } from 'vue';
import { isSafeURL } from '../../src/index';
import { writeLink } from './links';

export const LinkDrawer = defineComponent({
  name: 'FountainDirectusLinkDrawer',
  props: { editor: Object, range: { type: Object, required: true } },
  emits: ['close'],
  setup(props, { emit }) {
    const drawer = resolveComponent('v-drawer'), button = resolveComponent('v-button');
    const { active, text } = props.range;
    const attrs = active?.attrs;
    const selectedURL = !active && URL.canParse(text) ? text : '';
    const form = reactive({ href: attrs?.href ?? selectedURL, label: selectedURL ? '' : text,
      title: attrs?.title ?? '', newTab: active ? attrs.target === '_blank' : true });
    const valid = computed(() => form.href.trim().length > 0 && form.href.trim().length <= 2048 && isSafeURL(form.href.trim()));
    const message = ref('');
    const close = () => emit('close');
    function apply(remove = false) {
      if (!remove && !valid.value) return;
      const authorTokens = String(attrs?.rel ?? '').split(/\s+/).filter(value => value && !['noopener', 'noreferrer'].includes(value));
      const rel = [...(form.newTab ? ['noopener', 'noreferrer'] : []), ...authorTokens].join(' ') || null;
      const href = form.href.trim();
      const updated = remove ? null : { href, title: form.title, target: form.newTab ? '_blank' : null, rel };
      if (writeLink(props.editor, props.range, updated, form.label || href)) close();
      else message.value = 'The field changed. Close this drawer and select the link again.';
    }
    const input = (label, key) => h('label', [label, h('input', {
      type: 'text', value: form[key], maxlength: key === 'title' ? 1000 : key === 'href' ? 2048 : undefined,
      onInput: event => { form[key] = event.target.value; },
    })]);
    return () => h(drawer, { title: active ? 'Edit link' : 'Add link', icon: 'link', modelValue: true,
      onApply: () => apply(), onCancel: close, 'onUpdate:modelValue': open => { if (!open) close(); },
    }, {
      default: () => h('div', { class: 'fountain-directus-link-form' }, [
        input('URL', 'href'), input('Display text', 'label'), input('Tooltip', 'title'),
        h('label', [h('input', {type:'checkbox', checked:form.newTab, onChange:event => { form.newTab = event.target.checked; }}), 'New Tab']),
        form.href && !valid.value && h('p', {role:'alert'}, 'Enter a supported link destination.'),
        message.value && h('p', {role:'alert'}, message.value),
      ]),
      actions: () => active && h(button, { small: true, secondary: true, onClick: () => apply(true) }, () => 'Unlink'),
      'actions:primary': () => h(button, { small: true, disabled: !valid.value, onClick: () => apply() }, () => 'Apply link'),
    });
  },
});
