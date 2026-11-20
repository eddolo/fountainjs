import type { FountainExtension, Node } from 'fountainjs-editor';
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

type NodeWriter = (node: Node) => string;
export function readGitLabNodeSerializers(config: GitLabHostConfiguration['serializerConfig'], extensions: readonly FountainExtension[] = []): ReadonlyMap<string, NodeWriter> {
  const writers = new Map<string, NodeWriter>();
  if (config == null) return writers;
  const refuse = (): never => { throw new Error('GITLAB_NATIVE_SERIALIZER_ADAPTER_REQUIRED'); };
  if (typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(key => key !== 'marks' && key !== 'nodes')) refuse();
  if (Object.hasOwn(config, 'marks') && !emptyRecord(config.marks)) refuse();
  if (!Object.hasOwn(config, 'nodes')) return writers;
  const nodes = config.nodes;
  if (nodes === null || typeof nodes !== 'object' || Array.isArray(nodes)) return refuse();
  for (const [name, rule] of Object.entries(nodes)) {
    if (!extensions.some(extension => extension.nodes && Object.hasOwn(extension.nodes, name))
      || !rule || typeof rule !== 'object' || Object.keys(rule).length !== 1
      || !Object.hasOwn(rule, 'toMarkdown') || typeof rule.toMarkdown !== 'function') refuse();
    const write: NodeWriter = rule.toMarkdown;
    writers.set(name, node => {
      const source = write(node);
      if (typeof source !== 'string') throw new TypeError('Invalid GitLab Markdown result for ' + name);
      return source;
    });
  }
  return writers;
}

/** Default callers accept inactive settings only. The native candidate opts into
 * its explicit source/range adapter; unknown active contracts still refuse. */
export function assertGitLabNativeHostConfiguration(options: GitLabHostConfiguration, native: { codeSuggestions?: boolean; extensions?: readonly FountainExtension[] } = {}): void {
  if (options.collaborationProvider != null)
    throw new Error('GITLAB_NATIVE_COLLABORATION_ADAPTER_REQUIRED');
  readGitLabNodeSerializers(options.serializerConfig, native.extensions);
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
