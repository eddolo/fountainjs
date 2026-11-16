import { readGitLabSuggestionContext } from './code_suggestion_editing';
export interface GitLabHostConfiguration {
  collaborationProvider?: unknown;
  serializerConfig?: Record<string, unknown> | null;
  codeSuggestionsConfig?: Record<string, unknown> | null;
}

const emptyRecord = (value: unknown): boolean =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === 0;

/** Default callers accept inactive settings only. The native candidate opts into
 * its explicit source/range adapter; unknown active contracts still refuse. */
export function assertGitLabNativeHostConfiguration(options: GitLabHostConfiguration, native: { codeSuggestions?: boolean } = {}): void {
  if (options.collaborationProvider != null)
    throw new Error('GITLAB_NATIVE_COLLABORATION_ADAPTER_REQUIRED');
  const serializer = options.serializerConfig ?? {};
  if (
    Object.keys(serializer).some(
      (key) => !['marks', 'nodes'].includes(key) || !emptyRecord(serializer[key]),
    )
  )
    throw new Error('GITLAB_NATIVE_SERIALIZER_ADAPTER_REQUIRED');
  const suggestions = options.codeSuggestionsConfig ?? {};
  if (native.codeSuggestions) {
    try { if (readGitLabSuggestionContext(suggestions)) return; }
    catch { throw new Error('GITLAB_NATIVE_SUGGESTIONS_ADAPTER_REQUIRED'); }
  }
  for (const [key, value] of Object.entries(suggestions)) {
    if ((key === 'canSuggest' || key === 'showPopover') && value === false) continue;
    if (key === 'lineType' && value === '') continue;
    if (key === 'lines' && Array.isArray(value) && value.length === 0) continue;
    // NoteForm supplies these fields even for ordinary replies and edits.
    if ((key === 'blobRawPath' || key === 'lineRange') && value === null) continue;
    throw new Error('GITLAB_NATIVE_SUGGESTIONS_ADAPTER_REQUIRED');
  }
}
