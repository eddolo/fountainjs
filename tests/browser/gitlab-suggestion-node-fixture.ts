import { EditorView, JSONExporter, setContent } from 'fountainjs-editor';
import { GitLabContentEditor } from '../../integrations/gitlab/services/content_editor';
import captures from '../../integrations/gitlab/fixtures/suggestion-live-html.json';
import '../../src/styles.css';
const kind = new URLSearchParams(location.search).get('case') ?? 'range';
const fixture = captures.fixtures.find(item => item.name === kind && ['range', 'quoted', 'nested-list'].includes(kind))!;
let bridge: GitLabContentEditor, view: EditorView;
const status = document.querySelector('#status')!;
const model = document.querySelector('#model')!;
async function mount(saved?: string) {
  view?.destroy(); bridge?.dispose();
  bridge = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async source => {
    if (source !== fixture.source) throw new Error('No real renderer capture for this source.');
    return { body: fixture.body };
  } });
  await bridge.setSerializedContent(fixture.source);
  const editor = bridge.editor, schema = editor.state.schema;
  setContent(editor, saved ? schema.nodeFromJSON(JSON.parse(saved)) : editor.state.doc.copy([
    schema.node('paragraph', {}, [schema.text('Original prose.')]), ...editor.state.doc.content,
  ]));
  view = new EditorView(document.querySelector<HTMLElement>('#editor')!, editor, { ariaLabel: 'Suggestion editor' });
  const update = () => { model.textContent = JSON.stringify(editor.getJSON()); };
  editor.subscribe(update); update();
  status.textContent = saved ? 'Reopened saved JSON' : 'Ready';
}
document.querySelector('#export')!.addEventListener('click', () => {
  (document.querySelector('#source') as HTMLTextAreaElement).value = bridge.getSerializedContent();
});
document.querySelector('#reopen')!.addEventListener('click', async () => {
  const saved = JSONExporter.export(bridge.editor.state, 0, { omitTrailingCaret: true }); localStorage.setItem('gitlab-suggestion-audit', saved);
  await mount(localStorage.getItem('gitlab-suggestion-audit')!);
});
await mount();
