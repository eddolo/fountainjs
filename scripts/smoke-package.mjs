import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function assertExports(module, names, surface) {
  const missing = names.filter((name) => typeof module[name] === 'undefined');
  if (missing.length) throw new Error(`${surface} is missing: ${missing.join(', ')}`);
}

const coreNames = [
  'MediaExtension', 'startAssetUpload', 'registerFountainElement', 'BubbleMenuExtension',
  'FloatingMenuExtension', 'getEditorMenuAnchorRect', 'moveNode', 'canMoveNode',
  'BlockHandleManager', 'FOUNTAIN_NODE_DRAG_TYPE',
  'getCollaborationAdapter', 'replaceCollaborationAdapter',
  'createLeanLoopbackProvider',
  'createStreamingAIAdapter',
];
const headlessCoreNames = [
  'Schema', 'Editor', 'createEditor', 'Selection', 'Transaction', 'Plugin',
  'composeExtensions', 'defineExtension', 'createCommandManager',
  'createHistoryPlugin', 'MarkdownImporter', 'MarkdownExporter', 'MarkdownSourceSnapshot',
  'HTMLExporter', 'JSONExporter', 'TextExporter', 'FountainDocumentMigrator',
  'StableNodeIdIndex', 'defineStructuredAttribute',
  'createCoreCollaborationExtension', 'getCollaborationState',
];
const aiDocumentToolNames = ['AI_DOCUMENT_TOOL_NAMES', 'AI_DOCUMENT_TOOL_DEFINITIONS', 'AIDocumentToolbox', 'createAIDocumentToolbox'];
const aiConversationNames = ['AIConversationController', 'InMemoryAIConversationStore', 'InMemoryAIPromptStore', 'createAIConversationAdapter', 'createStreamingAIConversationAdapter', 'defineAIPromptTemplate', 'renderAIPrompt'];
const reactNames = [
  'FountainComposer', 'FountainEditor', 'FountainToolbar', 'FountainToolbarRoot',
  'FountainToolbarGroup', 'FountainToolbarButton', 'FountainToolbarIcon',
  'defaultFountainToolbarGroups', 'FountainSlashCommandMenu', 'FountainBubbleMenu',
  'FountainFloatingMenu', 'Navigator', 'useNavigatorState',
  'useNavigatorTableOfContentsState', 'useFountain', 'FountainAIConversation',
];
const documentUtilityNames = ['MentionExtension', 'EmojiExtension', 'TypographyExtension', 'CharacterCountExtension', 'SlashCommandExtension', 'SuggestionController'];
const emojiDataNames = ['unicodeEmojis', 'UnicodeEmojiExtension'];
const yjsNames = ['YjsCollaborationAdapter', 'createYjsCollaborationExtension'];
const commentsNames = ['InMemoryCommentsStore', 'createCommentsExtension', 'createCommentThread'];
const reactCommentsNames = ['FountainComments'];
const trackedChangesNames = ['createTrackedChangesExtension', 'acceptTrackedSuggestion', 'rejectTrackedSuggestion'];
const reactTrackedChangesNames = ['FountainTrackedChanges'];
const versionsNames = ['InMemoryVersionProvider', 'VersionController', 'compareVersionDocuments', 'versionContentFingerprint'];
const reactVersionsNames = ['FountainVersions'];
const reactIntegrityNames = ['FountainIntegrityInspector'];
const detailsNames = ['DetailsExtension', 'insertDetails', 'wrapInDetails', 'unwrapDetails', 'toggleDetailsOpen'];
const rubyNames = ['RubyExtension', 'createRubyExtension', 'setRuby', 'updateRuby', 'unsetRuby', 'toggleRuby'];
const textStyleNames = ['TextStyleExtension', 'setTextColor', 'setBackgroundColor', 'setFontFamily', 'setFontSize', 'setLineHeight', 'getActiveTextStyle'];
const testingNames = ['checkExtensionConformance', 'assertExtensionConformance', 'checkExtensionCompatibility', 'assertExtensionCompatibility'];
const migrationNames = ['FOUNTAIN_DOCUMENT_FORMAT', 'FOUNTAIN_DOCUMENT_VERSION', 'FountainDocumentMigrator', 'defineFountainDocumentMigration', 'createFountainDocumentMigrator', 'encodeFountainDocument', 'migrateFountainDocument'];
const nodeIdNames = ['StableNodeIdsExtension', 'StableNodeIdIndex', 'createStableNodeIdsExtension', 'createStableNodeIdIndex', 'normalizeStableNodeIds', 'normalizeStableNodeIdJSON', 'getNodeById', 'updateNodeById', 'selectNodeById'];
const tableOfContentsNames = ['TableOfContentsExtension', 'createTableOfContentsExtension', 'buildTableOfContents', 'createTableOfContentsState', 'getTableOfContentsState', 'navigateTableOfContents', 'tableOfContentsKey'];
const integrityNames = ['scanInvisibleCharacters', 'inspectTextIntegrity', 'previewTextSanitization', 'sanitizeText', 'inspectSelectionIntegrity', 'previewSelectionSanitization', 'applySelectionSanitization'];
const integrityDOMNames = ['InvisibleCharacterExtension', 'createInvisibleCharacterExtension', 'getIntegrityDisplayState', 'setShowInvisibles', 'toggleShowInvisibles', 'setVerbatimMode', 'integrityDisplayKey'];
const structuredAttributeNames = ['STRUCTURED_ATTRIBUTE_TRANSACTION_META', 'defineStructuredAttribute', 'validateStructuredAttributeValue', 'getStructuredAttribute', 'setStructuredAttribute', 'deleteStructuredAttribute', 'insertStructuredAttributeItems', 'deleteStructuredAttributeItems'];
const serverHTMLNames = ['ServerHTMLImporter', 'HTMLImportLimitError'];
const widgetNames = ['WIDGET_TRANSACTION_META', 'DEFAULT_WIDGET_KEY_POLICY', 'defineWidget', 'validateWidgetAttributes', 'createWidgetNode', 'insertWidget', 'getWidgetNode', 'updateWidget', 'removeWidget', 'exitWidget', 'createWidgetController', 'createWidgetExtension'];
const widgetDOMNames = ['createDOMWidgetNodeView', 'createDOMWidgetExtension'];
const reactWidgetNames = ['createReactWidgetNodeView', 'createReactWidgetExtension'];
const pagesNames = ['PagesExtension', 'createPagesExtension', 'createPageGeometry', 'layoutPages', 'projectPagePresentation', 'insertPageBreak', 'insertFootnote', 'inspectFootnotes', 'removeFootnote', 'setPageTemplate', 'insertPageField', 'inspectPageTemplates', 'resolvePageField'];
const pagesDOMNames = ['measureDOMPageFlow', 'layoutDOMPages', 'projectDOMPageContent', 'DOMPageLayoutController', 'createDOMPageLayoutController', 'DOMEditablePageSurface', 'DOMEditablePageController', 'createDOMEditablePageController'];
const pagesPreviewNames = ['renderDOMPagePreview'];

const esmCore = await import('fountainjs-editor');
assertExports(esmCore, coreNames, 'ESM package root');
const esmHeadlessCore = await import('fountainjs-editor/core');
assertExports(esmHeadlessCore, headlessCoreNames, 'ESM headless core entry');
const esmAIDocumentTools = await import('fountainjs-editor/ai/document-tools');
assertExports(esmAIDocumentTools, aiDocumentToolNames, 'ESM AI document tools entry');
const esmAIConversation = await import('fountainjs-editor/ai/conversation');
assertExports(esmAIConversation, aiConversationNames, 'ESM AI conversation entry');
const markdownSource = '\uFEFF---\r\ntitle: Packed source\r\n---\r\n# Exact\r\n';
const markdownSchema = new esmHeadlessCore.Schema(esmCore.CoreSchemaSpec);
const sourcedMarkdown = esmHeadlessCore.MarkdownImporter.parseWithSource(markdownSource, markdownSchema);
const exactMarkdown = esmHeadlessCore.MarkdownExporter.exportWithSource(sourcedMarkdown.document, sourcedMarkdown.source);
if (exactMarkdown.markdown !== markdownSource || exactMarkdown.preservation !== 'exact') {
  throw new Error('ESM headless core did not preserve unchanged Markdown source.');
}
const changedMarkdown = markdownSchema.node('doc', {}, [
  markdownSchema.node('paragraph', {}, [markdownSchema.text('Changed')]),
]);
const frontmatterMarkdown = esmHeadlessCore.MarkdownExporter.exportWithSource(changedMarkdown, sourcedMarkdown.source);
if (frontmatterMarkdown.markdown !== '\uFEFF---\r\ntitle: Packed source\r\n---\r\nChanged'
  || frontmatterMarkdown.preservation !== 'frontmatter') {
  throw new Error('ESM headless core did not preserve Markdown frontmatter after a visual edit.');
}
const blockSource = '# Source spelling ###\r\n\r\nOriginal  spacing';
const blockMarkdown = esmHeadlessCore.MarkdownImporter.parseWithSource(blockSource, markdownSchema);
const blockChanged = markdownSchema.node('doc', {}, [
  blockMarkdown.document.content[0],
  markdownSchema.node('paragraph', {}, [markdownSchema.text('Changed')]),
]);
const preservedBlocks = esmHeadlessCore.MarkdownExporter.exportWithSource(blockChanged, blockMarkdown.source);
if (preservedBlocks.markdown !== '# Source spelling ###\r\n\r\nChanged'
  || preservedBlocks.preservation !== 'blocks') {
  throw new Error('ESM headless core did not preserve aligned Markdown source blocks.');
}
const structurallyChanged = markdownSchema.node('doc', {}, [
  markdownSchema.node('paragraph', {}, [markdownSchema.text('Inserted')]),
  ...blockMarkdown.document.content,
]);
const mappedBlocks = esmHeadlessCore.MarkdownExporter.exportWithSource(structurallyChanged, blockMarkdown.source);
if (mappedBlocks.markdown !== 'Inserted\r\n\r\n# Source spelling ###\r\n\r\nOriginal  spacing'
  || mappedBlocks.preservation !== 'mapped-blocks') {
  throw new Error('ESM headless core did not preserve uniquely mapped Markdown blocks through insertion.');
}
const packedCodeSpan = esmHeadlessCore.MarkdownImporter.parse('Use ``a ` tick``.', markdownSchema);
if (packedCodeSpan.textContent !== 'Use a ` tick.'
  || esmHeadlessCore.MarkdownExporter.export(packedCodeSpan) !== 'Use ``a ` tick``.') {
  throw new Error('ESM headless core did not round-trip a variable-delimiter Markdown code span.');
}
const packedEntities = esmHeadlessCore.MarkdownImporter.parse('Packed &copy; / \\&copy;', markdownSchema);
if (packedEntities.textContent !== 'Packed © / &copy;'
  || esmHeadlessCore.MarkdownExporter.export(packedEntities) !== 'Packed © / \\&copy;') {
  throw new Error('ESM headless core did not decode and protect strict Markdown character references.');
}
const packedRelativeLink = esmHeadlessCore.MarkdownImporter.parse('[Guide](docs/(stable) "Local")', markdownSchema);
const packedRelativeMark = packedRelativeLink.child(0).child(0).marks.find((mark) => mark.type.name === 'link');
if (packedRelativeMark?.attrs.href !== 'docs/(stable)' || packedRelativeMark.attrs.title !== 'Local') {
  throw new Error('ESM headless core did not parse a safe balanced relative Markdown link.');
}
assertExports(await import('fountainjs-editor/document-utilities'), documentUtilityNames, 'ESM document utilities entry');
const esmEmojiData = await import('fountainjs-editor/emoji-data');
assertExports(esmEmojiData, emojiDataNames, 'ESM Unicode emoji data entry');
if (esmEmojiData.unicodeEmojis.length < 1_900) throw new Error('ESM Unicode emoji data entry is incomplete.');
assertExports(await import('fountainjs-editor/react'), reactNames, 'ESM React entry');
const esmYjs = await import('fountainjs-editor/yjs');
assertExports(esmYjs, yjsNames, 'ESM Yjs entry');
assertExports(await import('fountainjs-editor/comments'), commentsNames, 'ESM comments entry');
assertExports(await import('fountainjs-editor/react/comments'), reactCommentsNames, 'ESM React comments entry');
assertExports(await import('fountainjs-editor/tracked-changes'), trackedChangesNames, 'ESM tracked changes entry');
assertExports(await import('fountainjs-editor/react/tracked-changes'), reactTrackedChangesNames, 'ESM React tracked changes entry');
assertExports(await import('fountainjs-editor/versions'), versionsNames, 'ESM versions entry');
assertExports(await import('fountainjs-editor/react/versions'), reactVersionsNames, 'ESM React versions entry');
assertExports(await import('fountainjs-editor/react/integrity'), reactIntegrityNames, 'ESM React integrity entry');
assertExports(await import('fountainjs-editor/details'), detailsNames, 'ESM details entry');
assertExports(await import('fountainjs-editor/ruby'), rubyNames, 'ESM ruby entry');
assertExports(await import('fountainjs-editor/text-style'), textStyleNames, 'ESM text style entry');
assertExports(await import('fountainjs-editor/testing'), testingNames, 'ESM extension testing entry');
assertExports(await import('fountainjs-editor/migrations'), migrationNames, 'ESM document migrations entry');
assertExports(await import('fountainjs-editor/node-ids'), nodeIdNames, 'ESM stable node IDs entry');
const esmTableOfContents = await import('fountainjs-editor/table-of-contents');
assertExports(esmTableOfContents, tableOfContentsNames, 'ESM table of contents entry');
const packedOutline = esmTableOfContents.buildTableOfContents(markdownSchema.node('doc', {}, [
  markdownSchema.node('heading', { level: 1 }, [markdownSchema.text('Packed outline')]),
]));
if (packedOutline.entries.length !== 1 || packedOutline.entries[0]?.title !== 'Packed outline') {
  throw new Error('ESM table of contents did not index a document in pure Node.');
}
const esmIntegrity = await import('fountainjs-editor/integrity');
assertExports(esmIntegrity, integrityNames, 'ESM text integrity entry');
const packedIntegrity = esmIntegrity.inspectTextIntegrity('safe\u200btext');
if (packedIntegrity.invisibleCharacters[0]?.kind !== 'zero-width-space') {
  throw new Error('ESM text integrity entry did not inspect Unicode in pure Node.');
}
assertExports(await import('fountainjs-editor/integrity/dom'), integrityDOMNames, 'ESM integrity DOM entry');
assertExports(await import('fountainjs-editor/structured-attributes'), structuredAttributeNames, 'ESM structured attributes entry');
const esmServerHTML = await import('fountainjs-editor/html/server');
assertExports(esmServerHTML, serverHTMLNames, 'ESM server HTML entry');
const esmServerDocument = esmServerHTML.ServerHTMLImporter.parse('<h2>Pure Node</h2><p><strong>without jsdom</strong></p>', new esmCore.Schema(esmCore.CoreSchemaSpec));
if (esmServerDocument.textContent !== 'Pure Nodewithout jsdom') throw new Error('ESM server HTML import failed.');
assertExports(await import('fountainjs-editor/widgets'), widgetNames, 'ESM widgets entry');
assertExports(await import('fountainjs-editor/widgets/dom'), widgetDOMNames, 'ESM DOM widgets entry');
assertExports(await import('fountainjs-editor/react/widgets'), reactWidgetNames, 'ESM React widgets entry');
assertExports(await import('fountainjs-editor/pages'), pagesNames, 'ESM pages entry');
assertExports(await import('fountainjs-editor/pages/dom'), pagesDOMNames, 'ESM DOM page measurement entry');
assertExports(await import('fountainjs-editor/pages/preview'), pagesPreviewNames, 'ESM page preview entry');
if ('document' in globalThis || 'window' in globalThis) {
  throw new Error('Package smoke unexpectedly has browser globals.');
}
const portableDocumentExtension = esmHeadlessCore.defineExtension({
  name: 'package-headless-document',
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline', inline: true },
  },
  commands: { insertText: esmHeadlessCore.insertText },
});
let collaborationContext;
const headlessCollaboration = esmHeadlessCore.createCoreCollaborationExtension({
  adapter: () => ({ connect(context) { collaborationContext = context; } }),
});
const headlessKit = esmHeadlessCore.composeExtensions([portableDocumentExtension, headlessCollaboration]);
const headlessEditor = esmHeadlessCore.createEditor({
  schema: headlessKit.schema,
  plugins: headlessKit.plugins,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Packed core' }] }] },
});
if (!collaborationContext || esmHeadlessCore.getCollaborationState(headlessEditor)?.status !== 'connected') {
  throw new Error('Packed core collaboration did not connect in pure Node.');
}
const packedAgentTools = esmAIDocumentTools.createAIDocumentToolbox(headlessEditor);
const packedAgentProposal = packedAgentTools.preview([{
  kind: 'replace', target: 'text',
  from: { path: [0, 0], offset: 0 }, to: { path: [0, 0], offset: 6 }, text: 'Reviewed',
}]);
if (headlessEditor.getText() !== 'Packed core'
  || packedAgentTools.read({ proposalId: packedAgentProposal.id, path: [0, 0] }).records[0]?.text !== 'Reviewed core') {
  throw new Error('Packed AI document tools mutated before human acceptance or returned a bad preview.');
}
packedAgentTools.accept(packedAgentProposal);
if (headlessEditor.getText() !== 'Reviewed core') throw new Error('Packed AI document tools did not apply in pure Node.');
const packedConversationStore = new esmAIConversation.InMemoryAIConversationStore();
const packedConversation = new esmAIConversation.AIConversationController({
  threadId: 'packed-thread', store: packedConversationStore, autoLoad: false,
  adapter: esmAIConversation.createAIConversationAdapter(async (request) => `Messages: ${request.messages.length}`),
});
await packedConversation.send('Pure Node conversation');
if (packedConversation.getSnapshot().thread?.messages[1]?.content !== 'Messages: 1') {
  throw new Error('Packed AI conversation did not preserve host-owned multi-turn history in pure Node.');
}
const packedPrompt = esmAIConversation.defineAIPromptTemplate({
  id: 'packed-prompt', title: 'Packed prompt', template: 'Explain {{topic}}.', updatedAt: new Date().toISOString(),
});
if (esmAIConversation.renderAIPrompt(packedPrompt, { topic: 'Fountain' }) !== 'Explain Fountain.') {
  throw new Error('Packed reusable AI prompt did not render in pure Node.');
}
packedConversation.destroy();
headlessEditor.destroy();

const Y = await import('yjs');
const ydoc = new Y.Doc();
const yjsExtension = esmYjs.createYjsCollaborationExtension({
  document: ydoc,
  user: { id: 'package-smoke', name: 'Package smoke', color: '#6d45ff' },
});
const yjsKit = esmHeadlessCore.composeExtensions([portableDocumentExtension, yjsExtension]);
const yjsEditor = esmHeadlessCore.createEditor({
  schema: yjsKit.schema,
  plugins: yjsKit.plugins,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Packed Yjs' }] }] },
});
if (ydoc.getXmlFragment('fountain').length === 0) throw new Error('Packed Yjs did not initialize in pure Node.');
yjsEditor.destroy();
ydoc.destroy();
const cjsCore = require('fountainjs-editor');
assertExports(cjsCore, coreNames, 'CommonJS package root');
const cjsHeadlessCore = require('fountainjs-editor/core');
assertExports(cjsHeadlessCore, headlessCoreNames, 'CommonJS headless core entry');
assertExports(require('fountainjs-editor/ai/document-tools'), aiDocumentToolNames, 'CommonJS AI document tools entry');
assertExports(require('fountainjs-editor/ai/conversation'), aiConversationNames, 'CommonJS AI conversation entry');
const cjsMarkdownSchema = new cjsHeadlessCore.Schema(cjsCore.CoreSchemaSpec);
const cjsSourcedMarkdown = cjsHeadlessCore.MarkdownImporter.parseWithSource(markdownSource, cjsMarkdownSchema);
if (cjsHeadlessCore.MarkdownExporter.exportWithSource(cjsSourcedMarkdown.document, cjsSourcedMarkdown.source).markdown !== markdownSource) {
  throw new Error('CommonJS headless core did not preserve unchanged Markdown source.');
}
assertExports(require('fountainjs-editor/document-utilities'), documentUtilityNames, 'CommonJS document utilities entry');
const cjsEmojiData = require('fountainjs-editor/emoji-data');
assertExports(cjsEmojiData, emojiDataNames, 'CommonJS Unicode emoji data entry');
if (cjsEmojiData.unicodeEmojis.length < 1_900) throw new Error('CommonJS Unicode emoji data entry is incomplete.');
assertExports(require('fountainjs-editor/react'), reactNames, 'CommonJS React entry');
assertExports(require('fountainjs-editor/comments'), commentsNames, 'CommonJS comments entry');
assertExports(require('fountainjs-editor/react/comments'), reactCommentsNames, 'CommonJS React comments entry');
assertExports(require('fountainjs-editor/tracked-changes'), trackedChangesNames, 'CommonJS tracked changes entry');
assertExports(require('fountainjs-editor/react/tracked-changes'), reactTrackedChangesNames, 'CommonJS React tracked changes entry');
assertExports(require('fountainjs-editor/versions'), versionsNames, 'CommonJS versions entry');
assertExports(require('fountainjs-editor/react/versions'), reactVersionsNames, 'CommonJS React versions entry');
assertExports(require('fountainjs-editor/react/integrity'), reactIntegrityNames, 'CommonJS React integrity entry');
assertExports(require('fountainjs-editor/details'), detailsNames, 'CommonJS details entry');
assertExports(require('fountainjs-editor/ruby'), rubyNames, 'CommonJS ruby entry');
assertExports(require('fountainjs-editor/text-style'), textStyleNames, 'CommonJS text style entry');
assertExports(require('fountainjs-editor/testing'), testingNames, 'CommonJS extension testing entry');
assertExports(require('fountainjs-editor/migrations'), migrationNames, 'CommonJS document migrations entry');
assertExports(require('fountainjs-editor/node-ids'), nodeIdNames, 'CommonJS stable node IDs entry');
assertExports(require('fountainjs-editor/table-of-contents'), tableOfContentsNames, 'CommonJS table of contents entry');
assertExports(require('fountainjs-editor/integrity'), integrityNames, 'CommonJS text integrity entry');
assertExports(require('fountainjs-editor/integrity/dom'), integrityDOMNames, 'CommonJS integrity DOM entry');
assertExports(require('fountainjs-editor/structured-attributes'), structuredAttributeNames, 'CommonJS structured attributes entry');
const cjsServerHTML = require('fountainjs-editor/html/server');
assertExports(cjsServerHTML, serverHTMLNames, 'CommonJS server HTML entry');
const cjsServerDocument = cjsServerHTML.ServerHTMLImporter.parse('<p>CommonJS Node</p>', new cjsCore.Schema(cjsCore.CoreSchemaSpec));
if (cjsServerDocument.textContent !== 'CommonJS Node') throw new Error('CommonJS server HTML import failed.');
assertExports(require('fountainjs-editor/widgets'), widgetNames, 'CommonJS widgets entry');
assertExports(require('fountainjs-editor/widgets/dom'), widgetDOMNames, 'CommonJS DOM widgets entry');
assertExports(require('fountainjs-editor/react/widgets'), reactWidgetNames, 'CommonJS React widgets entry');
assertExports(require('fountainjs-editor/pages'), pagesNames, 'CommonJS pages entry');
assertExports(require('fountainjs-editor/pages/dom'), pagesDOMNames, 'CommonJS DOM page measurement entry');
assertExports(require('fountainjs-editor/pages/preview'), pagesPreviewNames, 'CommonJS page preview entry');
const documentSchema = require('fountainjs-editor/schema/document.json');
if (documentSchema.properties?.format?.const !== 'fountainjs' || documentSchema.properties?.version?.minimum !== 1) {
  throw new Error('Published FountainJS document JSON Schema is invalid.');
}
// Loading Yjs' ESM and CommonJS builds in one process creates two constructor
// universes. Exercise the second module system in an isolated consumer process.
execFileSync(process.execPath, ['-e', `
  const module = require('fountainjs-editor/yjs');
  const missing = ${JSON.stringify(yjsNames)}.filter((name) => typeof module[name] === 'undefined');
  if (missing.length) throw new Error('CommonJS Yjs entry is missing: ' + missing.join(', '));
`], { stdio: 'inherit' });

const doctorDirectory = mkdtempSync(join(tmpdir(), 'fountain-doctor-'));
try {
  const validConfig = join(doctorDirectory, 'valid.mjs');
  writeFileSync(validConfig, `export default [Object.freeze({
    name: 'package-smoke',
    manifest: Object.freeze({ version: '1.0.0', apiVersion: 1, requires: Object.freeze(['fountain-core']) }),
  })];\n`);
  const doctorOutput = execFileSync(process.execPath, ['scripts/create-extension.mjs', 'doctor', validConfig], { encoding: 'utf8' });
  if (!doctorOutput.includes('PASS')) throw new Error('Packed doctor did not report success.');

  const invalidConfig = join(doctorDirectory, 'invalid.mjs');
  writeFileSync(invalidConfig, `export default [
    Object.freeze({ name: 'package-smoke', manifest: Object.freeze({ version: '1.0.0', apiVersion: 1 }), commands: Object.freeze({ clash: () => true }) }),
    Object.freeze({ name: 'package-smoke-two', manifest: Object.freeze({ version: '1.0.0', apiVersion: 1 }), commands: Object.freeze({ clash: () => true }) }),
  ];\n`);
  const invalidDoctor = spawnSync(process.execPath, ['scripts/create-extension.mjs', 'doctor', invalidConfig], { encoding: 'utf8' });
  if (invalidDoctor.status !== 1 || !invalidDoctor.stdout.includes('contribution-conflict')) {
    throw new Error('Packed doctor did not reject a contribution collision.');
  }
} finally {
  rmSync(doctorDirectory, { recursive: true, force: true });
}

console.log('ESM, CommonJS, headless core, document utilities, full emoji data, React, comments, tracked changes, versions, details, ruby, text style, extension testing, migrations, stable node IDs, table of contents, text integrity, integrity DOM, React integrity, structured attributes, pure-Node HTML, portable widgets, DOM widgets, React widgets, pages, DOM page measurement, page preview, document schema, Yjs, and Web Component package exports loaded successfully.');
