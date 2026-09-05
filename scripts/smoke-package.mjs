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
];
const reactNames = [
  'FountainComposer', 'FountainEditor', 'FountainToolbar', 'FountainToolbarRoot',
  'FountainToolbarGroup', 'FountainToolbarButton', 'FountainToolbarIcon',
  'defaultFountainToolbarGroups', 'FountainSlashCommandMenu', 'FountainBubbleMenu',
  'FountainFloatingMenu',
  'useFountain',
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
const detailsNames = ['DetailsExtension', 'insertDetails', 'wrapInDetails', 'unwrapDetails', 'toggleDetailsOpen'];
const rubyNames = ['RubyExtension', 'createRubyExtension', 'setRuby', 'updateRuby', 'unsetRuby', 'toggleRuby'];
const textStyleNames = ['TextStyleExtension', 'setTextColor', 'setBackgroundColor', 'setFontFamily', 'setFontSize', 'setLineHeight', 'getActiveTextStyle'];
const testingNames = ['checkExtensionConformance', 'assertExtensionConformance', 'checkExtensionCompatibility', 'assertExtensionCompatibility'];
const migrationNames = ['FOUNTAIN_DOCUMENT_FORMAT', 'FOUNTAIN_DOCUMENT_VERSION', 'FountainDocumentMigrator', 'defineFountainDocumentMigration', 'createFountainDocumentMigrator', 'encodeFountainDocument', 'migrateFountainDocument'];
const pagesNames = ['PagesExtension', 'createPagesExtension', 'createPageGeometry', 'layoutPages', 'projectPagePresentation', 'insertPageBreak', 'insertFootnote', 'inspectFootnotes', 'removeFootnote', 'setPageTemplate', 'insertPageField', 'inspectPageTemplates', 'resolvePageField'];
const pagesDOMNames = ['measureDOMPageFlow', 'layoutDOMPages', 'projectDOMPageContent', 'DOMPageLayoutController', 'createDOMPageLayoutController'];
const pagesPreviewNames = ['renderDOMPagePreview'];

assertExports(await import('fountainjs-editor'), coreNames, 'ESM package root');
assertExports(await import('fountainjs-editor/document-utilities'), documentUtilityNames, 'ESM document utilities entry');
const esmEmojiData = await import('fountainjs-editor/emoji-data');
assertExports(esmEmojiData, emojiDataNames, 'ESM Unicode emoji data entry');
if (esmEmojiData.unicodeEmojis.length < 1_900) throw new Error('ESM Unicode emoji data entry is incomplete.');
assertExports(await import('fountainjs-editor/react'), reactNames, 'ESM React entry');
assertExports(await import('fountainjs-editor/yjs'), yjsNames, 'ESM Yjs entry');
assertExports(await import('fountainjs-editor/comments'), commentsNames, 'ESM comments entry');
assertExports(await import('fountainjs-editor/react/comments'), reactCommentsNames, 'ESM React comments entry');
assertExports(await import('fountainjs-editor/tracked-changes'), trackedChangesNames, 'ESM tracked changes entry');
assertExports(await import('fountainjs-editor/react/tracked-changes'), reactTrackedChangesNames, 'ESM React tracked changes entry');
assertExports(await import('fountainjs-editor/versions'), versionsNames, 'ESM versions entry');
assertExports(await import('fountainjs-editor/react/versions'), reactVersionsNames, 'ESM React versions entry');
assertExports(await import('fountainjs-editor/details'), detailsNames, 'ESM details entry');
assertExports(await import('fountainjs-editor/ruby'), rubyNames, 'ESM ruby entry');
assertExports(await import('fountainjs-editor/text-style'), textStyleNames, 'ESM text style entry');
assertExports(await import('fountainjs-editor/testing'), testingNames, 'ESM extension testing entry');
assertExports(await import('fountainjs-editor/migrations'), migrationNames, 'ESM document migrations entry');
assertExports(await import('fountainjs-editor/pages'), pagesNames, 'ESM pages entry');
assertExports(await import('fountainjs-editor/pages/dom'), pagesDOMNames, 'ESM DOM page measurement entry');
assertExports(await import('fountainjs-editor/pages/preview'), pagesPreviewNames, 'ESM page preview entry');
assertExports(require('fountainjs-editor'), coreNames, 'CommonJS package root');
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
assertExports(require('fountainjs-editor/details'), detailsNames, 'CommonJS details entry');
assertExports(require('fountainjs-editor/ruby'), rubyNames, 'CommonJS ruby entry');
assertExports(require('fountainjs-editor/text-style'), textStyleNames, 'CommonJS text style entry');
assertExports(require('fountainjs-editor/testing'), testingNames, 'CommonJS extension testing entry');
assertExports(require('fountainjs-editor/migrations'), migrationNames, 'CommonJS document migrations entry');
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

console.log('ESM, CommonJS, document utilities, full emoji data, React, comments, tracked changes, versions, details, ruby, text style, extension testing, migrations, pages, DOM page measurement, page preview, document schema, Yjs, and Web Component package exports loaded successfully.');
