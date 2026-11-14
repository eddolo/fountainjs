/** Contracts inspected in the pinned GitLab AutocompleteHelper and SuggestionsDropdown. */
export type GitLabAutocompleteKind = 'user' | 'issue' | 'issue_alternative' | 'work_item' | 'merge_request'
  | 'label' | 'milestone' | 'snippet' | 'epic' | 'epic_alternative' | 'iteration' | 'vulnerability' | 'status' | 'type' | 'wiki';
export interface GitLabAutocompleteItem {
  readonly id: string;
  readonly kind: GitLabAutocompleteKind;
  readonly label: string;
  readonly description: string;
  readonly source: string;
}
export interface GitLabAutocompleteRequest {
  readonly kind: GitLabAutocompleteKind;
  readonly query: string;
  readonly command: string;
  readonly prioritizeUsernames: readonly string[];
  readonly signal: AbortSignal;
}
export type GitLabAutocompleteProvider = (request: GitLabAutocompleteRequest) => Promise<readonly GitLabAutocompleteItem[]>;

export const gitLabAutocompleteSources: Readonly<Record<GitLabAutocompleteKind, string | null>> = Object.freeze({
  user: 'members', issue: 'issues', issue_alternative: 'issues', work_item: 'issues', merge_request: 'mergeRequests',
  label: 'labels', milestone: 'milestones', snippet: 'snippets', epic: 'epics', epic_alternative: 'epics',
  iteration: 'iterations', vulnerability: 'vulnerabilities', status: null, type: null, wiki: 'wikis',
});
export const gitLabAutocompleteTriggers: Readonly<Record<string, GitLabAutocompleteKind>> = Object.freeze({
  '@': 'user', '#': 'issue', '[issue:': 'issue_alternative', '[work_item:': 'work_item', '!': 'merge_request',
  '~': 'label', '%': 'milestone', '$': 'snippet', '&': 'epic', '[epic:': 'epic_alternative',
  '*iteration:': 'iteration', '[vulnerability:': 'vulnerability', '[[': 'wiki',
});
export const gitLabCommandArgumentTriggers: Readonly<Record<string, string>> = Object.freeze({
  label: '~', labels: '~', unlabel: '~', remove_label: '~', relabel: '~', assign: '@', unassign: '@', reassign: '@',
  assign_reviewer: '@', unassign_reviewer: '@', reassign_reviewer: '@', request_review: '@', milestone: '%',
  iteration: '*iteration:', status: '"', type: '"',
});
const invalid = (): never => { throw new Error('GITLAB_AUTOCOMPLETE_RESPONSE_INVALID'); };
function line(value: unknown, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value) || value.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value)) return invalid();
  return value;
}
function identifier(value: unknown): string {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^[1-9]\d{0,15}$/u.test(text) || !Number.isSafeInteger(Number(text))) return invalid();
  return text;
}
function reference(value: unknown, fallback: () => string): string {
  if (value === undefined || value === null || value === '') return fallback();
  return line(value);
}
const quoted = (value: string) => /\W/u.test(value) ? JSON.stringify(value) : value;
const wikiEscape = (value: string) => value.replace(/[()"\\]/gu, '\\$&');

/** No invented row IDs, guessed hrefs or successful empty envelopes on failure. */
export function parseGitLabAutocompleteItems(kind: GitLabAutocompleteKind, value: unknown): readonly GitLabAutocompleteItem[] {
  if (!Object.hasOwn(gitLabAutocompleteSources, kind) || !Array.isArray(value) || value.length > 10000) return invalid();
  const bySource = new Map<string, GitLabAutocompleteItem>();
  for (const record of value) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return invalid();
    let source: string, label: string, description = '';
    switch (kind) {
      case 'user': {
        const username = line(record.username);
        if (/[\s@<>[\](){}"'\\]/u.test(username)) return invalid();
        source = '@' + username; label = source; description = line(record.name ?? '', true); break;
      }
      case 'label': label = line(record.title); source = '~' + quoted(label); break;
      case 'milestone':
        identifier(record.iid); label = line(record.title); source = '%' + quoted(label); break;
      case 'status': case 'type': label = line(record.name); source = JSON.stringify(label); break;
      case 'issue': case 'issue_alternative': case 'work_item': case 'merge_request':
        source = reference(record.reference, () => (kind === 'merge_request' ? '!' : '#') + identifier(record.iid));
        label = source; description = line(record.title); break;
      case 'snippet': source = '$' + identifier(record.id); label = source; description = line(record.title); break;
      case 'vulnerability': source = '[vulnerability:' + identifier(record.id) + ']'; label = source; description = line(record.title); break;
      case 'epic': case 'epic_alternative': case 'iteration':
        source = line(record.reference); label = source; description = line(record.title); break;
      case 'wiki': {
        label = line(record.title); const slug = line(record.slug);
        if (/[\[\]|]/u.test(label + slug)) return invalid();
        source = '[[' + label + (label.toLowerCase() === wikiEscape(slug).toLowerCase() ? '' : '|' + wikiEscape(slug)) + ']]'; break;
      }
    }
    const item = Object.freeze({ id: `${kind}:${source}`, kind, source, label, description });
    const previous = bySource.get(source);
    if (previous && (previous.label !== label || previous.description !== description)) return invalid();
    bySource.set(source, item);
  }
  return Object.freeze([...bySource.values()]);
}
