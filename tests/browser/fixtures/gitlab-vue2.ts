import Vue from '../../../tools/gitlab-bridge/runtime';
import Surface from '../../../integrations/gitlab/components/fountain_editor_surface.vue?gitlab-vue2';
import { CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Plugin, createEditor, createHistoryPlugin, canUndo, canRedo, undo, redo, setTextAlignment,
  createMathExtension, createKaTeXRenderer, insertInlineMath } from 'fountainjs-editor';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { SerializedContentController } from '../../../integrations/gitlab/services/serialized_content';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../../../integrations/gitlab/services/markdown_codec';
import { createGitLabReferenceNavigationPlugin } from '../../../integrations/gitlab/plugins/reference_navigation';
import gitlabHTML from '../../../integrations/gitlab/fixtures/service-html.json';
import gitlabMath from '../../../integrations/gitlab/fixtures/math-html.json';
import 'fountainjs-editor/styles.css';

const vetoMode = new URLSearchParams(location.search).has('reject-mode');
const gitlabRendered = new URLSearchParams(location.search).has('gitlab-rendered');
const mathRenderer = createKaTeXRenderer(katex);
const nativeMath = createMathExtension({ inputRules: false, pasteRules: false,
  documentRenderer: (latex, context) => mathRenderer(latex, { ...context,
    displayMode: context.displayMode || context.node.attrs.gitlabMathSyntax === 'display' }) });
const gitlabSchema = createGitLabSchemaSpec({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...nativeMath.nodes } });
const editor = createEditor({ schema: gitlabRendered ? gitlabSchema : CoreSchemaSpec, plugins: [createHistoryPlugin(), ...(gitlabRendered ? [createGitLabReferenceNavigationPlugin()] : []), ...(vetoMode ? [new Plugin({
  filterTransaction: transaction => transaction.docChanged || transaction.getMeta('force') !== true,
})] : [])], content: { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Vue 2 integration.' }] },
] } });
const options = Object.freeze({ ariaLabel: 'GitLab Vue 2 bridge editor' });
// Real ordinary-Markdown codec for lifecycle tests only. The actual GitLab
// dialect/service adapter remains required before application integration.
const ordinaryCodec = {
  async deserialize({ schema, markdown }) { return { document: MarkdownImporter.parse(markdown, schema) }; },
  serialize: ({ doc }) => new MarkdownExporter().export(doc),
} satisfies import('../../../integrations/gitlab/services/serialized_content').SerializedContentCodec;
// Private contract input, not a simulated GitLab product/service. This branch
// verifies real converter/view behavior against immutable upstream HTML only.
const pinnedGitLabCodec = new GitLabMarkdownCodec({ renderMarkdown: async markdown => {
  const math = gitlabMath.rows.find(row => row.markdown === markdown);
  if (math) return { body: math.html };
  if (markdown !== 'See #1 and !1 by @root with ~bug in b51c8ef20575') throw new Error('This private contract fixture has no live GitLab renderer.');
  return { body: gitlabHTML.fixtures.RESOLVED_REFERENCES_PARAGRAPH_HTML };
} });
const content = new SerializedContentController(editor, gitlabRendered ? pinnedGitLabCodec : ordinaryCodec);
let unsubscribe: (() => void) | undefined;
let unsubscribeChange: (() => void) | undefined;
const app = new Vue({
  data: () => ({ editable: true, visible: true, ready: 0, revision: 0, error: '', serializationError: '', markdown: '', changes: 0, serialized: '', loading: false }),
  beforeDestroy() { unsubscribe?.(); unsubscribeChange?.(); content.dispose(); },
  methods: {
    async replaceMarkdown(addToHistory: boolean) {
      this.loading = true;
      this.error = '';
      try {
        const result = await content.setSerializedContent(this.markdown, { addToHistory });
        if (result.status === 'applied') {
          this.serialized = content.getSerializedContent();
          this.serializationError = '';
        }
      }
      catch (error) { this.error = String(error); }
      finally { this.loading = false; }
    },
  },
  render(h) {
    void this.revision;
    return h('section', [
      h('nav', { attrs: { 'aria-label': 'Bridge host controls' } }, [
        h('button', { attrs: { type: 'button' }, on: { click: () => { this.editable = !this.editable; } } }, this.editable ? 'Use read-only mode' : 'Enable editing'),
        h('button', { attrs: { type: 'button' }, on: { click: () => { this.visible = !this.visible; } } }, this.visible ? 'Detach surface' : 'Attach surface'),
        h('button', { attrs: { type: 'button', disabled: !this.editable || !canUndo(editor) }, on: { click: () => undo(editor) } }, 'Undo document'),
        h('button', { attrs: { type: 'button', disabled: !this.editable || !canRedo(editor) }, on: { click: () => redo(editor) } }, 'Redo document'),
        h('button', { attrs: { type: 'button', disabled: !this.editable },
          on: { mousedown: (event: MouseEvent) => event.preventDefault(), click: () => setTextAlignment(editor, 'center') } }, 'Centre paragraph'),
        gitlabRendered ? h('button', { attrs: { type: 'button', disabled: !this.editable },
          on: { mousedown: (event: MouseEvent) => event.preventDefault(), click: () => insertInlineMath(editor, 'x^2') } }, 'Insert inline math') : null,
      ]),
      h('output', { attrs: { 'aria-label': 'View mount count' } }, String(this.ready)),
      this.error ? h('p', { attrs: { role: 'alert' } }, this.error) : null,
      this.serializationError ? h('p', { attrs: { role: 'alert' } }, this.serializationError) : null,
      this.visible ? h(Surface, { props: { editor, editable: this.editable, options },
        on: { ready: () => { this.ready++; this.error = ''; }, error: (error: unknown) => { this.error = String(error); } } }) : null,
      h('output', { attrs: { 'aria-label': 'Bridge document JSON' } }, JSON.stringify(editor.getJSON())),
      h('fieldset', [h('legend', gitlabRendered ? 'Pinned GitLab HTML conversion contract; no live GitLab service'
        : 'Serialized-content lifecycle (ordinary Fountain Markdown, not GitLab dialect verification)'),
        h('textarea', { attrs: { 'aria-label': 'Markdown replacement source' }, domProps: { value: this.markdown },
          on: { input: (event: Event) => { this.markdown = (event.target as HTMLTextAreaElement).value; } } }),
        h('button', { attrs: { type: 'button', disabled: this.loading }, on: { click: () => this.replaceMarkdown(true) } }, 'Apply Markdown template'),
        h('button', { attrs: { type: 'button', disabled: this.loading }, on: { click: () => this.replaceMarkdown(false) } }, 'Load Markdown baseline'),
        h('output', { attrs: { 'aria-label': 'Host document change count' } }, String(this.changes)),
        h('output', { attrs: { 'aria-label': 'Latest host Markdown' } }, this.serialized),
      ]),
    ]);
  },
});
unsubscribe = editor.subscribe(() => { app.revision++; });
unsubscribeChange = content.subscribeChange(change => {
  app.changes++;
  // An old successful string must never masquerade as the current document.
  app.serialized = change.status === 'ready' ? change.markdown : '';
  app.serializationError = change.status === 'error' ? String(change.error) : '';
});
app.$mount('#app');
