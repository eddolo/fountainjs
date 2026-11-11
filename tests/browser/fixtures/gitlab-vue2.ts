import Vue from '../../../tools/gitlab-bridge/runtime';
import Surface from '../../../integrations/gitlab/components/fountain_editor_surface.vue?gitlab-vue2';
import { CoreSchemaSpec, Plugin, createEditor, createHistoryPlugin, canUndo, canRedo, undo, redo } from 'fountainjs-editor';
import 'fountainjs-editor/styles.css';

const vetoMode = new URLSearchParams(location.search).has('reject-mode');
const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin(), ...(vetoMode ? [new Plugin({
  filterTransaction: transaction => transaction.docChanged || transaction.getMeta('force') !== true,
})] : [])], content: { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Vue 2 integration.' }] },
] } });
const options = Object.freeze({ ariaLabel: 'GitLab Vue 2 bridge editor' });
let unsubscribe: (() => void) | undefined;
const app = new Vue({
  data: () => ({ editable: true, visible: true, ready: 0, revision: 0, error: '' }),
  beforeDestroy() { unsubscribe?.(); },
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
    ]);
  },
});
unsubscribe = editor.subscribe(() => { app.revision++; });
app.$mount('#app');
