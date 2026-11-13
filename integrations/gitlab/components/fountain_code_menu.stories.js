// eslint-disable-next-line import-x/no-extraneous-dependencies -- Isolated Storybook interactions use the existing test dependency.
import { fireEvent, getByRole, waitFor } from '@testing-library/dom';
import { markRaw } from 'vue';
import { GitLabContentEditor, Selection, insertText } from '../runtime/browser';
import FountainEditorSurface from './fountain_editor_surface.vue';
import FountainCodeMenu from './fountain_code_menu.vue';
import '../services/fountain_runtime.css';

// Component state fixtures are separate from actual GitLab persistence acceptance.
const source = '```javascript\nconst answer = 42;\nconsole.log(answer);\n```';
const Template = args => ({
  components: { FountainEditorSurface, FountainCodeMenu },
  data() { return { service: null, ready: false }; },
  created() {
    this.service = markRaw(new GitLabContentEditor({ editable: !args.readOnly,
      describeLabels: () => '', renderMarkdown: async () => ({ body: '<pre data-canonical-lang="javascript"><code>const answer = 42;\nconsole.log(answer);</code></pre>' }),
    }));
  },
  async mounted() {
    await this.service.setSerializedContent(source);
    const { editor } = this.service;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    this.ready = true; await this.$nextTick(); this.$refs.surface.focus();
  },
  beforeDestroy() { this.service.dispose(); },
  methods: {
    getEditorRoot() { return this.$refs.surface?.getRootElement() || null; },
    refreshRoot() { this.$refs.menu?.refreshRoot(); },
    focusEditor() { this.$refs.surface.focus(); },
    changeCode() { insertText(this.service.editor, 'changed'); },
  },
  template: `<section aria-label="Code component states" class="gl-p-5">
    <h1>Native code block controls</h1>
    <p>Component fixture. Product persistence is verified separately against the actual GitLab service.</p>
    <fountain-code-menu v-if="service" ref="menu" :content-editor="service" :disabled="!ready || ${Boolean(args.readOnly)}" :get-editor-root="${args.contextual ? 'getEditorRoot' : 'null'}" @focus="focusEditor" />
    <fountain-editor-surface v-if="service" ref="surface" :editor="service.editor" :options="{ ariaLabel: 'Code example document' }" @ready="refreshRoot" />
    <button v-if="ready && !${Boolean(args.readOnly)}" type="button" @click="changeCode">Change code content</button>
  </section>`,
});
const field = async ({ canvasElement }) => waitFor(() => getByRole(canvasElement, 'combobox', { name: 'Code language' }));
export default { component: FountainCodeMenu, title: 'content_editor/fountain_code_menu' };
export const Editing = Template.bind({});
export const ReadOnly = Template.bind({}); ReadOnly.args = { readOnly: true };
export const ContextualEditing = Template.bind({}); ContextualEditing.args = { contextual: true };
export const ContextualReadOnly = Template.bind({}); ContextualReadOnly.args = { contextual: true, readOnly: true };
export const InvalidLanguage = Template.bind({});
InvalidLanguage.play = async context => {
  const input = await field(context); fireEvent.focus(input);
  fireEvent.input(input, { target: { value: 'two words' } });
  fireEvent.click(getByRole(context.canvasElement, 'button', { name: 'Apply language' }));
  await waitFor(() => getByRole(context.canvasElement, 'alert'));
};
export const Conflict = Template.bind({});
Conflict.play = async context => {
  const input = await field(context); fireEvent.focus(input);
  fireEvent.input(input, { target: { value: 'rust' } });
  fireEvent.click(getByRole(context.canvasElement, 'button', { name: 'Change code content' }));
  await waitFor(() => getByRole(context.canvasElement, 'alert'));
};
