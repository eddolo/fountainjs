// eslint-disable-next-line import-x/no-extraneous-dependencies -- Isolated Storybook states use the existing test dependency.
import { fireEvent, getByRole, waitFor } from '@testing-library/dom';
import { markRaw } from 'vue';
import { GitLabContentEditor, NodeSelection, Selection, insertText } from '../runtime/browser';
import FountainReferenceMenu from './fountain_reference_menu.vue';
import FountainEditorSurface from './fountain_editor_surface.vue';
import '../services/fountain_runtime.css';

// Isolated component fixtures; actual rendering/persistence is audited separately.
const href = kind => {
  if (kind === 'user') return '/root';
  if (kind === 'label') return '/root/fountain-product-integration/-/issues?label_name=Reference+review';
  if (kind === 'merge_request') return '/root/fountain-product-integration/-/merge_requests/1';
  return '/root/fountain-product-integration/-/work_items/75';
};
const token = kind => {
  if (kind === 'user') return '@root';
  if (kind === 'label') return '~"Reference review"';
  return kind === 'merge_request' ? '!1' : '#75';
};
const html = (source, kind) => {
  let expanded = kind === 'label' ? 'Reference review' : source;
  const base = source.replace(/\+(?:s)?$/u, '');
  if (source.endsWith('+')) expanded = `Reference review (${base})`;
  if (source.endsWith('+s')) expanded = `Reference review (${base}) • Unassigned`;
  return `<p>Keep writing here.</p><p><a href="${href(kind)}" data-reference-type="${kind}" data-original="${source.replaceAll('"', '&quot;')}">${expanded}</a></p>`;
};
const Template = args => ({
  components: { FountainReferenceMenu, FountainEditorSurface },
  data() { return { service: null, ready: false, fail: Boolean(args.fail), pending: Boolean(args.pending) }; },
  created() {
    const kind = args.kind || 'issue';
    const reference = token(kind) + (args.suffix || '');
    const original = `Keep writing here.\n\n${reference}`;
    this.service = markRaw(new GitLabContentEditor({ editable: !args.readOnly, describeLabels: () => '',
      renderMarkdown: async source => {
        if (source !== original && this.fail) throw new Error('Fixed offline component state');
        if (source !== original && this.pending) return new Promise(() => {});
        if (source === original) return { body: html(reference, kind) };
        return { body: html(source, kind).replace('<p>Keep writing here.</p>', '') };
      },
    }));
  },
  async mounted() {
    const kind = args.kind || 'issue';
    await this.service.setSerializedContent(`Keep writing here.\n\n${token(kind)}${args.suffix || ''}`);
    this.selectReference(); this.ready = true;
  },
  beforeDestroy() { this.service.dispose(); },
  methods: {
    focusEditor() { this.$refs.surface.focus(); },
    selectReference() {
      const { editor } = this.service;
      editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [1, 0])));
    },
    changeReference() {
      const { editor } = this.service;
      editor.dispatch(editor.createTransaction().setNodeAttrs([1, 0], { label: 'Changed by another editor' }));
    },
    typeElsewhere() {
      const { editor } = this.service;
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
      insertText(editor, 'Still typing. ');
    },
  },
  template: `<section aria-label="Reference component states" class="gl-p-5">
    <h1>Native reference controls</h1>
    <p>Component fixtures. Actual GitLab rendering, navigation, saving and restart are verified separately.</p>
    <fountain-reference-menu v-if="ready" :content-editor="service" :disabled="${Boolean(args.readOnly)}" @focus="focusEditor" />
    <fountain-editor-surface v-if="service" ref="surface" :editor="service.editor" :options="{ ariaLabel: 'Reference example document' }" />
    <button v-if="ready" type="button" @click="selectReference">Select reference</button>
    <button v-if="ready && !${Boolean(args.readOnly)}" type="button" @click="changeReference">Change selected reference</button>
    <button v-if="ready && !${Boolean(args.readOnly)}" type="button" @click="typeElsewhere">Type elsewhere</button>
  </section>`,
});
const chooseTitle = async ({ canvasElement }) => {
  const input = await waitFor(() => getByRole(canvasElement, 'combobox', { name: 'Reference display' }));
  input.focus(); fireEvent.change(input, { target: { value: 'title' } });
  await waitFor(() => getByRole(canvasElement, 'button', { name: 'Cancel reference edit' }));
  return input;
};
export default { component: FountainReferenceMenu, title: 'content_editor/fountain_reference_menu' };
export const Issue = Template.bind({});
export const Title = Template.bind({}); Title.args = { suffix: '+' };
export const Summary = Template.bind({}); Summary.args = { suffix: '+s' };
export const MergeRequest = Template.bind({}); MergeRequest.args = { kind: 'merge_request' };
export const User = Template.bind({}); User.args = { kind: 'user' };
export const Label = Template.bind({}); Label.args = { kind: 'label' };
export const ReadOnly = Template.bind({}); ReadOnly.args = { readOnly: true };
export const FailedResolution = Template.bind({}); FailedResolution.args = { fail: true };
FailedResolution.play = async context => {
  await chooseTitle(context); fireEvent.click(getByRole(context.canvasElement, 'button', { name: 'Apply reference display' }));
  await waitFor(() => getByRole(context.canvasElement, 'alert'));
};
export const Conflict = Template.bind({});
Conflict.play = async context => {
  await chooseTitle(context); fireEvent.click(getByRole(context.canvasElement, 'button', { name: 'Change selected reference' }));
  await waitFor(() => getByRole(context.canvasElement, 'alert'));
};
export const Pending = Template.bind({}); Pending.args = { pending: true };
Pending.play = async context => {
  await chooseTitle(context); fireEvent.click(getByRole(context.canvasElement, 'button', { name: 'Apply reference display' }));
  await waitFor(() => getByRole(context.canvasElement, 'status', { name: 'Reference resolution' }));
};
