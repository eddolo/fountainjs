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

/** Accept the real host's inactive defaults, never an active legacy adapter. */
export function assertGitLabNativeHostConfiguration(options: GitLabHostConfiguration): void {
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
  for (const [key, value] of Object.entries(suggestions)) {
    if ((key === 'canSuggest' || key === 'showPopover') && value === false) continue;
    if (key === 'lineType' && value === '') continue;
    if (key === 'lines' && Array.isArray(value) && value.length === 0) continue;
    throw new Error('GITLAB_NATIVE_SUGGESTIONS_ADAPTER_REQUIRED');
  }
}
