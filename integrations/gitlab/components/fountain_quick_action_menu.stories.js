import { markRaw } from 'vue';
import { GitLabContentEditor, Selection, parseGitLabQuickActionCommands } from '../runtime/browser';
import FountainEditorSurface from './fountain_editor_surface.vue';
import FountainQuickActionMenu from './fountain_quick_action_menu.vue';
import '../services/fountain_runtime.css';

// Isolated presentation fixture. The product audit uses the authenticated host endpoint.
const commands = parseGitLabQuickActionCommands([
  { name: 'label', aliases: ['labels'], description: 'Add labels', warning: '', params: ['~label1 ~"label 2"'] },
  { name: 'assign', aliases: [], description: 'Assign this issue', warning: '', params: ['@user'] },
]);
const Template = args => ({
  components: { FountainEditorSurface, FountainQuickActionMenu },
  data() { return { service: null, ready: false }; },
  created() {
    this.service = markRaw(new GitLabContentEditor({ describeLabels: () => '',
      quickActionProvider: () => args.failure ? Promise.reject(new Error('Unavailable fixture')) : Promise.resolve(commands),
      renderMarkdown: () => Promise.resolve({ body: '<p>Start here.</p>', references: { commands: '<p>Adds the selected labels.</p>' } }),
    }));
  },
  async mounted() {
    await this.service.setSerializedContent('Start here.');
    const { editor } = this.service;
    const { schema } = editor.state;
    const text = args.literal ? '/label ~example' : '/';
    editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [schema.node('paragraph',
      { gitlabLiteralSlash: Boolean(args.literal) }, [schema.text(text)])])).setSelection(Selection.cursor([0, 0], 0)));
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], text.length)));
    this.ready = true; await this.$nextTick(); this.$refs.surface.focus();
  },
  beforeDestroy() { this.service.dispose(); },
  methods: {
    getRoot() { return this.$refs.surface?.getRootElement() || null; },
    readySurface() { this.$refs.menu?.refreshRoot(); },
    focus() { this.$refs.surface.focus(); },
  },
  template: `<main class="gl-p-5 md"><h1>Quick actions</h1>
    <p>Component fixture. Commands execute only through the actual application's Save workflow.</p>
    <fountain-quick-action-menu v-if="service" ref="menu" :content-editor="service" :get-editor-root="getRoot" :disabled="!ready" @focus="focus" />
    <fountain-editor-surface v-if="service" ref="surface" :editor="service.editor" :options="{ ariaLabel: 'Quick action example' }" @ready="readySurface" />
  </main>`,
});
export default { component: FountainQuickActionMenu, title: 'content_editor/fountain_quick_action_menu' };
export const Suggestions = Template.bind({});
export const Literal = Template.bind({}); Literal.args = { literal: true };
export const Unavailable = Template.bind({}); Unavailable.args = { failure: true };
