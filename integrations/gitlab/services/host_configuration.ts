import type { FountainExtension, Mark, Node } from 'fountainjs-editor';
import { readGitLabSuggestionContext } from './code_suggestion_editing';
export interface GitLabHostConfiguration {
  collaborationProvider?: unknown;
  serializerConfig?: Record<string, unknown> | null;
  codeSuggestionsConfig?: Record<string, unknown> | null;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const refuseSerializer = (): never => { throw new Error('GITLAB_NATIVE_SERIALIZER_ADAPTER_REQUIRED'); };
export type GitLabMarkWriter = (mark: Mark) => { open: string; close: string };

type NodeWriter = (node: Node) => string;
export function readGitLabSerializers(config: GitLabHostConfiguration['serializerConfig'], extensions: readonly FountainExtension[] = []) {
  const nodeWriters = new Map<string, NodeWriter>();
  const markWriters = new Map<string, GitLabMarkWriter>();
  if (config == null) return {nodeWriters, markWriters};
  if (!record(config) || Object.keys(config).some(key => key !== 'marks' && key !== 'nodes')) return refuseSerializer();
  const marks = Object.hasOwn(config, 'marks') ? config.marks : {};
  const nodes = Object.hasOwn(config, 'nodes') ? config.nodes : {};
  if (!record(marks) || !record(nodes)) return refuseSerializer();
  for (const [name, rule] of Object.entries(marks)) {
    const extension = extensions.find(item => item.marks && Object.hasOwn(item.marks, name));
    if (!extension || !record(rule)) return refuseSerializer();
    if (Object.keys(rule).length === 1 && Object.hasOwn(rule, 'toMarkdown') && typeof rule.toMarkdown === 'function') {
      const write = rule.toMarkdown;
      markWriters.set(name, mark => {
        const pair = write(mark);
        if (!record(pair) || typeof pair.open !== 'string' || typeof pair.close !== 'string')
          throw new TypeError('Invalid GitLab Markdown delimiters for ' + name);
        return { open: pair.open, close: pair.close };
      });
    } else {
      if (Object.keys(rule).length !== 2 || !Object.hasOwn(rule, 'open') || !Object.hasOwn(rule, 'close')
        || typeof rule.open !== 'string' || typeof rule.close !== 'string'
        || Object.keys(extension.marks![name].attrs ?? {}).length) return refuseSerializer();
      const pair = {open:rule.open, close:rule.close};
      markWriters.set(name, () => pair);
    }
  }
  for (const [name, rule] of Object.entries(nodes)) {
    if (!extensions.some(extension => extension.nodes && Object.hasOwn(extension.nodes, name))
      || !record(rule) || Object.keys(rule).length !== 1
      || !Object.hasOwn(rule, 'toMarkdown') || typeof rule.toMarkdown !== 'function') return refuseSerializer();
    const write = rule.toMarkdown;
    nodeWriters.set(name, node => {
      const source = write(node);
      if (typeof source !== 'string') throw new TypeError('Invalid GitLab Markdown result for ' + name);
      return source;
    });
  }
  return {nodeWriters, markWriters};
}

/** Default callers accept inactive settings only. The native candidate opts into
 * its explicit source/range adapter; unknown active contracts still refuse. */
export function assertGitLabNativeHostConfiguration(options: GitLabHostConfiguration, native: { codeSuggestions?: boolean; extensions?: readonly FountainExtension[] } = {}): void {
  if (options.collaborationProvider != null)
    throw new Error('GITLAB_NATIVE_COLLABORATION_ADAPTER_REQUIRED');
  readGitLabSerializers(options.serializerConfig, native.extensions);
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
