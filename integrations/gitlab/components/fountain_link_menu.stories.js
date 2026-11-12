// eslint-disable-next-line import-x/no-extraneous-dependencies -- Isolated Storybook interactions use the existing test dependency.
import { fireEvent, getByRole, waitFor } from '@testing-library/dom';
import { markRaw } from 'vue';
import { GitLabContentEditor, Selection, insertText } from '../runtime/browser';
import FountainEditorSurface from './fountain_editor_surface.vue';
import FountainLinkMenu from './fountain_link_menu.vue';
import '../services/fountain_runtime.css';

// Isolated component states use fixed renderer fixtures; real-service journeys verify GitLab persistence.
const source = 'Before [linked text](/original) after';
const initialHTML = '<p>Before <a href="/original">linked text</a> after</p>';

const Template = (args) => ({
  components: { FountainEditorSurface, FountainLinkMenu },
  data() { return { service: null, ready: false, failure: '' }; },
  created() {
    this.service = markRaw(new GitLabContentEditor({
      editable: !args.readOnly,
      describeLabels: () => '',
      renderMarkdown: (markdown, { signal } = {}) => {
        if (markdown === source || markdown === '') return Promise.resolve({ body: markdown ? initialHTML : '<p></p>' });
        if (args.resolution === 'failed') return Promise.reject(new Error('Fixture renderer unavailable'));
        if (args.resolution === 'pending') return new Promise((resolve) => {
          signal?.addEventListener('abort', () => resolve({ body: '' }), { once: true });
        });
        return Promise.resolve({ body: '<p><a href="/resolved">link</a></p>' });
      },
    }));
  },
  async mounted() {
    await this.service.setSerializedContent(args.empty ? '' : source);
    const { editor } = this.service;
    if (!args.empty) editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1], 2)));
    this.ready = true;
    await this.$nextTick();
    this.$refs.menu.refreshRoot();
    this.$refs.surface.focus();
  },
  beforeDestroy() { this.service.dispose(); },
  methods: {
    getRoot() { return this.$refs.surface?.getRootElement(); },
    focusEditor() { this.$refs.surface?.focus(); },
    changeSelectedContent() { insertText(this.service.editor, '!'); },
    reportError(error) { this.failure = error.message; },
  },
  template: `
    <section aria-label="Link component states" class="gl-p-5">
      <h1>Native link controls</h1>
      <p>Component fixture. Saving and permissions are verified separately against the actual GitLab service.</p>
      <p v-if="failure" role="alert">{{ failure }}</p>
      <fountain-link-menu v-if="service" ref="menu" :content-editor="service" :get-editor-root="getRoot" :disabled="!ready || ${Boolean(args.readOnly)}" @focus="focusEditor" @error="reportError" />
      <fountain-editor-surface v-if="service" ref="surface" :editor="service.editor" :options="{ ariaLabel: 'Link example document' }" />
      <button v-if="ready && !${Boolean(args.readOnly)}" type="button" @click="changeSelectedContent">Change selected content</button>
    </section>
  `,
});

const openDialog = async ({ canvasElement }) => {
  const button = await waitFor(() => {
    const control = getByRole(canvasElement, 'button', { name: 'Insert or edit link' });
    if (control.disabled || control.getAttribute('aria-disabled') === 'true') throw new Error('Waiting for the native surface');
    return control;
  });
  fireEvent.click(button);
  return waitFor(() => getByRole(document.body, 'dialog', { name: 'Edit link' }));
};
const applyDraft = async (context) => {
  const dialog = await openDialog(context);
  fireEvent.input(getByRole(dialog, 'textbox', { name: 'Link URL' }), { target: { value: '/next' } });
  fireEvent.click(getByRole(dialog, 'button', { name: 'Apply link' }));
};

export default { component: FountainLinkMenu, title: 'content_editor/fountain_link_menu' };
export const ExistingLink = Template.bind({});
export const EmptyDocument = Template.bind({});
EmptyDocument.args = { empty: true };
export const ReadOnly = Template.bind({});
ReadOnly.args = { readOnly: true };
export const EditForm = Template.bind({});
EditForm.play = openDialog;
export const Pending = Template.bind({});
Pending.args = { resolution: 'pending' };
Pending.play = applyDraft;
export const FailedResolution = Template.bind({});
FailedResolution.args = { resolution: 'failed' };
FailedResolution.play = async (context) => {
  await applyDraft(context);
  await waitFor(() => getByRole(document.body, 'alert'));
};
export const Conflict = Template.bind({});
Conflict.play = async (context) => {
  await openDialog(context);
  fireEvent.click(getByRole(context.canvasElement, 'button', { name: 'Change selected content' }));
  await waitFor(() => getByRole(document.body, 'alert'));
};
