import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function assertExports(module, names, surface) {
  const missing = names.filter((name) => typeof module[name] === 'undefined');
  if (missing.length) throw new Error(`${surface} is missing: ${missing.join(', ')}`);
}

const coreNames = ['MediaExtension', 'startAssetUpload', 'registerFountainElement'];
const reactNames = ['FountainComposer', 'FountainEditor', 'FountainToolbar', 'FountainSlashCommandMenu'];
const documentUtilityNames = ['MentionExtension', 'EmojiExtension', 'TypographyExtension', 'CharacterCountExtension', 'SlashCommandExtension', 'SuggestionController'];
const emojiDataNames = ['unicodeEmojis', 'UnicodeEmojiExtension'];

assertExports(await import('fountainjs-editor'), coreNames, 'ESM package root');
assertExports(await import('fountainjs-editor/document-utilities'), documentUtilityNames, 'ESM document utilities entry');
const esmEmojiData = await import('fountainjs-editor/emoji-data');
assertExports(esmEmojiData, emojiDataNames, 'ESM Unicode emoji data entry');
if (esmEmojiData.unicodeEmojis.length < 1_900) throw new Error('ESM Unicode emoji data entry is incomplete.');
assertExports(await import('fountainjs-editor/react'), reactNames, 'ESM React entry');
assertExports(require('fountainjs-editor'), coreNames, 'CommonJS package root');
assertExports(require('fountainjs-editor/document-utilities'), documentUtilityNames, 'CommonJS document utilities entry');
const cjsEmojiData = require('fountainjs-editor/emoji-data');
assertExports(cjsEmojiData, emojiDataNames, 'CommonJS Unicode emoji data entry');
if (cjsEmojiData.unicodeEmojis.length < 1_900) throw new Error('CommonJS Unicode emoji data entry is incomplete.');
assertExports(require('fountainjs-editor/react'), reactNames, 'CommonJS React entry');

console.log('ESM, CommonJS, document utilities, full emoji data, React, and Web Component package exports loaded successfully.');
