import { createEditor, EditorView, MarkdownExporter, MarkdownImporter, Schema, StarterKit } from '../../src';
import '../../src/styles.css';

const schema = new Schema(StarterKit.schema);
let source = '| שמאל | מרכז | ימין | רגיל |\n| :--- | :---: | ---: | --- |\n| שלום | עולם | ערך | חופשי |';
let editor: ReturnType<typeof createEditor>;
let view: EditorView;
let losses: readonly unknown[] = [];
function mount(): void {
  view?.destroy(); editor?.destroy();
  const document = new MarkdownImporter().parse(source, schema);
  editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: document.toJSON() });
  view = new EditorView(globalThis.document.querySelector<HTMLElement>('#editor')!, editor, { ariaLabel: 'RTL Markdown table' });
}
mount();
document.querySelector('#reopen')!.addEventListener('click', () => {
  const result = new MarkdownExporter().exportWithReport(editor.state.doc);
  source = result.markdown; losses = result.losses; mount();
});
Object.assign(window, { markdownTableAlignmentAudit: { snapshot: () => ({ source, losses }) } });
