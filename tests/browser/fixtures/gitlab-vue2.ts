import Vue from '../../../tools/gitlab-bridge/runtime';
import Surface from '../../../integrations/gitlab/components/fountain_editor_surface.vue?gitlab-vue2';
import { CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Plugin, createEditor, createHistoryPlugin, canUndo, canRedo, undo, redo } from 'fountainjs-editor';
import { SerializedContentController } from '../../../integrations/gitlab/services/serialized_content';
import 'fountainjs-editor/styles.css';

const vetoMode = new URLSearchParams(location.search).has('reject-mode');
const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin(), ...(vetoMode ? [new Plugin({
  filterTransaction: transaction => transaction.docChanged || transaction.getMeta('force') !== true,
})] : [])], content: { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Vue 2 integration.' }] },
] } });
const options = Object.freeze({ ariaLabel: 'GitLab Vue 2 bridge editor' });
// Real ordinary-Markdown codec for lifecycle tests only. The actual GitLab
// dialect/service adapter remains required before application integration.
const content = new SerializedContentController(editor, {
  async deserialize({ schema, markdown }) { return { document: MarkdownImporter.parse(markdown, schema) }; },
  serialize: ({ doc }) => new MarkdownExporter().export(doc),
});
let unsubscribe: (() => void) | undefined;
let unsubscribeChange: (() => void) | undefined;
const app = new Vue({
  data: () => ({ editable: true, visible: true, ready: 0, revision: 0, error: '', markdown: '', changes: 0, serialized: '', loading: false }),
  beforeDestroy() { unsubscribe?.(); unsubscribeChange?.(); content.dispose(); },
  methods: {
    async replaceMarkdown(addToHistory: boolean) {
      this.loading = true;
      this.error = '';
      try { await content.setSerializedContent(this.markdown, { addToHistory }); }
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
      ]),
      h('output', { attrs: { 'aria-label': 'View mount count' } }, String(this.ready)),
      this.error ? h('p', { attrs: { role: 'alert' } }, this.error) : null,
      this.visible ? h(Surface, { props: { editor, editable: this.editable, options },
        on: { ready: () => { this.ready++; this.error = ''; }, error: (error: unknown) => { this.error = String(error); } } }) : null,
      h('output', { attrs: { 'aria-label': 'Bridge document JSON' } }, JSON.stringify(editor.getJSON())),
      h('fieldset', [h('legend', 'Serialized-content lifecycle (ordinary Fountain Markdown, not GitLab dialect verification)'),
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
unsubscribeChange = content.subscribeChange(({ markdown }) => { app.changes++; app.serialized = markdown; });
app.$mount('#app');
