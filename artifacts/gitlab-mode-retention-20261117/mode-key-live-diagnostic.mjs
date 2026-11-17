import {createHash} from 'node:crypto';

/** Retain one native model per MarkdownEditor owner and document context. */
export function prepareGitLabModeRetention(source) {
  if(createHash('sha256').update(source).digest('hex')!=='697704a24572acc75d9f4d5b6225f3ad9c32a3b32410fabc09a6743d8aa0fca9')
    throw new Error('Inspect the pinned MarkdownEditor mode ownership boundary.');
  return source.replace('  computed: {', `  computed: {
    fountainModeKey() {
      return JSON.stringify([this.renderMarkdownPath, this.uploadsPath, this.autosaveKey,
        this.formFieldProps.id, this.formFieldProps.name, this.supportsQuickActions,
        this.supportsTableOfContents, this.enableAutocomplete, this.drawioEnabled]);
    },`)
    .replace('<div v-else class="md-content-editor-wrapper">', '<div v-show="isContentEditorActive" class="md-content-editor-wrapper">\n      <keep-alive :max="1">')
    .replace('      <content-editor\n', '      <content-editor\n        v-if="isContentEditorActive"\n        :key="fountainModeKey"\n')
    .replace('      </content-editor>\n      <input ref="submissionField"', '      </content-editor>\n      </keep-alive>\n      <input v-if="isContentEditorActive" ref="submissionField"');
}
