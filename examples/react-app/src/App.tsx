import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  AIConversationController,
  AIController,
  AIGeneratedMediaController,
  ClipboardHistoryExtension,
  CoreExtension,
  HTMLExporter,
  JSONExporter,
  MarkdownExporter,
  MediaExtension,
  FloatingMenuExtension,
  SyntaxHighlightExtension,
  TableEditingExtension,
  TrailingEditableBlockExtension,
  composeExtensions,
  createBubbleMenuExtension,
  createStreamingAIConversationAdapter,
  createStreamingAIAdapter,
  createAIGeneratedMediaAdapter,
  createAIGeneratedMediaCommitter,
  defineAIPromptTemplate,
  defineExtension,
  historyPlugin,
  isMarkActive,
  insertNode as demoInsertNode,
  markdownShortcutsPlugin,
  setBlockType,
  toggleMark,
  type AssetUploadHandler,
  type ImageUploadHandler,
  type FountainMenuService,
  type ExternalPasteReport,
  InMemoryAIConversationStore,
  InMemoryAIPromptStore,
} from 'fountainjs-editor';
import { StableNodeIdsExtension } from 'fountainjs-editor/node-ids';
import { TableOfContentsExtension } from 'fountainjs-editor/table-of-contents';
import { InvisibleCharacterExtension } from 'fountainjs-editor/integrity/dom';
import {
  createAIDocumentToolbox,
  type AIDocumentProposal,
} from 'fountainjs-editor/ai/document-tools';
import {
  EmojiExtension,
  TypographyExtension,
  createCharacterCountExtension,
  createMentionExtension,
  createSlashCommandExtension,
  type CharacterCountService,
  type EmojiItem,
  type EmojiService,
  type MentionItem,
  type MentionService,
  type SlashCommandService,
} from 'fountainjs-editor/document-utilities';
import {
  FountainAIConversation,
  FountainAIGeneratedMedia,
  FountainAIReview,
  FountainBubbleMenu,
  FountainCharacterCount,
  FountainComposer,
  FountainFloatingMenu,
  FountainSlashCommandMenu,
  FountainSuggestionMenu,
  Navigator,
  useFountain,
  useFountainState,
  type FountainEditorHandle,
} from 'fountainjs-editor/react';
import {
  addTrackedNodeAttributeChange,
  addTrackedReplacement,
  createTrackedChangesExtension,
  dispatchTrackedTransaction,
  setTrackedChangesUser,
} from 'fountainjs-editor/tracked-changes';
import { FountainTrackedChanges } from 'fountainjs-editor/react/tracked-changes';
import { InMemoryVersionProvider, VersionController } from 'fountainjs-editor/versions';
import { FountainVersions } from 'fountainjs-editor/react/versions';
import { FountainIntegrityInspector } from 'fountainjs-editor/react/integrity';
import { downloadDocumentFile } from './math-document-files';
import { ChartTextControls, EditChartSource } from './ChartTextControls';
import { ChartCSVControls } from './ChartCSVControls';
import { chartInputPlugin, ChartExtension, exportChartImage, insertBarChart, selectedChart, setChartAxisTitle, setChartType, setChartTarget, setChartValueRange, tableChartAction, toggleTableChart, type ChartImageFormat, type ChartType } from 'fountainjs-editor/charts';
import { DetailsExtension, insertDetails } from 'fountainjs-editor/details';
import { RubyExtension, setRuby } from 'fountainjs-editor/ruby';
import { BpmnCanvasButton } from './BpmnCanvasButton';
import { BpmnPreviewExtension } from './bpmn-preview';
import editorialReview from './editorial-review.bpmn?raw';
import { MermaidPreviewExtension } from './mermaid-preview';
import { SitePageLink } from './SitePageLink';
import 'fountainjs-editor/styles.css';
import { LiveExportOutput } from './LiveExportOutput';

const initialContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Try FountainJS in this document.' }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'Select text, type across paragraphs, and use the toolbar. This is the ' },
      { type: 'text', text: 'FountainJS engine', marks: [{ type: 'strong' }] },
      { type: 'text', text: '. Your edits update the document and exported data.' },
    ] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What you can test here' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Insert lists, tables, images, media, callouts, and collapsible sections. Then switch between Markdown, HTML, and JSON output on the right.' }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'Ruby pronunciation is document data: ' },
      { type: 'ruby', attrs: { rt: 'とうきょう' }, content: [{ type: 'text', text: '東京', marks: [{ type: 'strong' }] }] },
      { type: 'text', text: '. Click or focus the reading above the word to edit it.' },
    ] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The editor stores your document as portable JSON on the backend you choose.' }] }] },
    { type: 'details', attrs: { open: false }, content: [
      { type: 'details_summary', content: [{ type: 'text', text: 'Open this collapsible section' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Its summary and body are editable document content, not a pasted widget.' }] },
    ] },
    { type: 'code_block', attrs: { language: 'typescript', lineNumbers: true }, content: [{ type: 'text', text: "const kit = composeExtensions([\n  CoreExtension, history, callout, myIntegration\n]);\nconst editor = createEditor({ schema: kit.schema, plugins: kit.plugins });" }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Integrity sample: ABC123\u200Bxyz contains one deliberately invisible zero-width space. Select the value and inspect it.' }] },
  ],
} as const;

const demoAdapter = createStreamingAIAdapter(async function* (request, { signal }) {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const leadingWhitespace = request.input.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = request.input.slice(leadingWhitespace.length).match(/\s*$/)?.[0] ?? '';
  const source = request.input.slice(leadingWhitespace.length, request.input.length - trailingWhitespace.length);
  const transformed = request.action === 'shorten'
    ? source.split(/\s+/).slice(0, Math.max(4, Math.ceil(source.split(/\s+/).length * 0.6))).join(' ').replace(/[,:;]$/, '') + '.'
    : request.action === 'expand'
      ? `${source.replace(/[.!?]$/, '')}—with clearer intent, stronger structure, and no loss of the author’s voice.`
      : request.action === 'fix-grammar'
        ? `${source.charAt(0).toUpperCase()}${source.slice(1).replace(/\s+/g, ' ').replace(/[.!?]?$/, '.')}`
        : source === 'Try FountainJS in this document.'
          ? 'Edit this document to test FountainJS directly in your browser.'
          : `Make it unmistakably clear: ${source.charAt(0).toLowerCase()}${source.slice(1)}`;
  // Text fragments often end at a mark boundary. Keep their boundary whitespace
  // so accepting a proposal cannot join the replacement to the adjacent mark.
  const replacement = `${leadingWhitespace}${transformed}${trailingWhitespace}`;
  const split = Math.max(1, Math.ceil(replacement.length / 2));
  yield { replacementDelta: replacement.slice(0, split) };
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const cancel = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = window.setTimeout(finish, 800);
    signal.addEventListener('abort', cancel, { once: true });
  });
  yield {
    replacementDelta: replacement.slice(split),
    explanationDelta: 'This local demo streams a deterministic proposal. A production app supplies its own model or MCP adapter.',
    model: 'local-demo (no network)',
  };
});

const demoConversationAdapter = createStreamingAIConversationAdapter(async function* (request, { signal }) {
  const userMessages = request.messages.filter((message) => message.role === 'user');
  const latest = userMessages.at(-1)?.content ?? '';
  const reply = userMessages.length === 1
    ? `I can keep this discussion across turns. You asked: “${latest}”`
    : `This is follow-up ${userMessages.length}. I received the earlier turns plus: “${latest}”`;
  const split = Math.max(1, Math.ceil(reply.length / 2));
  yield { contentDelta: reply.slice(0, split) };
  await new Promise<void>((resolve, reject) => {
    const finish = () => { signal.removeEventListener('abort', cancel); resolve(); };
    const cancel = () => { window.clearTimeout(timer); reject(signal.reason); };
    const timer = window.setTimeout(finish, 500);
    signal.addEventListener('abort', cancel, { once: true });
  });
  yield { contentDelta: reply.slice(split), model: 'local-demo (no network)' };
});

const demoGeneratedMediaAdapter = createAIGeneratedMediaAdapter(async (request, { signal, reportProgress }) => {
  if (request.kind !== 'image') throw new Error('This local proof generates images only. Applications can connect audio, video, or file generators through the same adapter.');
  reportProgress(.2);
  await new Promise<void>((resolve, reject) => {
    const finish = () => { signal.removeEventListener('abort', cancel); resolve(); };
    const cancel = () => { window.clearTimeout(timer); reject(signal.reason ?? new DOMException('Cancelled', 'AbortError')); };
    const timer = window.setTimeout(finish, 380);
    signal.addEventListener('abort', cancel, { once: true });
  });
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create the local image preview.');
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#171326');
  gradient.addColorStop(1, '#6d4aff');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#9cf6c9';
  context.font = '700 26px ui-monospace, monospace';
  context.fillText('FOUNTAINJS · LOCAL GENERATION PROOF', 64, 78);
  context.fillStyle = '#ffffff';
  context.font = '700 48px ui-sans-serif, sans-serif';
  const words = request.prompt.trim().split(/\s+/);
  const lines: string[] = [];
  while (words.length && lines.length < 4) {
    let line = words.shift() ?? '';
    while (words.length && `${line} ${words[0]}`.length <= 32) line += ` ${words.shift()}`;
    lines.push(line);
  }
  lines.forEach((line, index) => context.fillText(line, 64, 180 + index * 62));
  reportProgress(.8);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (
    value ? resolve(value) : reject(new Error('The local image preview could not be encoded.'))
  ), 'image/png'));
  return {
    provider: 'local canvas adapter',
    model: 'deterministic browser demo',
    assets: [{
      id: `generated-${request.id}`,
      kind: 'image',
      name: 'fountain-generated-preview.png',
      mimeType: 'image/png',
      bytes: new Uint8Array(await blob.arrayBuffer()),
      alt: request.prompt,
      title: 'Generated preview',
      caption: 'Reviewed first, then inserted through the normal host-owned image upload boundary.',
    }],
  };
});

const demoGeneratedImageUpload: ImageUploadHandler = async (file, { signal, reportProgress }) => {
  reportProgress(.25);
  if (signal.aborted) throw signal.reason;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  reportProgress(1);
  return { src: `data:${file.type};base64,${window.btoa(binary)}` };
};

const demoAssetUpload: AssetUploadHandler = async (file, { kind, signal, reportProgress }) => {
  reportProgress(.25);
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 260);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Upload cancelled', 'AbortError'));
    }, { once: true });
  });
  reportProgress(1);
  if (kind === 'audio') return {
    src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
    title: file.name.replace(/\.[^.]+$/, ''),
    caption: 'Uploaded through the local demo adapter.',
  };
  if (kind === 'video') return {
    src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    title: file.name.replace(/\.[^.]+$/, ''),
    caption: 'Uploaded through the local demo adapter.',
  };
  return {
    src: './demo-media.svg',
    name: file.name,
    description: 'Uploaded through the local demo adapter.',
  };
};

const calloutExtension = defineExtension({
  name: 'callout',
  nodes: {
    callout: {
      group: 'block',
      content: 'inline*',
      attrs: { tone: { default: 'idea' } },
      parseDOM: [{
        tag: 'aside[data-fountain-callout]',
        getAttrs: (element) => ({ tone: element.dataset.tone ?? 'idea' }),
      }],
      toDOM: (node) => ['aside', {
        className: 'demo-callout',
        'data-fountain-callout': '',
        'data-tone': node.attrs.tone,
      }, 0],
    },
  },
  commands: {
    insertCallout: (editor, text = 'A custom node supplied by the demo extension.') => {
      const node = editor.state.schema.node('callout', { tone: 'idea' }, [editor.state.schema.text(text)]);
      return demoInsertNode(editor, node);
    },
  },
});

const mentionExtension = createMentionExtension({
  suggestions: [
    {
      char: '@',
      kind: 'person',
      items: ({ query }) => [
        { id: 'ada', label: 'Ada Lovelace', kind: 'person' },
        { id: 'grace', label: 'Grace Hopper', kind: 'person' },
        { id: 'margaret', label: 'Margaret Hamilton', kind: 'person' },
      ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
    },
    {
      char: '#',
      kind: 'topic',
      items: ({ query }) => [
        { id: 'editor-platform', label: 'editor-platform', kind: 'topic' },
        { id: 'release', label: 'release', kind: 'topic' },
      ].filter((item) => item.label.includes(query.toLowerCase())),
    },
  ],
});

const characterCountExtension = createCharacterCountExtension({ limit: 5_000 });
const textBubbleMenuExtension = createBubbleMenuExtension({
  shouldShow: ({ selection, defaultOpen }) => defaultOpen
    && selection.kind === 'text'
    && !selection.isCollapsed,
});
const slashCommandExtension = createSlashCommandExtension({
  items: [{
    id: 'callout',
    label: 'Callout',
    description: 'Insert the custom block supplied by this demo extension.',
    aliases: ['notice', 'aside'],
    icon: '✦',
    group: 'Product',
    run: ({ editor }) => calloutExtension.commands?.insertCallout?.(editor) ?? false,
  }],
});

const demoKit = composeExtensions([
  CoreExtension,
  MermaidPreviewExtension,
  BpmnPreviewExtension,
  defineExtension({ name: 'chart-input', plugins: [chartInputPlugin] }),
  InvisibleCharacterExtension,
  StableNodeIdsExtension,
  TableOfContentsExtension,
  MediaExtension,
  mentionExtension,
  EmojiExtension,
  characterCountExtension,
  TypographyExtension,
  slashCommandExtension,
  textBubbleMenuExtension,
  FloatingMenuExtension,
  defineExtension({ name: 'history', plugins: [historyPlugin] }),
  defineExtension({ name: 'markdown-shortcuts', plugins: [markdownShortcutsPlugin] }),
  SyntaxHighlightExtension,
  TableEditingExtension,
  TrailingEditableBlockExtension,
  ClipboardHistoryExtension,
  ChartExtension,
  DetailsExtension,
  RubyExtension,
  calloutExtension,
  defineExtension({ name: 'ai-review', services: { adapter: demoAdapter } }),
]);

type ExportFormat = 'markdown' | 'html' | 'json';

const competitors = [
  {
    name: 'ProseMirror + Tiptap',
    maturity: 'Battle-tested ProseMirror engine plus Tiptap’s mature product and developer layer.',
    architecture: 'Low-level schema, transactions, plugins, and DOM view with extensions, framework bindings, UI, and optional services above them.',
    fit: 'Choose the combined stack for its production history, ecosystem depth, hosted services, and commercial support.',
    href: 'https://github.com/eddolo/fountainjs/blob/master/docs/PROSEMIRROR_COMPARISON.md',
  },
  {
    name: 'Plate',
    maturity: 'Powerful React/Slate framework with composable plugins and polished examples.',
    architecture: 'React-first components and composable Slate plugins.',
    fit: 'Choose it for a React-first stack and a broad ready-made feature set.',
    href: 'https://platejs.org/docs',
  },
  {
    name: 'BlockNote',
    maturity: 'Excellent out-of-the-box React block editor experience.',
    architecture: 'React-first block editor; advanced usage can mount the editor without React.',
    fit: 'Choose it when a Notion-like block UI is the priority.',
    href: 'https://www.blocknotejs.org/docs',
  },
  {
    name: 'FountainJS',
    maturity: 'Early-beta TypeScript editor library with working DOM, Web Component, and React interfaces.',
    architecture: 'Ready-made editing, review, collaboration, and versioning modules with one public extension API.',
    fit: 'Choose it when you want the capabilities in one public MIT package and control over framework, storage, and services.',
    href: 'https://github.com/eddolo/fountainjs',
  },
] as const;

function CollaborationPlaceholder({ failed = false }: { failed?: boolean }) {
  return (
    <section id="collaboration" className="collaboration-demo collaboration-demo__load" aria-busy={!failed}>
      {failed ? <>
        <p role="alert">The collaboration demo could not load.</p>
        <a href="?collaboration-recovery=1#collaboration" target="_blank" rel="noopener">Open the collaboration demo in a new tab</a>
        <p>Your current draft stays open in this tab.</p>
      </> : 'Loading the collaboration demo…'}
    </section>
  );
}

// A browser can reuse a failed module request across tabs. Give the recovery
// entry a different URL while bundling it from the same demo source.
const loadCollaborationRecovery = import.meta.glob<typeof import('./CollaborationDemo')>(
  './CollaborationDemo.tsx', { query: '?recovery' },
)['./CollaborationDemo.tsx']!;
const LazyCollaborationDemo = lazy(() => {
  const load = new URLSearchParams(window.location.search).has('collaboration-recovery')
    ? loadCollaborationRecovery : () => import('./CollaborationDemo');
  return load().catch(() => ({ default: () => <CollaborationPlaceholder failed /> }));
});

function CollaborationPreview() {
  return <Suspense fallback={<CollaborationPlaceholder />}><LazyCollaborationDemo /></Suspense>;
}

function TrackedChangesDemo() {
  const kit = useMemo(() => {
    let identifier = 0;
    const tracked = createTrackedChangesExtension({
      user: { id: 'ada', name: 'Ada Lovelace', color: '#6d4aff' },
      idFactory: () => `live-review-${++identifier}`,
    });
    return composeExtensions([CoreExtension, tracked]);
  }, []);
  const content = useMemo(() => ({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A review workflow people can trust' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Every product deserves editing tools that reveal intent clearly.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Try typing, replacing, formatting, or deleting anything in this document.' }] },
    ],
  } as const), []);
  const editor = useFountain({ schema: kit.schema, plugins: kit.plugins, content });
  const seeded = useRef(false);
  const [reviewReady, setReviewReady] = useState(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    addTrackedNodeAttributeChange(editor, [0], { level: 2, align: 'center' }, 'Center the review heading');
    addTrackedReplacement(editor, [1, 0], 6, 13, 'team', 'Make the audience more specific');
    setTrackedChangesUser(editor, { id: 'grace', name: 'Grace Hopper', color: '#d23877' });
    const note = editor.state.schema.node('blockquote', {}, [
      editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Portable suggestions travel with the document; the host still owns access control.')]),
    ]);
    dispatchTrackedTransaction(editor, (transaction) => transaction.replace(editor.state.doc.childCount, editor.state.doc.childCount, [note]), 'Add the architecture boundary');
    setTrackedChangesUser(editor, { id: 'you', name: 'You', color: '#187a50' });
    // Seed the model before a DOM caret can move the visitor to this section.
    setReviewReady(true);
  }, [editor]);

  return <section className="tracked-demo" id="review">
    <div className="tracked-demo__intro">
      <div><span>TRACKED CHANGES</span><h2>Edit freely.<br />Decide explicitly.</h2></div>
      <div><p>This is the real optional tracking module. Suggested text, formatting, attributes, atoms, tables, and structural edits keep their author and can be accepted or rejected individually, by range, by author, or in batches.</p><p><strong>Try it now:</strong> type or delete in the document, select a review card, filter the list, and make a decision. The complete text stays inspectable.</p></div>
    </div>
    <div className="tracked-demo__workspace">
      <article className="tracked-demo__editor">
        <header><span>Review document</span><code>portable FountainJSON</code></header>
        {reviewReady && <FountainComposer editor={editor} showToolbar={false} ariaLabel="Tracked changes demo editor" placeholder="Write a suggestion…" />}
      </article>
      <aside><FountainTrackedChanges editor={editor} title="Review suggestions" onError={(error) => console.error(error)} /></aside>
    </div>
    <div className="tracked-demo__boundary"><code>fountainjs-editor/tracked-changes</code><span>Framework-neutral state + decisions</span><code>fountainjs-editor/react/tracked-changes</code><span>Optional review panel</span><span>Yjs-compatible</span><span>No hosted service required</span></div>
  </section>;
}

function VersionHistoryDemo() {
  const kit = useMemo(() => composeExtensions([
    CoreExtension,
    defineExtension({ name: 'version-demo-history', plugins: [historyPlugin] }),
  ]), []);
  const content = useMemo(() => ({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Launch brief' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'The first complete draft explains the launch in plain language.' }] },
    ],
  } as const), []);
  const editor = useFountain({ schema: kit.schema, plugins: kit.plugins, content });
  const provider = useMemo(() => new InMemoryVersionProvider(), []);
  const controller = useMemo(() => {
    let identifier = 0;
    return new VersionController({
      editor,
      provider,
      documentId: 'live-version-demo',
      user: { id: 'you', name: 'You' },
      idFactory: (kind) => `live-${kind}-${++identifier}`,
      autoLoad: false,
    });
  }, [editor, provider]);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    void (async () => {
      await controller.save({ name: 'First complete draft — nothing hidden after an ellipsis' });
      editor.dispatch(editor.state.createTransaction()
        .replaceText([1, 0], 0, editor.state.doc.child(1).textContent.length, 'The reviewed draft explains the launch, audience, and release decision in plain language.')
        .replace(editor.state.doc.childCount, editor.state.doc.childCount, [
          editor.state.schema.node('paragraph', {}, [editor.state.schema.text('The final checklist is included for everyone.')]),
        ]));
      await controller.save({ name: 'Team review with the complete descriptive name visible' });
      editor.dispatch(editor.state.createTransaction().replaceText(
        [1, 0],
        4,
        12,
        'current working',
      ));
    })().catch((error) => console.error(error));
  }, [controller, editor]);

  return <section className="versions-demo" id="versions">
    <div className="versions-demo__intro">
      <div><span>VERSION HISTORY</span><h2>Save a draft.<br />Keep working.<br />Restore safely.</h2></div>
      <div>
        <p>Name important document states, compare any two versions, preview the exact saved JSON, and restore an older draft.</p>
        <p><strong>Try it:</strong> edit the document, compare a saved version with the current text, preview it, or press Restore twice to confirm. FountainJS saves the current work as a backup before replacing it.</p>
      </div>
    </div>
    <div className="versions-demo__workspace">
      <article className="versions-demo__editor">
        <header><span>Current document</span><code>edit this text</code></header>
        <FountainComposer editor={editor} showToolbar={false} ariaLabel="Version history demo editor" placeholder="Write here…" />
      </article>
      <aside><FountainVersions controller={controller} title="Saved versions" onError={(error) => console.error(error)} /></aside>
    </div>
    <div className="versions-demo__boundary"><code>fountainjs-editor/versions</code><span>Public MIT module</span><span>Your storage provider</span><span>Exact comparison</span><span>Backup-first restore</span></div>
  </section>;
}

function App() {
  useEffect(() => {
    // React creates the section IDs after the browser's first fragment lookup.
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type !== 'navigate' || location.hash.length < 2) return;
    const fragment = location.hash;
    const target = window.document.getElementById(fragment.slice(1));
    if (!target) return;
    const pending = window.document.querySelector('#collaboration[aria-busy="true"]');
    if (!pending || (target !== pending && !(pending.compareDocumentPosition(target) & window.Node.DOCUMENT_POSITION_FOLLOWING))) {
      target.scrollIntoView();
      return;
    }
    // The collaboration placeholder is replaced by a much taller section.
    // Resolve the destination once the real section (or its error view) mounts.
    const observer = new MutationObserver(() => {
      if (pending.isConnected && pending.getAttribute('aria-busy') === 'true') return;
      observer.disconnect();
      if (location.hash === fragment) window.document.getElementById(fragment.slice(1))?.scrollIntoView();
    });
    observer.observe(pending.parentElement!, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
    return () => observer.disconnect();
  }, []);
  const editor = useFountain({
    schema: demoKit.schema,
    content: initialContent,
    plugins: demoKit.plugins,
  });
  const state = useFountainState(editor);
  const [processInsertRefused, setProcessInsertRefused] = useState(false);
  const [pasteNotice, setPasteNotice] = useState('');
  const pasteOptions = useMemo(() => ({
    onReport: (report: ExternalPasteReport) => setPasteNotice(report.outcome === 'rejected'
      ? 'Paste was not inserted. This playground allows 5,000 characters. Try less text or another insertion point.' : ''),
  }), []);
  const editorHandle = useRef<FountainEditorHandle>(null);
  const aiController = useMemo(() => new AIController(editor, demoAdapter), [editor]);
  const conversationStore = useMemo(() => new InMemoryAIConversationStore(), []);
  const promptStore = useMemo(() => new InMemoryAIPromptStore([
    defineAIPromptTemplate({
      id: 'explain-selection',
      title: 'Explain the current idea',
      template: 'Explain the current idea in plain language, including one concrete example.',
      description: 'A reusable host-stored prompt.',
      updatedAt: '2026-09-06T12:00:00.000Z',
    }),
    defineAIPromptTemplate({
      id: 'challenge-assumption',
      title: 'Challenge an assumption',
      template: 'Challenge the strongest assumption in this discussion and suggest a safer alternative.',
      updatedAt: '2026-09-06T12:00:00.000Z',
    }),
  ]), []);
  const conversationController = useMemo(() => new AIConversationController({
    threadId: 'public-demo-conversation',
    store: conversationStore,
    adapter: demoConversationAdapter,
    title: 'Public demo conversation',
  }), [conversationStore]);
  const generatedMediaController = useMemo(() => new AIGeneratedMediaController({ adapter: demoGeneratedMediaAdapter }), []);
  const generatedMediaCommitter = useMemo(() => createAIGeneratedMediaCommitter(editor, {
    imageUpload: demoGeneratedImageUpload,
  }), [editor]);
  const agentTools = useMemo(() => createAIDocumentToolbox(editor), [editor]);
  const mentionController = useMemo(
    () => (demoKit.services.mentions as MentionService).getController(editor),
    [editor],
  );
  const emojiController = useMemo(
    () => (demoKit.services.emoji as EmojiService).getController(editor),
    [editor],
  );
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [compactToolbar, setCompactToolbar] = useState(false);
  const [agentProposal, setAgentProposal] = useState<AIDocumentProposal>();
  const [agentToolMessage, setAgentToolMessage] = useState('No document-tool call has run.');
  const conversationOwner = useRef(0);

  useEffect(() => {
    conversationOwner.current += 1;
    const owner = conversationOwner.current;
    return () => queueMicrotask(() => {
      if (conversationOwner.current === owner) conversationController.destroy();
    });
  }, [conversationController]);

  const document = state?.doc;
  const chartAction = tableChartAction(editor);
  const chart = selectedChart(editor);
  const [chartFormat, setChartFormat] = useState<ChartImageFormat>('png');
  const [chartExportError, setChartExportError] = useState('');
  const downloadChart = async (owner: Document) => {
    const chart = selectedChart(editor);
    if (!chart) return;
    setChartExportError('');
    try {
      const blob = await exportChartImage(chart, chartFormat, owner);
      downloadDocumentFile(owner, 'chart.' + chartFormat, blob, blob.type);
    } catch (error) {
      setChartExportError(error instanceof Error ? error.message : 'Chart download failed.');
    }
  };
  const output = useMemo(() => {
    if (!document) return '';
    if (format === 'html') return HTMLExporter.export(document, { document: false });
    if (format === 'json') return JSONExporter.export(document);
    return MarkdownExporter.export(document);
  }, [format, document]);

  const characterCount = demoKit.services.characterCount as CharacterCountService;
  const words = characterCount.words(editor);
  const blocks = state?.doc.childCount ?? 0;

  const addBlock = (kind: 'quote' | 'task' | 'table' | 'details' | 'callout' | 'chart' | 'mermaid' | 'bpmn') => {
    if (kind === 'callout') demoKit.commands.insertCallout?.(editor);
    else if (kind === 'bpmn') setProcessInsertRefused(!BpmnPreviewExtension.commands.insertBpmn(editor, editorialReview));
    else if (kind === 'mermaid') {
      MermaidPreviewExtension.commands.insertMermaid(editor, 'flowchart TD\n  draft[Draft] --> review[Review]\n  review --> publish[Publish]');
    } else if (kind === 'chart') insertBarChart(editor, 'Change in weekly orders', [['Monday', 12], ['Tuesday', -4], ['Wednesday', 8]]);
    else if (kind === 'details') insertDetails(editor, { summary: 'Click to edit this summary', open: true });
    else if (kind === 'quote') demoKit.commands.insertQuote?.(editor, 'A thought worth keeping…');
    else if (kind === 'task') demoKit.commands.insertList?.(editor, 'task', ['Review the document', 'Publish when ready']);
    else demoKit.commands.insertTable?.(editor, { rows: 3, columns: 2, headerRow: true });
  };

  const planStructuredSection = () => {
    try {
      const proposal = agentTools.preview([{
        kind: 'insert',
        parentPath: [],
        index: editor.state.doc.childCount,
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agent-proposed next step' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'This structured section stays outside the document until you accept it.' }] },
        ],
      }], { label: 'Add a next-step section' });
      setAgentProposal(proposal);
      setAgentToolMessage('Preview ready. The live document is still unchanged.');
    } catch (error) {
      setAgentToolMessage(error instanceof Error ? error.message : 'The proposal could not be created.');
    }
  };

  const decideAgentProposal = (decision: 'accept' | 'reject') => {
    if (!agentProposal) return;
    try {
      if (decision === 'accept') {
        agentTools.accept(agentProposal);
        setAgentToolMessage('Accepted as one undoable editor transaction.');
      } else {
        agentTools.reject(agentProposal);
        setAgentToolMessage('Rejected without changing the document.');
      }
      setAgentProposal(agentTools.getProposal(agentProposal.id));
    } catch (error) {
      setAgentProposal(agentTools.getProposal(agentProposal.id));
      setAgentToolMessage(error instanceof Error ? error.message : 'The proposal could not be applied.');
    }
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="F FountainJS home"><span>F</span> FountainJS</a>
        <nav aria-label="Primary navigation"><SitePageLink href="#top" current>Home</SitePageLink><a className="site-section-link" href="#what">What it is</a><a className="site-section-link" href="#open-source">Open source</a><a className="site-section-link" href="#playground">Live demo</a><a className="site-section-link" href="#collaboration">Collaboration</a><a className="site-section-link" href="#review">Review</a><a className="site-section-link" href="#versions">Versions</a><SitePageLink href="./demos.html">Demos</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav>
        <a className="install-pill" href="https://www.npmjs.com/package/fountainjs-editor">npm i fountainjs-editor</a>
      </header>

      <section className="hero" id="top">
        <div className="hero__eyebrow"><i /> Open source · MIT · early beta</div>
        <h1>
          <span>Build a rich-text editor.</span>
          <span>Use any framework.</span>
          <em>Extend every layer.</em>
        </h1>
        <p>FountainJS is a TypeScript library for adding a full-featured editor to a website or web app. It already includes rich text, images, tables, comments, tracked changes, collaboration, and version history. Use it with React, Vue, Svelte, Angular, plain JavaScript, or a Web Component; store the document JSON on any backend.</p>
        <div className="hero__actions"><a className="primary" href="#playground">Edit the live demo ↓</a><a className="secondary" href="https://www.npmjs.com/package/fountainjs-editor">Install from npm</a></div>
        <div className="promise-strip"><span>One npm package</span><span>React, Vue, Svelte, Angular</span><span>Portable JSON</span><span>No required cloud</span><span>MIT licensed</span></div>
      </section>

      <section className="definition" id="what">
        <div className="definition__lead">
          <span>PLAIN ENGLISH</span>
          <h2>It is code you add to your app—not another writing app.</h2>
        </div>
        <div className="definition__answer">
          <p className="big-answer">Your users get a familiar document editor. Your developers get the library, source code, and extension points needed to fit it into a real product.</p>
          <p>FountainJS runs in the browser. Choose the plain DOM API, Web Component, or first-party React, Vue, Svelte and Angular bindings. Other frameworks can use the DOM or Web Component interfaces. Documents are portable JSON, so a backend written in Python, Go, Ruby, PHP, Java, or another language can store and process them.</p>
          <div className="definition__parts">
            <article><b>01</b><h3>Working features included</h3><p>Start with normal writing, media, tables, export, collaboration, comments, change review, and versions instead of rebuilding basics.</p></article>
            <article><b>02</b><h3>Use your current stack</h3><p>Use the React, Vue, Svelte or Angular bindings, the plain DOM view, or the framework-independent Web Component.</p></article>
            <article><b>03</b><h3>Change what your product needs</h3><p>Add a block, command, format, toolbar, storage provider, or service without maintaining a fork of the editor.</p></article>
          </div>
        </div>
      </section>

      <section className="open-source" id="open-source">
        <div className="open-source__lead"><span>WHAT OPEN SOURCE MEANS HERE</span><h2>The editor belongs in your product—not behind ours.</h2><p>“Open source” describes what you can inspect, own, change, and run. It does not pretend that databases, servers, storage, or third-party models cost nothing.</p></div>
        <div className="open-source__grid">
          <article><b>01</b><h3>Public source and MIT terms</h3><p>The engine, optional modules, types, tests, and documentation are public. The MIT license allows commercial use, modification, forks, redistribution, and private product code.</p></article>
          <article><b>02</b><h3>No Fountain feature paywall</h3><p>The engine and optional editor modules use the same MIT license. There is no private extension registry, paid editor tier, or license key that unlocks document features.</p></article>
          <article><b>03</b><h3>No required Fountain cloud</h3><p>Use the editor locally and connect your own database, files, authentication, collaboration transport, conversion service, or AI provider through replaceable interfaces.</p></article>
          <article><b>04</b><h3>You choose infrastructure costs</h3><p>Your hosting or chosen third-party services may charge you. Those are application decisions, not hidden requirements imposed by FountainJS; local and self-hosted implementations remain valid.</p></article>
        </div>
        <p className="open-source__boundary"><strong>Practical test:</strong> you can install the package, inspect every counted capability, run it without a Fountain account, replace external providers, and continue from a fork if this project disappears.</p>
      </section>

      <section className="capabilities">
        <div className="capabilities__heading"><span>IN THIS PREVIEW</span><h2>The features people expect from a serious editor.</h2><p>These capabilities are demonstrated in this source build. The build label identifies its package and the verified npm release. Import only the modules you need.</p></div>
        <div className="capabilities__grid">
          <article><b>01</b><h3>Rich writing</h3><p>Multi-paragraph and cross-block selection, headings, alignment, links, foreground/background colour, font family, font size, line height, marks, mentions, emoji, smart typography, live counts, slash commands, find/replace, undo/redo, paste, and IME input.</p></article>
          <article><b>02</b><h3>Structured blocks</h3><p>Bullet and numbered lists, task lists, code blocks, dividers, collapsible details, nested document structures, tables, and custom block types.</p></article>
          <article><b>03</b><h3>Production images</h3><p>Use block or inline images, editable captions, alt text, alignment, responsive sources, replacement, and accessible resizing. Upload tasks map through edits and expose progress, cancel, retry, and errors while storage remains yours.</p></article>
          <article><b>04</b><h3>Portable formats</h3><p>Lossless JSON plus Markdown, safe HTML, and plain-text boundaries for storage, APIs, publishing pipelines, search, and any backend language.</p></article>
          <article><b>05</b><h3>Any interface</h3><p>Use plain DOM, the standards-based Web Component, React bindings, or create another framework adapter over the same editor and immutable state.</p></article>
          <article><b>06</b><h3>Open extension contract</h3><p>Add nodes, marks, commands, plugins, formats, UI, collaboration providers, analytics, AI, or application services without forking the core.</p></article>
          <article><b>07</b><h3>Collaboration and review</h3><p>Optional Yjs synchronization, relative presence, author-local undo, threaded comments, and tracked changes with portable metadata and explicit decisions.</p></article>
          <article><b>08</b><h3>Named version history</h3><p>Save manual or automatic versions, preview exact content, compare text, structure, formatting, and attributes, then restore with a backup of current work.</p></article>
        </div>
      </section>

      <section className="flow" id="modularity">
        <div className="flow__title"><span>HOW MODULARITY WORKS</span><h2>Start with a working editor. <span className="keep-together">Change only</span> what you need.</h2></div>
        <ol>
          <li><b>1</b><strong>Install it</strong><span>Start with the supplied editor and a document that already supports common rich content.</span></li>
          <li><b>2</b><strong>Choose features</strong><span>Import collaboration, comments, tracked changes, versions, AI, or other optional modules only when you use them.</span></li>
          <li><b>3</b><strong>Customize behavior</strong><span>Add your own content blocks, commands, keyboard rules, formats, or product services through the same extension API.</span></li>
          <li><b>4</b><strong>Connect your interface</strong><span>Use React components, the Web Component, plain DOM controls, or build a small adapter for another framework.</span></li>
          <li><b>5</b><strong>Store it anywhere</strong><span>Keep portable JSON in your database and connect your own media, authentication, collaboration, or AI providers.</span></li>
        </ol>
      </section>

      <section className="playground" id="playground">
        <div className="section-heading"><div><span>LIVE PLAYGROUND</span><h2>Try the actual package in your browser.</h2></div><p>{words} words · {blocks} blocks · local demo adapter</p></div>
        <div className="demo-note"><b>Try it:</b> select text and open <strong>Text styles</strong> to change its family, size, line height, foreground, and background. Select the ABC123xyz integrity sample to expose its hidden character. Insert a collapsible section, or click the reading above <strong>東京</strong> to edit its ruby annotation. Hover or tap a block for move controls. Start an empty line with <kbd>/</kbd> for commands; type <kbd>@a</kbd>, <kbd>#re</kbd>, or <kbd>:rock</kbd> for suggestions. Typography converts <kbd>--</kbd>, <kbd>...</kbd>, arrows, fractions, and quotes as you type.</div>
        <div className="studio">
          <aside className="studio__outline"><Navigator editor={editor} /><div className="outline-tip">Markdown shortcuts<br /><kbd>##</kbd> heading · <kbd>-</kbd> list · <kbd>&gt;</kbd> quote</div></aside>
          <div className="studio__canvas">
            <div className="quick-insert" aria-label="Insert rich content">
              <span>Insert</span>
              <button onClick={() => addBlock('quote')}>❝ Quote</button>
              <button onClick={() => addBlock('task')}>☑ Tasks</button>
              <button onClick={() => addBlock('table')}>▦ Table</button>
              <button onClick={() => addBlock('chart')}>Bar chart</button>
              <button onMouseDown={event => event.preventDefault()} onClick={() => addBlock('mermaid')}>Mermaid diagram</button>
              <button onMouseDown={event => event.preventDefault()} onClick={() => addBlock('bpmn')}>BPMN process</button>
              <BpmnCanvasButton editor={editor} />
              {chartAction && <button onMouseDown={event => event.preventDefault()} onClick={() => {
                if (toggleTableChart(editor)) editorHandle.current?.focus();
              }}>{chartAction === 'wrap' ? 'Chart this table' : 'Keep as table'}</button>}
              <button onClick={() => addBlock('details')}>▸ Details</button>
              <button onClick={() => setRuby(editor, 'reading')}>あ Ruby</button>
              <button onClick={() => addBlock('callout')}>✦ Callout</button>
              <button
                className="toolbar-profile"
                aria-pressed={compactToolbar}
                onClick={() => setCompactToolbar((current) => !current)}
              >{compactToolbar ? 'Show full toolbar' : 'Use compact toolbar'}</button>
            </div>
            {processInsertRefused && <div role="alert" className="studio__paste-notice">
              <p>The process didn’t fit at this selection. This playground allows 5,000 characters. You can also open a process file in the <a href="conversion-lab.html">Conversion Lab</a>.</p>
              <button type="button" onClick={() => setProcessInsertRefused(false)}>Dismiss process notice</button>
            </div>}
            <ChartTextControls editor={editor} focusEditor={() => editorHandle.current?.focus()} />
            <ChartCSVControls editor={editor} />
            <EditChartSource editor={editor} chart={chart} focusEditor={() => editorHandle.current?.focus()} />
            {chartAction === 'unwrap' && <div className="quick-insert" role="group" aria-label="Chart export">
              <label>Chart type <select value={String(chart?.attrs.kind ?? 'bar')} onChange={event => {
                setChartType(editor, event.target.value as ChartType);
                setChartExportError('');
                editorHandle.current?.focus();
              }}><option value="bar">Bar</option><option value="column">Column</option><option value="line">Line</option><option value="pie">Pie</option></select></label>
              {chart && chart.attrs.kind !== 'pie' && <details className="chart-axis-titles">
                <summary>Chart axes</summary>
                {(['category', 'value'] as const).map(axis => <label key={axis}>{axis === 'category' ? 'Category axis' : 'Value axis'}
                  <textarea rows={1} value={String(chart.attrs[axis + 'AxisTitle'] ?? '')}
                    onChange={event => setChartAxisTitle(editor, axis, event.target.value)} />
                </label>)}
                <form key={[editor.state.selection.path[0], chart.attrs.axisMin, chart.attrs.axisMax, chart.attrs.axisInterval].join(':')}
                  onInvalid={event => {
                    event.preventDefault();
                    const input = event.target as HTMLInputElement;
                    const feedback = event.currentTarget.elements.namedItem('rangeFeedback') as HTMLOutputElement;
                    feedback.value = input.validationMessage;
                    input.focus();
                  }}
                  onSubmit={event => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const minimum = form.elements.namedItem('minimum') as HTMLInputElement;
                    const maximum = form.elements.namedItem('maximum') as HTMLInputElement;
                    const interval = form.elements.namedItem('interval') as HTMLInputElement;
                    if (interval.value && interval.valueAsNumber <= 0) {
                      interval.setCustomValidity('Tick interval must be positive.');
                      interval.reportValidity();
                      return;
                    }
                    if (minimum.value && maximum.value && minimum.valueAsNumber >= maximum.valueAsNumber) {
                      maximum.setCustomValidity('Maximum must be greater than minimum.');
                      maximum.reportValidity();
                      return;
                    }
                    setChartValueRange(editor, minimum.value ? minimum.valueAsNumber : null, maximum.value ? maximum.valueAsNumber : null,
                      interval.value ? interval.valueAsNumber : null);
                  }} onInput={event => {
                    for (const name of ['maximum', 'interval']) (event.currentTarget.elements.namedItem(name) as HTMLInputElement).setCustomValidity('');
                    (event.currentTarget.elements.namedItem('rangeFeedback') as HTMLOutputElement).value = '';
                  }}>
                  <label>Minimum <input type="number" step="any" name="minimum" placeholder="Automatic" defaultValue={String(chart.attrs.axisMin ?? '')} /></label>
                  <label>Maximum <input type="number" step="any" name="maximum" placeholder="Automatic" defaultValue={String(chart.attrs.axisMax ?? '')} /></label>
                  <label>Tick interval <input type="number" step="any" name="interval" placeholder="Automatic" defaultValue={String(chart.attrs.axisInterval ?? '')} /></label>
                  <button type="submit">Apply range</button>
                  <output name="rangeFeedback" aria-label="Chart range validation" aria-live="polite" />
                  {(chart.attrs.axisMin != null || chart.attrs.axisMax != null || chart.attrs.axisInterval != null) &&
                    <button type="button" onClick={() => setChartValueRange(editor, null, null, null)}>Use automatic scale</button>}
                </form>
              </details>}
              {chart && chart.attrs.kind !== 'pie' && <details className="chart-axis-titles">
                <summary>Target line</summary>
                <form key={JSON.stringify([editor.state.selection.path[0], chart.attrs.targetValue, chart.attrs.targetLabel])}
                  onSubmit={event => {
                    event.preventDefault();
                    const fields = event.currentTarget.elements;
                    const value = (fields.namedItem('targetValue') as HTMLInputElement).valueAsNumber;
                    const label = (fields.namedItem('targetLabel') as HTMLInputElement).value;
                    setChartTarget(editor, value, label);
                  }}>
                  <label>Target value <input name="targetValue" type="number" step="any" required defaultValue={String(chart.attrs.targetValue ?? '')} /></label>
                  <label>Target label <input name="targetLabel" placeholder="Target" defaultValue={String(chart.attrs.targetLabel ?? '')} /></label>
                  <button type="submit">Apply target</button>
                  {chart.attrs.targetValue != null && <button type="button" onClick={() => setChartTarget(editor, null)}>Remove target</button>}
                </form>
              </details>}
              <select aria-label="Chart image format" value={chartFormat} onChange={event => {
                setChartFormat(event.target.value as ChartImageFormat);
                setChartExportError('');
              }}>
                {(['png', 'svg', 'jpeg', 'webp'] as const).map(format => <option key={format} value={format}>{format.toUpperCase()}</option>)}
              </select>
              <button onMouseDown={event => event.preventDefault()} onClick={event => void downloadChart(event.currentTarget.ownerDocument)}>Download chart</button>
              {chartExportError && <output>{chartExportError}</output>}
            </div>}
            <FountainComposer
              ref={editorHandle}
              editor={editor}
              placeholder="Start writing…"
              blockHandles
              paste={pasteOptions}
              assetUpload={demoAssetUpload}
              toolbarProps={compactToolbar ? {
                toolbarLabel: 'Compact writing toolbar',
                groups: ['marks', 'block-types', 'history'],
                actionOrder: { marks: ['highlight', 'bold', 'italic', 'underline'] },
                hiddenActions: ['strike', 'inline-code', 'subscript', 'superscript', 'link', 'unlink', 'text-color', 'clear-text-color'],
                groupLabels: { marks: 'Essential formatting' },
                actionLabels: { bold: 'Strong emphasis' },
              } : undefined}
            />
            <FountainBubbleMenu
              editor={editor}
              service={demoKit.services.bubbleMenu as FountainMenuService}
              anchorElement={editorHandle.current?.view?.dom}
            >
              <button type="button" aria-label="Bold selection" aria-pressed={isMarkActive(editor, 'strong')} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark(editor, 'strong')}><b>B</b></button>
              <button type="button" aria-label="Italic selection" aria-pressed={isMarkActive(editor, 'em')} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark(editor, 'em')}><i>I</i></button>
              <button type="button" aria-label="Underline selection" aria-pressed={isMarkActive(editor, 'underline')} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark(editor, 'underline')}><u>U</u></button>
              <button type="button" aria-label="Highlight selection" aria-pressed={isMarkActive(editor, 'highlight')} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark(editor, 'highlight')}>Highlight</button>
            </FountainBubbleMenu>
            <FountainFloatingMenu
              editor={editor}
              service={demoKit.services.floatingMenu as FountainMenuService}
              anchorElement={editorHandle.current?.view?.dom}
            >
              <button type="button" aria-label="Use paragraph" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlockType(editor, 'paragraph')}>Text</button>
              <button type="button" aria-label="Use heading 1" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlockType(editor, 'heading', { level: 1 })}>H1</button>
              <button type="button" aria-label="Use heading 2" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlockType(editor, 'heading', { level: 2 })}>H2</button>
            </FountainFloatingMenu>
            <FountainSlashCommandMenu
              editor={editor}
              service={demoKit.services.slashCommands as SlashCommandService}
              anchorElement={editorHandle.current?.view?.dom}
            />
            <FountainSuggestionMenu<MentionItem>
              controller={mentionController}
              label="Mention a person or topic"
              anchorElement={editorHandle.current?.view?.dom}
              renderItem={(item) => <><b>{item.label}</b><small>{item.kind}</small></>}
            />
            <FountainSuggestionMenu<EmojiItem>
              controller={emojiController}
              label="Choose an emoji"
              anchorElement={editorHandle.current?.view?.dom}
              renderItem={(item) => <><b className="suggestion-emoji">{item.emoji}</b><span>{item.label}</span></>}
            />
            <FountainCharacterCount editor={editor} service={characterCount} />
            <p className="studio__limit-note">This playground limits documents to 5,000 characters.</p>
            {pasteNotice && <div role="alert" className="studio__paste-notice">
              <p>{pasteNotice}</p>
              <button type="button" onClick={() => setPasteNotice('')}>Dismiss paste notice</button>
            </div>}
          </div>
          <aside className="studio__tools">
            <div className="module-stack"><span>COMPOSED FOR THIS DEMO</span><div>{demoKit.extensions.map((extension) => <code key={extension.name}>{extension.name}</code>)}</div></div>
            <FountainIntegrityInspector editor={editor} />
            <LiveExportOutput output={output}>
              <div className="format-tabs">{(['markdown', 'html', 'json'] as ExportFormat[]).map((item) => <button type="button" key={item} className={format === item ? 'active' : ''} aria-pressed={format === item} onClick={() => setFormat(item)}>{item}</button>)}</div>
            </LiveExportOutput>
            <details className="optional-ai">
              <summary>Optional AI review examples</summary>
              <FountainAIReview controller={aiController} title="Text proposal stream" />
              <FountainAIConversation
                controller={conversationController}
                promptStore={promptStore}
                title="Multi-turn conversation"
                placeholder="Ask a first question, then a follow-up…"
              />
              <FountainAIGeneratedMedia
                controller={generatedMediaController}
                onAccept={generatedMediaCommitter}
                kinds={['image']}
                title="Generated asset review"
                initialPrompt="A clear launch diagram for a modular editor"
                onError={(error) => console.error(error)}
              />
              <section className="agent-tools-demo" aria-label="Schema-aware agent document tools">
                <span>STRUCTURED DOCUMENT TOOLS</span>
                <h3>Agents propose. You decide.</h3>
                <p>The demo reads the live schema and prepares two real Fountain nodes. The tool call itself cannot modify the editor.</p>
                <button type="button" disabled={agentProposal?.status === 'pending'} onClick={planStructuredSection}>Plan structured section</button>
                {agentProposal && <div className="agent-tools-demo__proposal">
                  <code>{agentProposal.operations.length} operation · {agentProposal.affectedPaths.length} affected path</code>
                  <strong>{agentProposal.label}</strong>
                  <span>Heading: Agent-proposed next step</span>
                  <span>Paragraph: This structured section stays outside the document until you accept it.</span>
                  {agentProposal.status === 'pending' && <div>
                    <button type="button" className="is-accept" onClick={() => decideAgentProposal('accept')}>Accept structured change</button>
                    <button type="button" onClick={() => decideAgentProposal('reject')}>Reject structured change</button>
                  </div>}
                  <em>Status: {agentProposal.status}</em>
                </div>}
                <p role="status">{agentToolMessage}</p>
              </section>
            </details>
          </aside>
        </div>
      </section>

      <CollaborationPreview />

      <TrackedChangesDemo />

      <VersionHistoryDemo />

      <section className="comparison" id="compare">
        <div className="comparison__intro"><span>HONEST COMPARISON</span><h2>FountainJS versus the complete ProseMirror + Tiptap stack.</h2><p>ProseMirror supplies Tiptap’s engine; Tiptap supplies the higher-level developer and product layer. FountainJS independently builds both responsibilities into one open-source project: its own engine plus native editing, review, collaboration, format, and UI modules. The older stack still has much greater production history and ecosystem scale.</p></div>
        <div className="comparison__table" role="table" aria-label="Rich text editor comparison">
          {competitors.map((item) => <a key={item.name} href={item.href} className="comparison__row" role="row">
            <strong role="cell">{item.name}</strong><span role="cell">{item.maturity}</span><span role="cell">{item.architecture}</span><span role="cell">{item.fit}</span><i aria-hidden="true">↗</i>
          </a>)}
        </div>
        <div className="truth-cards">
          <article className="is-good"><span>FountainJS is a fit when…</span><p>You need a capable editor across multiple frontend surfaces, want extensions to stay host-controlled, and prefer portable JSON, open interfaces, and MIT licensing.</p></article>
          <article><span>Choose a mature alternative when…</span><p>You need a much larger extension market, years of physical-device deployment evidence, or commercial support today.</p></article>
        </div>
        <p className="comparison__detail"><a href="https://github.com/eddolo/fountainjs/blob/master/docs/PROSEMIRROR_COMPARISON.md">Read the one-to-one full-stack comparison →</a></p>
      </section>

      <section className="architecture">
        <div><span>THE EXTENSION CONTRACT</span><h2>Add anything. Replace any layer you own.</h2></div>
        <div className="architecture__code"><pre><code>{`const callout = defineExtension({
  name: 'callout',
  nodes: { callout: calloutSpec },
  commands: { toggleCallout },
  formats: { myFormat },
  services: { analytics }
})

const kit = composeExtensions([
  CoreExtension,
  history,
  callout
])`}</code></pre></div>
        <ul><li><b>DOM first</b><span>The core editor and view do not import React or another UI framework.</span></li><li><b>Web standard</b><span>Register &lt;fountain-editor&gt; once and consume it from any Custom-Element-capable framework.</span></li><li><b>Open modules</b><span>Nodes, marks, plugins, commands, formats, and services share one composition contract.</span></li><li><b>Optional AI</b><span>The review controller and MCP adapter are example modules—not dependencies or the product identity.</span></li></ul>
      </section>

      <section className="closing"><p>npm install fountainjs-editor</p><h2 aria-label="Build the editor your product needs. Nothing more. Nothing locked in."><span className="closing__sentence"><span className="closing__phrase">Build the editor</span>{' '}<span className="closing__phrase">your product needs.</span></span><span className="closing__sentence"><span className="closing__phrase">Nothing more.</span>{' '}<span className="closing__phrase">Nothing locked in.</span></span></h2><div className="closing__actions"><a href="./demos.html">Explore the demos →</a><a href="./developers.html">Read the developer guide →</a><a href="https://github.com/eddolo/fountainjs">GitHub ↗</a></div></section>
      <footer><span>FountainJS · Built by Paolo Cappuccini</span><span>MIT · TypeScript · Open source</span></footer>
    </main>
  );
}

export default App;
