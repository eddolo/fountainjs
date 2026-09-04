import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

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
// Loading Yjs' ESM and CommonJS builds in one process creates two constructor
// universes. Exercise the second module system in an isolated consumer process.
execFileSync(process.execPath, ['-e', `
  const module = require('fountainjs-editor/yjs');
  const missing = ${JSON.stringify(yjsNames)}.filter((name) => typeof module[name] === 'undefined');
  if (missing.length) throw new Error('CommonJS Yjs entry is missing: ' + missing.join(', '));
`], { stdio: 'inherit' });

console.log('ESM, CommonJS, document utilities, full emoji data, React, comments, tracked changes, versions, details, ruby, text style, Yjs, and Web Component package exports loaded successfully.');
