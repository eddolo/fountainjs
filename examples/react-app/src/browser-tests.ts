import {
  Decoration,
  DecorationSet,
  EditorView,
  LeanExtension,
  LeanController,
  Plugin,
  PluginKey,
  StarterKit,
  composeExtensions,
  createEditor,
  createLeanProvider,
  defineExtension,
  pasteRulesPlugin,
  setNodeAttributes,
  textPasteRule,
  type Node,
} from '../../../src';
import '../../../src/styles.css';

const decorationKey = new PluginKey<DecorationSet>('browser-contract');
const decorations = new Plugin<DecorationSet>({
  key: decorationKey,
  state: {
    init: (_config, state) => DecorationSet.create(state.doc, [
      Decoration.node(0, 12, { class: 'tested-paragraph' }, { key: 'paragraph' }),
      Decoration.inline(1, 6, { class: 'tested-range' }, { key: 'range' }),
      Decoration.inline(4, 10, { class: 'tested-overlap' }, { key: 'overlap' }),
      Decoration.widget(6, () => {
        const caret = document.createElement('span');
        caret.className = 'tested-caret';
        caret.textContent = 'Remote';
        caret.setAttribute('aria-label', 'Remote collaborator cursor');
        return caret;
      }, { key: 'remote', side: 1 }),
    ]),
    apply: (transaction, value, _oldState, newState) => value.map(transaction.mapping, newState.doc),
  },
  props: { decorations: (state) => decorationKey.get(state) },
});

const pasteRules = pasteRulesPlugin({
  rules: [textPasteRule({ find: /--/g, replace: '—', name: 'browser-em-dashes' })],
});

const nodeViewMetrics = { created: 0, destroyed: 0, updates: 0 };
class BrowserCounterNodeView {
  dom = document.createElement('button');
  constructor(node: Node, view: unknown, getPath: () => number[]) {
    nodeViewMetrics.created += 1;
    this.dom.type = 'button';
    this.dom.dataset.browserCounter = '';
    this.render(node);
    this.dom.addEventListener('click', () => {
      const editorView = view as EditorView;
      const current = editorView.editor.state.doc;
      let target = current;
      for (const index of getPath()) target = target.child(index);
      setNodeAttributes(editorView.editor, getPath(), { count: Number(target.attrs.count) + 1 });
    });
  }
  update(node: Node): boolean {
    nodeViewMetrics.updates += 1;
    this.render(node);
    return true;
  }
  selectNode(): void { this.dom.dataset.selectionHook = 'selected'; }
  deselectNode(): void { delete this.dom.dataset.selectionHook; }
  stopEvent(): boolean { return true; }
  ignoreMutation(mutation: MutationRecord): boolean {
    return mutation.type === 'attributes' && mutation.attributeName === 'data-local-state';
  }
  destroy(): void { nodeViewMetrics.destroyed += 1; }
  private render(node: Node): void { this.dom.textContent = `Count ${String(node.attrs.count)}`; }
}

const browserNodeView = defineExtension({
  name: 'browser-node-view',
  nodes: {
    browser_counter: {
      group: 'block',
      atom: true,
      attrs: { count: { default: 0, validate: (value) => Number.isInteger(value) } },
      nodeView: BrowserCounterNodeView,
    },
  },
});
const browserKit = composeExtensions([...StarterKit.extensions, browserNodeView, LeanExtension]);

const editor = createEditor({
  schema: browserKit.schema,
  plugins: [...browserKit.plugins, decorations, pasteRules],
  content: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Alpha Beta' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
      { type: 'browser_counter', attrs: { count: 0 } },
    ],
  },
});

const mount = document.querySelector<HTMLElement>('#editor');
const output = document.querySelector<HTMLOutputElement>('#document-json');
if (!mount || !output) throw new Error('Browser contract fixture failed to mount.');

const view = new EditorView(mount, editor, { ariaLabel: 'Browser contract editor' });
const commands = view.commandManager(browserKit.commands);
const leanController = new LeanController(editor, createLeanProvider({
  descriptor: { id: 'browser-one-shot', label: 'Browser one-shot checker', mode: 'one-shot', dataDestination: 'device' },
  check: async () => ({
    status: 'errors',
    diagnostics: [{
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
      severity: 'error',
      message: 'Browser fixture diagnostic',
    }],
  }),
}));
const updateOutput = () => { output.value = JSON.stringify(editor.getJSON()); };
updateOutput();
editor.subscribe(updateOutput);

Object.assign(globalThis, { fountainBrowserTest: { commands, editor, view, leanController, nodeViewMetrics } });
