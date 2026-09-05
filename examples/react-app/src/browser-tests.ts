import {
  Decoration,
  ClipboardHistoryExtension,
  DecorationSet,
  CoreExtension,
  EditorView,
  LeanExtension,
  LeanController,
  MarkdownExporter,
  MarkdownImporter,
  Plugin,
  PluginKey,
  Selection,
  StarterKit,
  composeExtensions,
  createEditor,
  createLeanProvider,
  defineExtension,
  getClipboardHistoryState,
  pasteRulesPlugin,
  startImageUpload,
  setNodeAttributes,
  textPasteRule,
  type Node,
} from '../../../src';
import * as Y from 'yjs';
import { createYjsCollaborationExtension } from '../../../src/yjs';
import {
  PagesExtension,
  inspectFootnotes,
  insertFootnote,
  insertPageBreak,
  removeFootnote,
  selectFootnoteDefinition,
} from '../../../src/pages';
import {
  acceptTrackedSuggestion,
  createTrackedChangesExtension,
  getTrackedChangesState,
  rejectTrackedSuggestion,
} from '../../../src/tracked-changes';
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
      parseDOM: [{
        tag: '[data-browser-counter-html]',
        getAttrs: (element) => ({ count: Number(element.dataset.count) }),
      }],
      toDOM: (node) => ['div', { 'data-browser-counter-html': '', 'data-count': node.attrs.count }],
      nodeView: BrowserCounterNodeView,
    },
  },
});
const browserKit = composeExtensions([...StarterKit.extensions, browserNodeView, LeanExtension, ClipboardHistoryExtension]);

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

const view = new EditorView(mount, editor, { ariaLabel: 'Browser contract editor', blockHandles: true });
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

const leftYDocument = new Y.Doc();
const leftCollaboration = createYjsCollaborationExtension({
  document: leftYDocument,
  user: { id: 'browser-left', name: 'Browser left', color: '#6d4aff' },
});
const leftKit = composeExtensions([CoreExtension, leftCollaboration]);
const leftEditor = createEditor({
  schema: leftKit.schema,
  plugins: leftKit.plugins,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared collaboration' }] }] },
});
const rightYDocument = new Y.Doc();
Y.applyUpdate(rightYDocument, Y.encodeStateAsUpdate(leftYDocument), 'initial-browser-sync');
const rightCollaboration = createYjsCollaborationExtension({
  document: rightYDocument,
  user: { id: 'browser-right', name: 'Browser right', color: '#d23877' },
});
const rightKit = composeExtensions([CoreExtension, rightCollaboration]);
const rightEditor = createEditor({
  schema: rightKit.schema,
  plugins: rightKit.plugins,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared collaboration' }] }] },
});
let collaborationLinked = true;
const updateRight = (update: Uint8Array, origin: unknown) => {
  if (collaborationLinked && origin !== rightYDocument) Y.applyUpdate(rightYDocument, update, leftYDocument);
};
const updateLeft = (update: Uint8Array, origin: unknown) => {
  if (collaborationLinked && origin !== leftYDocument) Y.applyUpdate(leftYDocument, update, rightYDocument);
};
leftYDocument.on('update', updateRight);
rightYDocument.on('update', updateLeft);
const leftCollaborationMount = document.querySelector<HTMLElement>('#collaboration-left');
const rightCollaborationMount = document.querySelector<HTMLElement>('#collaboration-right');
if (!leftCollaborationMount || !rightCollaborationMount) throw new Error('Collaboration fixture failed to mount.');
const leftCollaborationView = new EditorView(leftCollaborationMount, leftEditor, { ariaLabel: 'Collaborative editor left' });
const rightCollaborationView = new EditorView(rightCollaborationMount, rightEditor, { ariaLabel: 'Collaborative editor right' });

let trackedIdentifier = 0;
const trackedExtension = createTrackedChangesExtension({
  user: { id: 'browser-author', name: 'Browser author with a complete name', color: '#6d4aff' },
  idFactory: () => `browser-review-${++trackedIdentifier}`,
  now: () => '2026-09-04T12:00:00.000Z',
});
const trackedKit = composeExtensions([CoreExtension, trackedExtension]);
const trackedEditor = createEditor({
  schema: trackedKit.schema,
  plugins: trackedKit.plugins,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha review' }] }] },
});
const trackedMount = document.querySelector<HTMLElement>('#tracked-editor');
if (!trackedMount) throw new Error('Tracked changes fixture failed to mount.');
const trackedView = new EditorView(trackedMount, trackedEditor, { ariaLabel: 'Tracked changes contract editor' });
const trackedCommands = trackedView.commandManager(trackedKit.commands);

const pagesKit = composeExtensions([CoreExtension, PagesExtension]);
const pagesEditor = createEditor({
  schema: pagesKit.schema,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Browser pages' }] }] },
});
const pagesMount = document.querySelector<HTMLElement>('#pages-editor');
if (!pagesMount) throw new Error('Pages fixture failed to mount.');
const pagesView = new EditorView(pagesMount, pagesEditor, { ariaLabel: 'Page intent contract editor' });

const resumeCollaboration = () => {
  const leftUpdate = Y.encodeStateAsUpdate(leftYDocument);
  const rightUpdate = Y.encodeStateAsUpdate(rightYDocument);
  collaborationLinked = true;
  Y.applyUpdate(leftYDocument, rightUpdate, rightYDocument);
  Y.applyUpdate(rightYDocument, leftUpdate, leftYDocument);
};

const inspectMarkdown = (source: string) => {
  const document = MarkdownImporter.parse(source, editor.state.schema);
  const exported = MarkdownExporter.exportWithReport(document, { linkStyle: 'reference' });
  return {
    document: document.toJSON(),
    markdown: exported.markdown,
    losses: exported.losses,
    roundTrip: MarkdownImporter.parse(exported.markdown, editor.state.schema).toJSON(),
  };
};

const runPerformanceBudget = async () => {
  const kit = composeExtensions([CoreExtension]);
  const content = {
    type: 'doc',
    content: Array.from({ length: 1_000 }, (_, index) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `Line ${index}` }],
    })),
  };
  const performanceEditor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const performanceView = new EditorView(mount, performanceEditor);
  const before = [...performanceView.dom.children];
  performanceEditor.dispatch(performanceEditor.state.createTransaction().setSelection(Selection.cursor([500, 0], 8)));
  let added = 0;
  let removed = 0;
  const observer = new MutationObserver((records) => records.forEach((record) => {
    added += record.addedNodes.length;
    removed += record.removedNodes.length;
  }));
  observer.observe(performanceView.dom, { childList: true, subtree: true });

  const started = performance.now();
  performanceView.dom.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: '!',
  }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const inputToPaint = performance.now() - started;
  observer.disconnect();
  const after = [...performanceView.dom.children];
  const retainedBlocks = after.filter((node, index) => node === before[index]).length;
  const text = performanceEditor.state.doc.child(500).textContent;
  performanceView.destroy();
  performanceEditor.destroy();
  const remainingDOM = mount.childElementCount;
  mount.remove();
  return { inputToPaint, added, removed, retainedBlocks, text, remainingDOM };
};

Object.assign(globalThis, {
  fountainBrowserTest: {
    commands,
    editor,
    view,
    leanController,
    nodeViewMetrics,
    clipboardHistory: () => getClipboardHistoryState(editor),
    inspectMarkdown,
    markdownLosses: () => MarkdownExporter.exportWithReport(editor.state.doc).losses,
    performanceBudget: runPerformanceBudget,
    startImageUpload,
    collaboration: {
      leftEditor,
      rightEditor,
      leftView: leftCollaborationView,
      rightView: rightCollaborationView,
      pause: () => { collaborationLinked = false; },
      resume: resumeCollaboration,
      closeLeftHistory: () => leftKit.commands.closeCollaborationHistory?.(leftEditor),
      undoLeft: () => leftKit.commands.undoCollaboration?.(leftEditor),
    },
    tracked: {
      editor: trackedEditor,
      view: trackedView,
      commands: trackedCommands,
      state: () => getTrackedChangesState(trackedEditor),
      accept: (id: string) => acceptTrackedSuggestion(trackedEditor, id),
      reject: (id: string) => rejectTrackedSuggestion(trackedEditor, id),
    },
    pages: {
      editor: pagesEditor,
      view: pagesView,
      insertBreak: () => insertPageBreak(pagesEditor),
      insertFootnote: () => {
        pagesEditor.dispatch(pagesEditor.state.createTransaction().setSelection(Selection.cursor([0, 0], 13)));
        return insertFootnote(pagesEditor, { id: 'browser-note', content: 'Browser footnote definition' });
      },
      inspect: () => inspectFootnotes(pagesEditor.state.doc),
      selectDefinition: () => selectFootnoteDefinition(pagesEditor, 'browser-note'),
      removeFootnote: () => removeFootnote(pagesEditor, 'browser-note'),
    },
  },
});
