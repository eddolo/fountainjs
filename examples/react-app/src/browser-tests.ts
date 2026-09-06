import {
  Decoration,
  ClipboardHistoryExtension,
  DecorationSet,
  CoreExtension,
  EditorView,
  HistoryExtension,
  HTMLImporter,
  LeanExtension,
  LeanController,
  MathExtension,
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
  moveBlock,
  pasteRulesPlugin,
  startImageUpload,
  setNodeAttributes,
  textPasteRule,
  type ExternalPasteReport,
  type Node,
} from '../../../src';
import * as Y from 'yjs';
import { createYjsCollaborationExtension } from '../../../src/yjs';
import {
  PagesExtension,
  createPageGeometry,
  insertPageField,
  inspectFootnotes,
  inspectPageTemplates,
  insertFootnote,
  insertPageBreak,
  removeFootnote,
  selectFootnoteDefinition,
  setPageTemplate,
} from '../../../src/pages';
import { createDOMEditablePageController, createDOMPageLayoutController, layoutDOMPages } from '../../../src/pages/dom';
import { renderDOMPagePreview, type DOMPagePreviewOptions } from '../../../src/pages/preview';
import {
  acceptTrackedSuggestion,
  createTrackedChangesExtension,
  getTrackedChangesState,
  rejectTrackedSuggestion,
} from '../../../src/tracked-changes';
import {
  InMemoryCommentsStore,
  createCommentThread,
  createCommentsExtension,
  getCommentsState,
} from '../../../src/comments';
import { DetailsExtension } from '../../../src/details';
import { RubyExtension } from '../../../src/ruby';
import '../../../src/styles.css';

const browserFixture = new URLSearchParams(globalThis.location.search).get('fixture');
const splitParagraphText = Array.from({ length: 18 }, (_, index) => (
  `Sentence ${index + 1} proves one canonical paragraph can continue across editable page boundaries. `
)).join('');
const splitListContent = {
  type: 'doc',
  content: [{
    type: 'ordered_list',
    attrs: { start: 4 },
    content: Array.from({ length: 16 }, (_, index) => ({
      type: 'list_item',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: `Canonical list item ${index + 4} remains editable and correctly numbered.` }],
      }],
    })),
  }],
};
const splitTableContent = {
  type: 'doc',
  content: [{
    type: 'table',
    content: [
      {
        type: 'table_row',
        content: ['Record', 'Status'].map((value) => ({
          type: 'table_header',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
        })),
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        type: 'table_row',
        content: [`Canonical row ${index + 1}`, `Editable value ${index + 1}`].map((value) => ({
          type: 'table_cell',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
        })),
      })),
    ],
  }],
};
const complexTableContent = {
  type: 'doc',
  content: [{
    type: 'table',
    content: [
      {
        type: 'table_row',
        content: [
          {
            type: 'table_header', attrs: { colspan: 2 },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Merged report' }] }],
          },
          {
            type: 'table_header', attrs: { rowspan: 2 },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Owner' }] }],
          },
        ],
      },
      {
        type: 'table_row',
        content: ['Quarter', 'Status'].map((value) => ({
          type: 'table_header',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
        })),
      },
      ...Array.from({ length: 4 }, (_, groupIndex) => ([
        {
          type: 'table_row',
          content: [
            {
              type: 'table_cell', attrs: { rowspan: 2 },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: `Group ${groupIndex + 1}` }] }],
            },
            ...[`Entry ${groupIndex + 1}`, `Editor ${groupIndex + 1}`].map((value) => ({
              type: 'table_cell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
            })),
          ],
        },
        {
          type: 'table_row',
          content: [{
            type: 'table_cell', attrs: { colspan: 2 },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: `Merged continuation ${groupIndex + 1}` }] }],
          }],
        },
      ])).flat(),
    ],
  }],
};
const oversizedTableContent = {
  type: 'doc',
  content: [{
    type: 'table',
    content: [
      {
        type: 'table_row',
        content: [{
          type: 'table_header',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Oversized record' }] }],
        }],
      },
      {
        type: 'table_row',
        content: [{
          type: 'table_cell',
          content: Array.from({ length: 16 }, (_, index) => ({
            type: 'paragraph',
            content: [{ type: 'text', text: `Unsplit row paragraph ${index + 1} remains canonical and editable.` }],
          })),
        }],
      },
    ],
  }],
};
const editablePageIntentContent = {
  type: 'doc',
  content: [
    {
      type: 'page_header', attrs: { variant: 'default' }, content: [{
        type: 'paragraph', content: [
          { type: 'text', text: 'Canonical report · ' },
          { type: 'page_field', attrs: { kind: 'page-number' } },
        ],
      }],
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      type: 'paragraph',
      content: index === 0
        ? [
            { type: 'text', text: 'Body claim with a canonical footnote' },
            { type: 'footnote_reference', attrs: { id: 'intent-note' } },
          ]
        : [{ type: 'text', text: `Editable page body paragraph ${index + 1}.` }],
    })),
    {
      type: 'page_footer', attrs: { variant: 'default' }, content: [{
        type: 'paragraph', content: [
          { type: 'text', text: 'Total pages · ' },
          { type: 'page_field', attrs: { kind: 'page-count' } },
        ],
      }],
    },
    {
      type: 'footnote_definition', attrs: { id: 'intent-note' }, content: [{
        type: 'paragraph', content: [{ type: 'text', text: 'Canonical editable footnote evidence.' }],
      }],
    },
  ],
};
const editableAtomicPageContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Atomic page surfaces remain canonical.' }] },
    {
      type: 'image_super',
      attrs: {
        src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        alt: 'Paged atomic image',
        caption: 'One canonical image.',
        width: '160px',
        height: '72px',
      },
    },
    {
      type: 'audio',
      attrs: {
        src: '/paged-audio.mp3',
        title: 'Paged audio',
        caption: 'One canonical audio player.',
      },
    },
    {
      type: 'details',
      attrs: { open: false },
      content: [
        { type: 'details_summary', content: [{ type: 'text', text: 'Canonical disclosure' }] },
        ...Array.from({ length: 6 }, (_, index) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `Disclosure paragraph ${index + 1} remains inside one model node.` }],
        })),
      ],
    },
    {
      type: 'code_block',
      attrs: { language: 'text', lineNumbers: true },
      content: [{
        type: 'text',
        text: Array.from({ length: 14 }, (_, index) => `const pageLine${index + 1} = ${index + 1};`).join('\n'),
      }],
    },
    { type: 'browser_counter', attrs: { count: 0, pageHeight: 240 } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Content after the oversized custom atom remains reachable.' }] },
  ],
};
const splitPageIntegrationsFixture = browserFixture === 'split-page-integrations';
const splitListPageIntegrationsFixture = browserFixture === 'split-list-page-integrations';
const splitTablePageIntegrationsFixture = browserFixture === 'split-table-page-integrations';
const pageIntegrationsFixture = browserFixture === 'page-integrations'
  || splitPageIntegrationsFixture
  || splitListPageIntegrationsFixture
  || splitTablePageIntegrationsFixture;
const automaticPageContent = splitPageIntegrationsFixture ? {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: splitParagraphText }] }],
} : splitListPageIntegrationsFixture ? splitListContent
  : splitTablePageIntegrationsFixture ? splitTableContent : {
  type: 'doc',
  content: Array.from({ length: 5 }, (_, index) => ({
    type: 'paragraph',
    content: [
      { type: 'text', text: `Automatic page block ${index + 1}, line one.` },
      { type: 'hard_break' },
      { type: 'text', text: 'Line two remains in the same canonical block.' },
      { type: 'hard_break' },
      { type: 'text', text: 'Line three proves the boundary is layout-owned.' },
    ],
  })),
};

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
  private render(node: Node): void {
    const pageHeight = Number(node.attrs.pageHeight);
    this.dom.style.display = pageHeight > 0 ? 'block' : '';
    this.dom.style.width = pageHeight > 0 ? '100%' : '';
    this.dom.style.minHeight = pageHeight > 0 ? `${pageHeight}px` : '';
    if (pageHeight <= 0) {
      this.dom.textContent = `Count ${String(node.attrs.count)}`;
      return;
    }
    const fragmentHeight = pageHeight / 3;
    this.dom.replaceChildren(...Array.from({ length: 3 }, (_value, index) => {
      const fragment = document.createElement('span');
      fragment.dataset.browserCounterFragment = String(index + 1);
      fragment.style.display = 'block';
      fragment.style.blockSize = `${fragmentHeight}px`;
      if (index === 0) fragment.textContent = `Count ${String(node.attrs.count)}`;
      return fragment;
    }));
  }
}

const browserNodeView = defineExtension({
  name: 'browser-node-view',
  nodes: {
    browser_counter: {
      group: 'block',
      atom: true,
      attrs: {
        count: { default: 0, validate: (value) => Number.isInteger(value) },
        pageHeight: {
          default: 0,
          validate: (value) => Number.isFinite(value) && Number(value) >= 0 && Number(value) <= 1_000,
        },
      },
      parseDOM: [{
        tag: '[data-browser-counter-html]',
        getAttrs: (element) => ({
          count: Number(element.dataset.count),
          pageHeight: Number(element.dataset.pageHeight ?? 0),
        }),
      }],
      toDOM: (node) => ['div', {
        'data-browser-counter-html': '',
        'data-count': node.attrs.count,
        'data-page-height': node.attrs.pageHeight,
      }],
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

const pasteReports: ExternalPasteReport[] = [];
const view = new EditorView(mount, editor, {
  ariaLabel: 'Browser contract editor',
  blockHandles: true,
  paste: { onReport: (report) => pasteReports.push(report) },
});
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
let leftPageTrackedIdentifier = 0;
const leftPageTracked = createTrackedChangesExtension({
  user: { id: 'browser-left', name: 'Browser left', color: '#6d4aff' },
  idFactory: () => `browser-left-page-review-${++leftPageTrackedIdentifier}`,
  now: () => '2026-09-05T12:00:00.000Z',
});
const pageCommentsStore = new InMemoryCommentsStore();
let leftPageCommentIdentifier = 0;
const leftPageComments = createCommentsExtension({
  adapter: () => pageCommentsStore.createAdapter(),
  user: { id: 'browser-left', name: 'Browser left' },
  idFactory: (kind) => `browser-left-page-${kind}-${++leftPageCommentIdentifier}`,
  now: () => new Date('2026-09-05T12:00:00.000Z'),
});
const leftKit = composeExtensions(pageIntegrationsFixture
  ? [CoreExtension, PagesExtension, leftPageTracked, leftCollaboration, leftPageComments]
  : [CoreExtension, leftCollaboration]);
const leftEditor = createEditor({
  schema: leftKit.schema,
  plugins: leftKit.plugins,
  content: pageIntegrationsFixture
    ? automaticPageContent
    : { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared collaboration' }] }] },
});
const rightYDocument = new Y.Doc();
Y.applyUpdate(rightYDocument, Y.encodeStateAsUpdate(leftYDocument), 'initial-browser-sync');
const rightCollaboration = createYjsCollaborationExtension({
  document: rightYDocument,
  user: { id: 'browser-right', name: 'Browser right', color: '#d23877' },
});
let rightPageTrackedIdentifier = 0;
const rightPageTracked = createTrackedChangesExtension({
  user: { id: 'browser-right', name: 'Browser right', color: '#d23877' },
  idFactory: () => `browser-right-page-review-${++rightPageTrackedIdentifier}`,
  now: () => '2026-09-05T12:01:00.000Z',
});
let rightPageCommentIdentifier = 0;
const rightPageComments = createCommentsExtension({
  adapter: () => pageCommentsStore.createAdapter(),
  user: { id: 'browser-right', name: 'Browser right' },
  idFactory: (kind) => `browser-right-page-${kind}-${++rightPageCommentIdentifier}`,
  now: () => new Date('2026-09-05T12:01:00.000Z'),
});
const rightKit = composeExtensions(pageIntegrationsFixture
  ? [CoreExtension, PagesExtension, rightPageTracked, rightCollaboration, rightPageComments]
  : [CoreExtension, rightCollaboration]);
const rightEditor = createEditor({
  schema: rightKit.schema,
  plugins: rightKit.plugins,
  content: pageIntegrationsFixture
    ? automaticPageContent
    : { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared collaboration' }] }] },
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

const pageIntegrationGeometry = createPageGeometry({
  size: { width: 420, height: 300 },
  margins: 40,
  headerHeight: 20,
  footerHeight: 20,
});
const pageIntegrationMeasurement = splitPageIntegrationsFixture
  || splitListPageIntegrationsFixture
  || splitTablePageIntegrationsFixture
  ? {}
  : { lineFragmentNodeTypes: [] };
const leftPageController = pageIntegrationsFixture
  ? createDOMEditablePageController(
      leftCollaborationView.dom,
      () => leftEditor.state.doc,
      pageIntegrationGeometry,
      { measurement: pageIntegrationMeasurement },
    )
  : null;
const rightPageController = pageIntegrationsFixture
  ? createDOMEditablePageController(
      rightCollaborationView.dom,
      () => rightEditor.state.doc,
      pageIntegrationGeometry,
      { measurement: pageIntegrationMeasurement },
    )
  : null;

let trackedIdentifier = 0;
const trackedExtension = createTrackedChangesExtension({
  user: { id: 'browser-author', name: 'Browser author with a complete name', color: '#6d4aff' },
  idFactory: () => `browser-review-${++trackedIdentifier}`,
  now: () => '2026-09-04T12:00:00.000Z',
});
const trackedKit = composeExtensions(pageIntegrationsFixture
  ? [CoreExtension, PagesExtension, trackedExtension]
  : [CoreExtension, trackedExtension]);
const trackedEditor = createEditor({
  schema: trackedKit.schema,
  plugins: trackedKit.plugins,
  content: pageIntegrationsFixture
    ? automaticPageContent
    : { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha review' }] }] },
});
const trackedMount = document.querySelector<HTMLElement>('#tracked-editor');
if (!trackedMount) throw new Error('Tracked changes fixture failed to mount.');
const trackedView = new EditorView(trackedMount, trackedEditor, { ariaLabel: 'Tracked changes contract editor' });
const trackedCommands = trackedView.commandManager(trackedKit.commands);
const trackedPageController = pageIntegrationsFixture
  ? createDOMEditablePageController(
      trackedView.dom,
      () => trackedEditor.state.doc,
      pageIntegrationGeometry,
      { measurement: pageIntegrationMeasurement },
    )
  : null;

const pageIntegrationCommentPath = (): readonly number[] => {
  if (splitTablePageIntegrationsFixture) return Object.freeze([0, 3, 0, 0, 0]);
  if (splitListPageIntegrationsFixture) return Object.freeze([0, 5, 0, 0]);
  return Object.freeze([0, 0]);
};

const createPageIntegrationComment = async () => {
  if (!pageIntegrationsFixture) throw new Error('Page integration comments require a page integration fixture.');
  const path = pageIntegrationCommentPath();
  return createCommentThread(leftEditor, {
    content: 'Comment anchored across an automatic page boundary.',
    selection: Selection.range(path, 0, path, 9),
  });
};

const pagesKit = composeExtensions([
  CoreExtension,
  HistoryExtension,
  PagesExtension,
  MathExtension,
  RubyExtension,
]);
const pagesEditor = createEditor({
  schema: pagesKit.schema,
  plugins: pagesKit.plugins,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Browser pages' }] }] },
});
const pagesMount = document.querySelector<HTMLElement>('#pages-editor');
if (!pagesMount) throw new Error('Pages fixture failed to mount.');
const pagesView = new EditorView(pagesMount, pagesEditor, { ariaLabel: 'Page intent contract editor' });

const longFootnoteContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [
      { type: 'text', text: 'Claim' },
      { type: 'footnote_reference', attrs: { id: 'long-note' } },
    ] },
    { type: 'paragraph', content: [{ type: 'text', text: 'After.' }] },
    { type: 'footnote_definition', attrs: { id: 'long-note' }, content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: Array.from({ length: 120 }, (_value, index) => (
          `FN${String(index + 1).padStart(3, '0')} continuation evidence`
        )).join(' '),
      }],
    }] },
  ],
};

const adversarialPrintContent = {
  type: 'doc',
  content: [
    { type: 'page_header', attrs: { variant: 'default' }, content: [{
      type: 'paragraph', content: [
        { type: 'text', text: 'Adversarial report · ' },
        { type: 'page_field', attrs: { kind: 'page-number' } },
        { type: 'text', text: ' / ' },
        { type: 'page_field', attrs: { kind: 'page-count' } },
      ],
    }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'Beta is cited first' },
      { type: 'footnote_reference', attrs: { id: 'beta-proof' } },
      { type: 'text', text: '.' },
    ] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'Alpha follows with a long note' },
      { type: 'footnote_reference', attrs: { id: 'alpha-proof' } },
      { type: 'text', text: ', while beta is cited again' },
      { type: 'footnote_reference', attrs: { id: 'beta-proof' } },
      { type: 'text', text: `. ${'Wrapped body evidence remains measurable. '.repeat(12)}` },
    ] },
    ...complexTableContent.content,
    { type: 'page_break' },
    { type: 'paragraph', content: [
      { type: 'text', text: 'AFTERBREAK repeats alpha' },
      { type: 'footnote_reference', attrs: { id: 'alpha-proof' } },
      { type: 'text', text: '.' },
    ] },
    { type: 'footnote_definition', attrs: { id: 'alpha-proof' }, content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: Array.from({ length: 80 }, (_value, index) => (
          `ALPHA${String(index + 1).padStart(3, '0')} evidence`
        )).join(' '),
      }],
    }] },
    { type: 'footnote_definition', attrs: { id: 'beta-proof' }, content: [{
      type: 'paragraph', content: [{ type: 'text', text: 'BETAONLY concise evidence.' }],
    }] },
  ],
};

const importedStyledTokens = Array.from({ length: 72 }, (_value, index) => (
  `IMPORT${String(index + 1).padStart(3, '0')}`
)).join(' ');

const importedStyledHTML = `
  <h2 style="text-align:right"><span style="color:#123456;font-family:Georgia,serif;font-size:22px">Imported styled report</span></h2>
  <p style="text-align:justify"><span style="color:#6547ff;background-color:#e1dafe;font-family:Arial,sans-serif;font-size:18px;line-height:1.8">${importedStyledTokens}</span></p>
  <blockquote>
    <p>Semantic quotation with <ruby><strong>東京</strong><rp>(</rp><rt>とうきょう</rt><rp>)</rp></ruby>.</p>
    <ol start="4">
      <li><p>Nested imported item four.</p></li>
      <li><p>Nested imported item five.</p><p>A second paragraph remains in the same list item.</p></li>
    </ol>
  </blockquote>
  <table>
    <thead>
      <tr><th colspan="2">Imported records</th><th rowspan="2">Owner</th></tr>
      <tr><th>Record</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr><td rowspan="2">Group A</td><td>Ready</td><td>Ada</td></tr>
      <tr><td colspan="2">Merged follow-up</td></tr>
      <tr><td>Group B</td><td>Review</td><td>Grace</td></tr>
      <tr><td>Group C</td><td>Approved</td><td>Lin</td></tr>
      <tr><td>Group D</td><td>Ready</td><td>Edsger</td></tr>
      <tr><td>Group E</td><td>Review</td><td>Margaret</td></tr>
      <tr><td>Group F</td><td>Approved</td><td>Barbara</td></tr>
      <tr><td>Group G</td><td>Ready</td><td>Donald</td></tr>
      <tr><td>Group H</td><td>Review</td><td>Frances</td></tr>
      <tr><td>Group I</td><td>Approved</td><td>Alan</td></tr>
    </tbody>
  </table>
  <div data-fountain-math="block" data-latex="x^2+y^2=z^2" data-math-aria-label="Pythagorean theorem">x² + y² = z²</div>
  <hr data-fountain-page-break="true">
  <p>AFTERIMPORTEDBREAK remains after the explicit imported page break.</p>
`;

const adversarialPrintGeometry = () => createPageGeometry({
  size: { width: 360, height: 300 },
  margins: 16,
  headerHeight: 24,
  footerHeight: 16,
});

const importedStyledPrintGeometry = () => createPageGeometry({
  size: { width: 360, height: 420 },
  margins: 16,
  headerHeight: 24,
  footerHeight: 16,
});

const splitEditablePagesFixture = browserFixture === 'editable-split-pages';
const splitEditableListFixture = browserFixture === 'editable-list-pages';
const splitEditableTableFixture = browserFixture === 'editable-table-pages';
const complexEditableTableFixture = browserFixture === 'editable-complex-table-pages';
const oversizedEditableTableFixture = browserFixture === 'editable-oversized-table-pages';
const editablePageIntentFixture = browserFixture === 'editable-page-intent';
const editableAtomicPagesFixture = browserFixture === 'editable-atomic-pages';
const editableLongFootnoteFixture = browserFixture === 'editable-long-footnote-pages';
const editablePagesFixture = (browserFixture === 'editable-pages'
  || splitEditablePagesFixture
  || splitEditableListFixture
  || splitEditableTableFixture
  || complexEditableTableFixture
  || oversizedEditableTableFixture
  || editablePageIntentFixture
  || editableAtomicPagesFixture
  || editableLongFootnoteFixture)
  ? (() => {
      const errors: string[] = [];
      const pageKit = editableAtomicPagesFixture
        ? composeExtensions([...StarterKit.extensions, browserNodeView, DetailsExtension, PagesExtension])
        : pagesKit;
      const pageEditor = createEditor({
        schema: pageKit.schema,
        plugins: pageKit.plugins,
        content: splitEditablePagesFixture ? {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: splitParagraphText,
            }],
          }],
        } : splitEditableListFixture ? splitListContent
          : splitEditableTableFixture ? splitTableContent
            : complexEditableTableFixture ? complexTableContent
              : oversizedEditableTableFixture ? oversizedTableContent
              : editablePageIntentFixture ? editablePageIntentContent
                : editableAtomicPagesFixture ? editableAtomicPageContent
                  : editableLongFootnoteFixture ? longFootnoteContent : {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'First editable page' }] },
                  { type: 'page_break' },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Second editable page' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Selection and composition remain native.' }] },
                ],
              },
      });
      const mount = document.querySelector<HTMLElement>('#editable-pages-editor');
      if (!mount) throw new Error('Editable pages fixture failed to mount.');
      const view = new EditorView(mount, pageEditor, {
        ariaLabel: splitEditablePagesFixture
          ? 'Split paragraph page editor'
          : splitEditableListFixture
            ? 'Split list page editor'
            : splitEditableTableFixture
              ? 'Split table page editor'
              : complexEditableTableFixture
                ? 'Complex table page editor'
              : oversizedEditableTableFixture
                ? 'Oversized table page editor'
                : editablePageIntentFixture
                  ? 'Page furniture and footnote editor'
                  : editableAtomicPagesFixture
                    ? 'Atomic and structural page editor'
                    : editableLongFootnoteFixture
                      ? 'Long footnote page editor'
                    : 'Editable page canvas editor',
      });
      const geometry = createPageGeometry({
        size: { width: 420, height: 300 },
        margins: 40,
        headerHeight: 20,
        footerHeight: 20,
      });
      const controller = createDOMEditablePageController(
        view.dom,
        () => pageEditor.state.doc,
        geometry,
        {
          measurement: splitEditablePagesFixture || splitEditableListFixture
            || splitEditableTableFixture || complexEditableTableFixture || oversizedEditableTableFixture
            || editablePageIntentFixture || editableAtomicPagesFixture || editableLongFootnoteFixture
            ? {}
            : { lineFragmentNodeTypes: [] },
          onError: (error) => errors.push(error instanceof Error ? error.message : String(error)),
        },
      );
      return { editor: pageEditor, view, controller, commands: view.commandManager(pageKit.commands), errors };
    })()
  : null;

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

const inspectMarkdownSource = (source: string) => {
  const imported = MarkdownImporter.parseWithSource(source, editor.state.schema);
  const exact = MarkdownExporter.exportWithSource(imported.document, imported.source);
  const changed = editor.state.schema.node('doc', {}, [
    ...imported.document.content.slice(0, -1),
    editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Changed visually')]),
  ]);
  const edited = MarkdownExporter.exportWithSource(changed, imported.source);
  const structurallyChanged = editor.state.schema.node('doc', {}, [
    editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Inserted first')]),
    ...imported.document.content,
  ]);
  const structural = MarkdownExporter.exportWithSource(structurallyChanged, imported.source);
  return {
    exact,
    edited,
    structural,
    body: imported.source.body,
    lineEnding: imported.source.lineEnding,
    frontmatter: imported.source.frontmatter,
    sourceBlocks: imported.source.blocks.map((block) => ({
      source: block.source,
      separatorAfter: block.separatorAfter,
    })),
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

const runVirtualizationBudget = async (blockCount = 100_000) => {
  const kit = composeExtensions([CoreExtension]);
  const content = {
    type: 'doc',
    content: Array.from({ length: blockCount }, (_, index) => ({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: `Virtual browser block ${index}`,
        ...(index === 300 ? { marks: [{ type: 'strong' }] } : {}),
      }],
    })),
  };
  const virtualEditor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  const scrollContainer = document.createElement('div');
  scrollContainer.style.cssText = 'height:320px;overflow:auto;position:relative;width:600px';
  document.body.appendChild(scrollContainer);
  const started = performance.now();
  const virtualView = new EditorView(scrollContainer, virtualEditor, {
    ariaLabel: 'Virtual document fixture',
    virtualization: {
      scrollContainer,
      minimumBlockCount: 0,
      estimatedBlockHeight: 48,
      overscanPx: 480,
      pinnedOverscanBlocks: 1,
    },
  });
  const createDurationMs = performance.now() - started;
  const mountedCount = () => virtualView.dom.querySelectorAll(':scope > [data-fountain-path]').length;
  const initialMounted = mountedCount();
  const targetIndex = Math.floor(blockCount * 0.75);

  scrollContainer.scrollTop = Math.floor(blockCount * 48 * 0.25);
  scrollContainer.dispatchEvent(new Event('scroll'));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const scrolledMounted = mountedCount();
  const scrolledPaths = [...virtualView.dom.querySelectorAll<HTMLElement>(':scope > [data-fountain-path]')]
    .map((element) => Number(element.dataset.fountainPath));
  const scrollBeforeAnchorEdit = scrollContainer.scrollTop;
  const leading = virtualEditor.state.schema.node('paragraph', {}, [
    virtualEditor.state.schema.text('Leading anchor probe'),
  ]);
  virtualEditor.dispatch(virtualEditor.state.createTransaction().replace(0, 0, [leading]));
  const scrollAfterAnchorInsert = scrollContainer.scrollTop;
  virtualEditor.dispatch(virtualEditor.state.createTransaction().replace(0, 1));
  const scrollAfterAnchorRestore = scrollContainer.scrollTop;

  virtualEditor.dispatch(virtualEditor.state.createTransaction().setSelection(Selection.cursor([targetIndex, 0], 0)));
  await Promise.resolve();
  const selectedMounted = Boolean(virtualView.dom.querySelector(`[data-fountain-path="${targetIndex}"]`));
  virtualView.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  virtualView.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '東京' }));
  await Promise.resolve();
  const composedText = virtualEditor.state.doc.child(targetIndex).textContent;

  virtualEditor.dispatch(virtualEditor.state.createTransaction().setSelection(
    Selection.range([100, 0], 0, [500, 0], 'Virtual browser block 500'.length),
  ));
  await Promise.resolve();
  const copyMiddleBefore = Boolean(virtualView.dom.querySelector('[data-fountain-path="300"]'));
  const clipboard = new Map<string, string>();
  const copyEvent = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(copyEvent, 'clipboardData', { value: {
    files: [],
    getData: (format: string) => clipboard.get(format) ?? '',
    setData: (format: string, value: string) => { clipboard.set(format, value); },
  } });
  virtualView.dom.dispatchEvent(copyEvent);
  const copyMiddleDuring = Boolean(virtualView.dom.querySelector('[data-fountain-path="300"]'));
  const copyRichMiddleDuring = Boolean(virtualView.dom.querySelector('[data-fountain-path="300"] strong'));
  const copySelectionDuring = clipboard.get('text/plain') ?? '';
  const copyRichSelectionDuring = clipboard.get('text/html') ?? '';
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const copyMiddleAfter = Boolean(virtualView.dom.querySelector('[data-fountain-path="300"]'));

  const finalMounted = mountedCount();
  const totalHeight = virtualView.dom.scrollHeight;
  virtualView.destroy();
  virtualEditor.destroy();
  const remainingDOM = scrollContainer.childElementCount;
  scrollContainer.remove();

  const printEditor = createEditor({
    schema: kit.schema,
    plugins: kit.plugins,
    content: {
      type: 'doc',
      content: Array.from({ length: 300 }, (_, index) => ({
        type: 'paragraph', content: [{ type: 'text', text: `Printable virtual block ${index}` }],
      })),
    },
  });
  const printMount = document.body.appendChild(document.createElement('div'));
  const printView = new EditorView(printMount, printEditor, {
    virtualization: { minimumBlockCount: 0, estimatedBlockHeight: 48, overscanPx: 0 },
  });
  globalThis.dispatchEvent(new Event('beforeprint'));
  const printMounted = printView.dom.querySelectorAll(':scope > [data-fountain-path]').length;
  globalThis.dispatchEvent(new Event('afterprint'));
  const printRestored = printView.virtualized;
  printView.destroy();
  printEditor.destroy();
  printMount.remove();
  return {
    blockCount,
    createDurationMs,
    initialMounted,
    scrolledMounted,
    scrolledPathMinimum: Math.min(...scrolledPaths),
    scrolledPathMaximum: Math.max(...scrolledPaths),
    anchorInsertDelta: scrollAfterAnchorInsert - scrollBeforeAnchorEdit,
    anchorRestoreDelta: scrollAfterAnchorRestore - scrollBeforeAnchorEdit,
    selectedMounted,
    composedText,
    copyMiddleBefore,
    copyMiddleDuring,
    copyRichMiddleDuring,
    copyHandled: copyEvent.defaultPrevented,
    copySelectionComplete: copySelectionDuring.includes('Virtual browser block 100')
      && copySelectionDuring.includes('Virtual browser block 300')
      && copySelectionDuring.includes('Virtual browser block 500'),
    copyRichSelectionComplete: copyRichSelectionDuring.includes('Virtual browser block 100')
      && copyRichSelectionDuring.includes('<strong>Virtual browser block 300</strong>')
      && copyRichSelectionDuring.includes('Virtual browser block 500'),
    copyMiddleAfter,
    finalMounted,
    totalHeight,
    remainingDOM,
    printMounted,
    printRestored,
  };
};

const renderPagesPreview = (
  geometry: ReturnType<typeof createPageGeometry>,
  keepMounted = false,
  options: DOMPagePreviewOptions = {},
) => {
  pagesView.dom.style.boxSizing = 'content-box';
  pagesView.dom.style.width = `${geometry.size.width - geometry.margins.left - geometry.margins.right}px`;
  const snapshot = layoutDOMPages(pagesView.dom, pagesEditor.state.doc, geometry);
  document.querySelector('#browser-page-preview')?.remove();
  const target = document.createElement('div');
  target.id = 'browser-page-preview';
  document.body.appendChild(target);
  const before = pagesView.dom.outerHTML;
  const result = renderDOMPagePreview(pagesView.dom, target, geometry, snapshot, options);
  const output = {
    pageCount: result.pages.length,
    pageNumbers: result.pages.map((page) => page.dataset.fountainPage),
    pageWidth: geometry.size.width,
    pageHeight: geometry.size.height,
    printPageName: result.printPageName,
    printStyle: target.querySelector<HTMLStyleElement>('[data-fountain-page-print-style]')?.textContent,
    visualPagesHidden: result.pages.every((page) => page.getAttribute('aria-hidden') === 'true'),
    accessibleDocuments: target.querySelectorAll('.fountain-page-preview__accessible').length,
    clippedPlacements: target.querySelectorAll('.fountain-page-preview__clip').length,
    footnoteClips: [...target.querySelectorAll<HTMLElement>('.fountain-page-preview__footnote-clip')].map((clip) => ({
      page: clip.closest<HTMLElement>('[data-fountain-page]')?.dataset.fountainPage,
      height: clip.getBoundingClientRect().height,
      before: clip.dataset.fountainFootnoteContinuedBefore,
      after: clip.dataset.fountainFootnoteContinuedAfter,
      exact: clip.dataset.fountainFootnoteExactTextSlice,
      transform: (clip.firstElementChild as HTMLElement | null)?.style.transform,
    })),
    manualBreaks: result.pages.reduce((count, page) => (
      count + page.querySelectorAll('[data-fountain-page-break]').length
    ), 0),
    sourceUnchanged: pagesView.dom.outerHTML === before,
  };
  if (!keepMounted) target.remove();
  else target.scrollIntoView({ block: 'start' });
  return output;
};

const runPaginationIncrementalBudget = (options: {
  readonly blockCount?: number;
  readonly mutationIndexes?: readonly number[];
} = {}) => {
  const blockCount = options.blockCount ?? 1_000;
  const mutationIndexes = options.mutationIndexes ?? Array.from({ length: 20 }, () => 500);
  const kit = composeExtensions([CoreExtension, PagesExtension]);
  const largeEditor = createEditor({
    schema: kit.schema,
    plugins: kit.plugins,
    content: {
      type: 'doc',
      content: Array.from({ length: blockCount }, (_, index) => ({
        type: 'paragraph', content: [{ type: 'text', text: `Page block ${index}` }],
      })),
    },
  });
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const largeView = new EditorView(mount, largeEditor, { ariaLabel: 'Pagination performance fixture' });
  largeView.dom.style.boxSizing = 'content-box';
  largeView.dom.style.width = '300px';
  const geometry = createPageGeometry({ size: { width: 320, height: 1_000 }, margins: 10 });
  const before = [...largeView.dom.children];
  const controller = createDOMPageLayoutController(
    largeView.dom,
    () => largeEditor.state.doc,
    geometry,
    { observe: false, measurement: { lineFragmentNodeTypes: [] } },
  );
  try {
    const initial = controller.refreshNow('initial');
    const cycles = mutationIndexes.map((blockIndex, iteration) => {
      const current = largeEditor.state.doc.child(blockIndex);
      const replacement = current.copy([
        largeEditor.state.schema.text(`${current.textContent}!${iteration}`),
      ]);
      largeEditor.dispatch(largeEditor.state.createTransaction().replace(blockIndex, blockIndex + 1, [replacement]));
      return controller.refreshNow('mutation');
    });
    const after = [...largeView.dom.children];
    return {
      initialReads: initial.snapshot.measurement.measurementCount,
      incrementalReads: cycles.map((cycle) => cycle.snapshot.measurement.measurementCount),
      incrementalDurations: cycles.map((cycle) => cycle.durationMs),
      retainedBlocks: after.filter((node, index) => node === before[index]).length,
      blockCount: after.length,
      mutationIndexes,
    };
  } finally {
    controller.destroy();
    largeView.destroy();
    largeEditor.destroy();
    mount.remove();
  }
};

const runPaginationStructuralBudget = (blockCount = 5_000, iterations = 6) => {
  const kit = composeExtensions([CoreExtension, PagesExtension]);
  const largeEditor = createEditor({
    schema: kit.schema,
    plugins: kit.plugins,
    content: {
      type: 'doc',
      content: Array.from({ length: blockCount }, (_, index) => ({
        type: 'paragraph', content: [{ type: 'text', text: `Structural page block ${index}` }],
      })),
    },
  });
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const largeView = new EditorView(mount, largeEditor, { ariaLabel: 'Structural pagination fixture' });
  largeView.dom.style.boxSizing = 'content-box';
  largeView.dom.style.width = '300px';
  const before = [...largeView.dom.children];
  const controller = createDOMPageLayoutController(
    largeView.dom,
    () => largeEditor.state.doc,
    createPageGeometry({ size: { width: 320, height: 1_000 }, margins: 10 }),
    { observe: false, measurement: { lineFragmentNodeTypes: [] } },
  );
  try {
    const initial = controller.refreshNow('initial');
    const insertionReads: number[] = [];
    const insertionDurations: number[] = [];
    const removalReads: number[] = [];
    const removalDurations: number[] = [];
    let insertedRetainedBlocks = 0;
    let insertedLastPath: string | undefined;
    let insertedLastTextPath: string | undefined;
    let insertedLastItem: string | undefined;
    let insertedLastSourcePath: readonly number[] | undefined;
    let warnings = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const leading = largeEditor.state.schema.node('paragraph', {}, [
        largeEditor.state.schema.text(`Inserted page block ${iteration}`),
      ]);
      largeEditor.dispatch(largeEditor.state.createTransaction().replace(0, 0, [leading]));
      const insertion = controller.refreshNow('mutation');
      insertionReads.push(insertion.snapshot.measurement.measurementCount);
      insertionDurations.push(insertion.durationMs);
      warnings += insertion.snapshot.measurement.warnings.length;
      const inserted = [...largeView.dom.children];
      insertedRetainedBlocks = before.filter((node, index) => inserted[index + 1] === node).length;
      const last = inserted.at(-1) as HTMLElement | undefined;
      insertedLastPath = last?.dataset.fountainPath;
      insertedLastTextPath = last?.querySelector<HTMLElement>('[data-fountain-text-path]')?.dataset.fountainTextPath;
      insertedLastItem = insertion.snapshot.measurement.items.at(-1)?.id;
      insertedLastSourcePath = insertion.snapshot.measurement.fragmentSources.at(-1)?.sourcePath;

      largeEditor.dispatch(largeEditor.state.createTransaction().replace(0, 1));
      const removal = controller.refreshNow('mutation');
      removalReads.push(removal.snapshot.measurement.measurementCount);
      removalDurations.push(removal.durationMs);
      warnings += removal.snapshot.measurement.warnings.length;
    }
    const restored = [...largeView.dom.children];
    return {
      blockCount,
      iterations,
      initialReads: initial.snapshot.measurement.measurementCount,
      insertionReads,
      insertionDurations,
      removalReads,
      removalDurations,
      insertedRetainedBlocks,
      restoredRetainedBlocks: before.filter((node, index) => restored[index] === node).length,
      insertedLastPath,
      insertedLastTextPath,
      insertedLastItem,
      insertedLastSourcePath,
      restoredLastPath: (restored.at(-1) as HTMLElement | undefined)?.dataset.fountainPath,
      restoredLastTextPath: restored.at(-1)
        ?.querySelector<HTMLElement>('[data-fountain-text-path]')?.dataset.fountainTextPath,
      warnings,
    };
  } finally {
    controller.destroy();
    largeView.destroy();
    largeEditor.destroy();
    mount.remove();
  }
};

Object.assign(globalThis, {
  fountainBrowserTest: {
    commands,
    editor,
    view,
    leanController,
    nodeViewMetrics,
    pasteReports: () => [...pasteReports],
    clearPasteReports: () => { pasteReports.length = 0; },
    clipboardHistory: () => getClipboardHistoryState(editor),
    inspectMarkdown,
    inspectMarkdownSource,
    markdownLosses: () => MarkdownExporter.exportWithReport(editor.state.doc).losses,
    performanceBudget: runPerformanceBudget,
    virtualizationBudget: runVirtualizationBudget,
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
      setHeader: () => setPageTemplate(pagesEditor, { kind: 'header', content: 'Browser report · ' }),
      insertPageNumber: () => {
        const headerIndex = pagesEditor.state.doc.content.findIndex((node) => node.type.name === 'page_header');
        const header = pagesEditor.state.doc.content[headerIndex];
        if (!header) return false;
        pagesEditor.dispatch(pagesEditor.state.createTransaction().setSelection(
          Selection.cursor([headerIndex, 0, 0], header.textContent.length),
        ));
        return insertPageField(pagesEditor, 'page-number');
      },
      inspectTemplates: () => inspectPageTemplates(pagesEditor.state.doc),
      loadLongFootnoteFixture: () => {
        const fixture = pagesEditor.state.schema.nodeFromJSON(longFootnoteContent);
        pagesEditor.dispatch(pagesEditor.state.createTransaction()
          .replace(0, pagesEditor.state.doc.childCount, fixture.content)
          .setSelection(Selection.cursor([0, 0], 0)));
        pagesView.dom.style.boxSizing = 'content-box';
        pagesView.dom.style.width = '240px';
        return true;
      },
      loadMeasurementFixture: () => {
        const fixture = pagesEditor.state.schema.nodeFromJSON({
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Measured layout' }] },
            { type: 'paragraph', content: [
              { type: 'text', text: 'A long measured paragraph wraps into several legal browser line boxes. '.repeat(7) },
              { type: 'footnote_reference', attrs: { id: 'measure-note' } },
              { type: 'text', text: ' Final words.' },
            ] },
            { type: 'bullet_list', content: [
              { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First list item' }] }] },
              { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second list item' }] }] },
              { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third list item' }] }] },
            ] },
            { type: 'table', content: [
              { type: 'table_row', content: [
                { type: 'table_header', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
                { type: 'table_header', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Value' }] }] },
              ] },
              { type: 'table_row', content: [
                { type: 'table_cell', attrs: { rowspan: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Grouped' }] }] },
                { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
              ] },
              { type: 'table_row', content: [
                { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] },
              ] },
            ] },
            { type: 'page_break' },
            { type: 'paragraph', content: [{ type: 'text', text: 'After the manual break' }] },
            { type: 'footnote_definition', attrs: { id: 'measure-note' }, content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'A measured footnote body.' }] },
            ] },
          ],
        });
        const transaction = pagesEditor.state.createTransaction()
          .replace(0, pagesEditor.state.doc.childCount, fixture.content)
          .setSelection(Selection.cursor([0, 0], 0));
        pagesEditor.dispatch(transaction);
        pagesView.dom.style.boxSizing = 'content-box';
        pagesView.dom.style.width = '240px';
        return true;
      },
      loadAdversarialPrintFixture: () => {
        const fixture = pagesEditor.state.schema.nodeFromJSON(adversarialPrintContent);
        pagesEditor.dispatch(pagesEditor.state.createTransaction()
          .replace(0, pagesEditor.state.doc.childCount, fixture.content)
          .setSelection(Selection.cursor([1, 0], 0)));
        pagesView.dom.style.boxSizing = 'content-box';
        pagesView.dom.style.width = '328px';
        return true;
      },
      loadImportedStyledFixture: () => {
        const fixture = HTMLImporter.parse(importedStyledHTML, pagesEditor.state.schema);
        pagesEditor.dispatch(pagesEditor.state.createTransaction()
          .replace(0, pagesEditor.state.doc.childCount, fixture.content)
          .setSelection(Selection.cursor([0, 0], 0)));
        pagesView.dom.style.boxSizing = 'content-box';
        pagesView.dom.style.width = '328px';
        const headingText = fixture.child(0).child(0);
        const styledText = fixture.child(1).child(0);
        const quotation = fixture.child(2);
        const table = fixture.child(3);
        let ruby: ReturnType<Node['toJSON']> | undefined;
        quotation.descendants((node) => {
          if (!ruby && node.type.name === 'ruby') ruby = node.toJSON();
        });
        return {
          types: fixture.content.map((node) => node.type.name),
          headingAlign: fixture.child(0).attrs.align,
          headingMarks: Object.fromEntries(headingText.marks.map((mark) => [mark.type.name, mark.attrs])),
          paragraphAlign: fixture.child(1).attrs.align,
          paragraphMarks: Object.fromEntries(styledText.marks.map((mark) => [mark.type.name, mark.attrs])),
          ruby,
          nestedListStart: quotation.child(1).attrs.start,
          secondItemBlocks: quotation.child(1).child(1).childCount,
          tableHeader: table.child(0).child(0).attrs,
          tableRowspan: table.child(2).child(0).attrs.rowspan,
          tableColspan: table.child(3).child(0).attrs.colspan,
          math: fixture.child(4).attrs,
        };
      },
      measure: () => layoutDOMPages(
        pagesView.dom,
        pagesEditor.state.doc,
        createPageGeometry({ size: { width: 260, height: 120 }, margins: 10 }),
      ),
      measureLongFootnote: () => layoutDOMPages(
        pagesView.dom,
        pagesEditor.state.doc,
        createPageGeometry({ size: { width: 260, height: 160 }, margins: 10 }),
      ),
      preview: (keepMounted = false) => renderPagesPreview(
        createPageGeometry({ size: { width: 260, height: 120 }, margins: 10 }),
        keepMounted,
      ),
      previewLongFootnote: () => renderPagesPreview(
        createPageGeometry({ size: { width: 260, height: 160 }, margins: 10 }),
        true,
      ),
      measureAdversarialPrint: () => layoutDOMPages(
        pagesView.dom,
        pagesEditor.state.doc,
        adversarialPrintGeometry(),
      ),
      previewAdversarialPrint: () => renderPagesPreview(adversarialPrintGeometry(), true),
      measureImportedStyled: () => layoutDOMPages(
        pagesView.dom,
        pagesEditor.state.doc,
        importedStyledPrintGeometry(),
      ),
      previewImportedStyled: () => renderPagesPreview(importedStyledPrintGeometry(), true),
      previewPhysical: (size: 'a4' | 'letter') => renderPagesPreview(createPageGeometry({
        size,
        margins: 12.7,
        headerHeight: 48,
        unitsPerMillimetre: 96 / 25.4,
      }), true),
      previewWithHostRenderer: () => renderPagesPreview(
        createPageGeometry({ size: { width: 260, height: 120 }, margins: 10 }),
        true,
        {
          renderPlacement: ({ document, source }) => {
            if (source.tagName !== 'H2') return undefined;
            const figure = document.createElement('figure');
            figure.id = 'host-print-heading';
            figure.dataset.hostPrintProjection = 'heading';
            figure.innerHTML = '<figcaption>Host-rendered heading</figcaption><button type="button">Live-only action</button>';
            return figure;
          },
        },
      ),
      incrementalProbe: runPaginationIncrementalBudget,
      structuralProbe: runPaginationStructuralBudget,
      controllerProbe: () => {
        const cycles: number[] = [];
        const controller = createDOMPageLayoutController(
          pagesView.dom,
          () => pagesEditor.state.doc,
          createPageGeometry({ size: { width: 260, height: 120 }, margins: 10 }),
          { observe: false, onLayout: (cycle) => cycles.push(cycle.durationMs) },
        );
        const last = Array.from({ length: 12 }, () => controller.refreshNow('manual')).at(-1)!;
        controller.destroy();
        return {
          cycles,
          lastRevision: last.revision,
          lastReason: last.reason,
          destroyed: controller.isDestroyed,
        };
      },
      integrations: {
        createComment: createPageIntegrationComment,
        insertBeforeComment: () => {
          if (!pageIntegrationsFixture) return false;
          return leftEditor.dispatch(leftEditor.state.createTransaction().replaceText(
            pageIntegrationCommentPath(),
            0,
            0,
            'Before ',
          ));
        },
        summary: () => ({
          mounted: pageIntegrationsFixture,
          left: {
            mode: leftPageController?.current?.mode,
            pages: leftPageController?.current?.pages.length,
            document: leftEditor.getJSON(),
            suggestions: getTrackedChangesState(leftEditor)?.suggestions ?? [],
            comments: getCommentsState(leftEditor)?.threads ?? [],
          },
          right: {
            mode: rightPageController?.current?.mode,
            pages: rightPageController?.current?.pages.length,
            document: rightEditor.getJSON(),
            suggestions: getTrackedChangesState(rightEditor)?.suggestions ?? [],
            comments: getCommentsState(rightEditor)?.threads ?? [],
          },
          review: {
            mode: trackedPageController?.current?.mode,
            pages: trackedPageController?.current?.pages.length,
            document: trackedEditor.getJSON(),
            suggestions: getTrackedChangesState(trackedEditor)?.suggestions ?? [],
          },
        }),
      },
      editable: {
        undo: () => editablePagesFixture?.commands.commands.undo?.() ?? false,
        redo: () => editablePagesFixture?.commands.commands.redo?.() ?? false,
        refresh: () => editablePagesFixture?.controller.refreshNow('manual'),
        moveContainerAfterParagraph: () => {
          if (!editablePagesFixture || (!splitEditableTableFixture && !splitEditableListFixture)) return false;
          const paragraphType = editablePagesFixture.editor.state.schema.nodes.paragraph;
          if (!paragraphType) return false;
          const paragraph = paragraphType.create({}, [
            editablePagesFixture.editor.state.schema.text('Paragraph moved before the paginated container.'),
          ]);
          const inserted = editablePagesFixture.editor.dispatch(
            editablePagesFixture.editor.state.createTransaction().replace(
              editablePagesFixture.editor.state.doc.childCount,
              editablePagesFixture.editor.state.doc.childCount,
              [paragraph],
            ),
          );
          if (!inserted || !moveBlock(editablePagesFixture.editor, 0, 1)) return false;
          editablePagesFixture.controller.refreshNow('manual');
          return true;
        },
        previewCustomContinuation: () => {
          if (!editablePagesFixture || !editableAtomicPagesFixture) return { mounted: false };
          const { view, editor: pageEditor } = editablePagesFixture;
          const priorStyle = view.dom.style.cssText;
          const before = view.dom.innerHTML;
          view.dom.style.boxSizing = 'content-box';
          view.dom.style.width = '340px';
          try {
            const geometry = createPageGeometry({
              size: { width: 420, height: 300 },
              margins: 40,
              headerHeight: 20,
              footerHeight: 20,
            });
            const snapshot = layoutDOMPages(view.dom, pageEditor.state.doc, geometry, {
              blockContinuation: ({ node, element }) => node.type.name === 'browser_counter'
                ? {
                    fragments: [...element.querySelectorAll<HTMLElement>('[data-browser-counter-fragment]')],
                  }
                : undefined,
            });
            document.querySelector('#browser-custom-continuation-preview')?.remove();
            const target = document.createElement('div');
            target.id = 'browser-custom-continuation-preview';
            document.body.appendChild(target);
            const result = renderDOMPagePreview(view.dom, target, geometry, snapshot, {
              renderPlacement: ({ document: owner, placement, source }) => {
                if (source.dataset.fountainNode !== 'browser_counter') return undefined;
                const projection = owner.createElement('section');
                projection.dataset.browserCounterPrintProjection = '';
                placement.sources.forEach((sourceFragment) => {
                  const band = owner.createElement('div');
                  band.dataset.browserCounterPrintBand = String(sourceFragment.fragmentIndex + 1);
                  band.textContent = `Counter print band ${sourceFragment.fragmentIndex + 1}`;
                  projection.appendChild(band);
                });
                return projection;
              },
            });
            return {
              mounted: true,
              pages: result.pages.length,
              sources: snapshot.measurement.fragmentSources.filter((source) => source.kind === 'custom'),
              warnings: snapshot.layout.warnings,
              sourceUnchanged: view.dom.innerHTML === before,
            };
          } finally {
            view.dom.style.cssText = priorStyle;
          }
        },
        summary: () => {
          if (!editablePagesFixture) return { mounted: false };
          const selection = editablePagesFixture.editor.state.selection;
          return {
            mounted: true,
            mode: editablePagesFixture.controller.current?.mode,
            pages: editablePagesFixture.controller.current?.pages.length,
            issues: editablePagesFixture.controller.current?.issues,
            errors: editablePagesFixture.errors,
            selection: selection instanceof Selection ? {
              type: 'text', path: selection.path, from: selection.from,
              endPath: selection.endPath, to: selection.to,
            } : { type: selection.kind },
            document: editablePagesFixture.editor.getJSON(),
          };
        },
      },
    },
  },
});

if (new URLSearchParams(globalThis.location.search).get('fixture') === 'pages-preview') {
  document.body.dataset.fountainPagePrintFixture = 'true';
  const fixturePrintStyle = document.createElement('style');
  fixturePrintStyle.textContent = `
    @media print {
      body[data-fountain-page-print-fixture="true"] { margin: 0; }
      body[data-fountain-page-print-fixture="true"] > :not(#browser-page-preview) { display: none !important; }
      #browser-page-preview { margin: 0 !important; }
    }
  `;
  document.head.appendChild(fixturePrintStyle);
  const contract = (globalThis as typeof globalThis & {
    fountainBrowserTest: {
      pages: { loadMeasurementFixture: () => boolean; preview: (keepMounted?: boolean) => unknown };
    };
  }).fountainBrowserTest;
  contract.pages.loadMeasurementFixture();
  contract.pages.preview(true);
}
