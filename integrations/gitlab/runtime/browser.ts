export { GitLabContentEditor, GitLabEditorNotReady } from '../services/content_editor';
export { assertGitLabNativeHostConfiguration } from '../services/host_configuration';
export { getGitLabLinkContext } from '../services/link_editing';
export { getGitLabCodeContext } from '../services/code_editing';
export {
  EditorView,
  Selection,
  toggleMark,
  isMarkActive,
  setBlockType,
  toggleQuote,
  insertList,
  toggleList,
  selectAll,
  insertTable,
  insertInlineImage,
  setLink,
  unsetLink,
  insertText,
  splitBlock,
  insertBlock,
  undo,
  redo,
  canUndo,
  canRedo,
  createKaTeXRenderer,
} from 'fountainjs-editor';
