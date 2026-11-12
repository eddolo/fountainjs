// eslint-disable-next-line import-x/no-extraneous-dependencies -- Isolated interactions use GitLab's existing test dependency.
import { fireEvent, getByRole, waitFor } from '@testing-library/dom';
import { markRaw } from 'vue';
import { GitLabContentEditor, Selection } from '../runtime/browser';
import FountainAlertMenu from './fountain_alert_menu.vue';
import FountainEditorSurface from './fountain_editor_surface.vue';
import '../services/fountain_runtime.css';

// Component fixtures only. Actual renderer/persistence acceptance runs separately.
const Template = args => ({
  components: { FountainAlertMenu, FountainEditorSurface },
  data() { return { service: null, ready: false, error: null }; },
  created() {
    this.service = markRaw(new GitLabContentEditor({ editable: !args.readOnly,
      describeLabels: () => '', renderMarkdown: async () => ({ body:
        `<div class="markdown-alert markdown-alert-note" data-sourcepos="1:1-3:22"><p class="markdown-alert-title">${args.custom ? 'Deployment status' : 'Note'}</p><p>Keep the rollback ready.</p></div>` }),
    }));
  },
  async mounted() {
    await this.service.setSerializedContent(`> [!note]${args.custom ? ' Deployment status' : ''}\n>\n> Keep the rollback ready.`);
    const { editor } = this.service;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 0], 3)));
    this.ready = true;
  },
  beforeDestroy() { this.service.dispose(); },
  methods: { focusEditor() { this.$refs.surface.focus(); } },
  template: `<section aria-label="Alert component states" class="gl-p-5 md">
    <h1>Native alert editing</h1>
    <p>Component fixture. Real GitLab rendering and persistence are verified separately.</p>
    <fountain-alert-menu v-if="service" :content-editor="service" :disabled="!ready || ${Boolean(args.readOnly)}" @focus="focusEditor" @error="error = $event" />
    <p v-if="error" role="alert">The operation was refused. Your document is retained.</p>
    <fountain-editor-surface v-if="service" ref="surface" :editor="service.editor" :options="{ ariaLabel: 'Alert example document' }" />
  </section>`,
});
export default { component: FountainAlertMenu, title: 'content_editor/fountain_alert_menu' };
export const DefaultTitle = Template.bind({});
export const CustomTitle = Template.bind({}); CustomTitle.args = { custom: true };
export const ReadOnly = Template.bind({}); ReadOnly.args = { readOnly: true };
export const Caution = Template.bind({});
Caution.play = async ({ canvasElement }) => {
  const select = await waitFor(() => getByRole(canvasElement, 'combobox', { name: 'Alert type' }));
  fireEvent.change(select, { target: { value: 'caution' } });
};
